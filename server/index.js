import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import { Server } from 'socket.io';
import { RoomManager } from './roomManager.js';

const app = express();
const httpServer = createServer(app);
const port = process.env.PORT ?? 3001;
const host = process.env.HOST ?? '0.0.0.0';
const databaseUrl = process.env.DATABASE_URL;
const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:5173';
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const spotifyRedirectUri =
  process.env.SPOTIFY_REDIRECT_URI ?? `http://127.0.0.1:${port}/api/auth/spotify/callback`;
const sessionSecret = process.env.SESSION_SECRET ?? 'dev-session-secret';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../dist');
const schemaPath = path.resolve(__dirname, '../db/schema.sql');
const isProduction = process.env.NODE_ENV === 'production';
const isWatchMode = process.execArgv.includes('--watch');
const authSessionCachePath =
  process.env.SPOTIFY_AUTH_SESSION_CACHE === 'off'
    ? ''
    : process.env.SPOTIFY_AUTH_SESSION_CACHE
    ? path.resolve(process.env.SPOTIFY_AUTH_SESSION_CACHE)
    : isWatchMode
    ? path.resolve(__dirname, '../.spotify-auth-sessions.local.json')
    : '';
const spotifyRateLimitCachePath =
  process.env.SPOTIFY_RATE_LIMIT_CACHE === 'off'
    ? ''
    : process.env.SPOTIFY_RATE_LIMIT_CACHE
    ? path.resolve(process.env.SPOTIFY_RATE_LIMIT_CACHE)
    : isWatchMode
    ? path.resolve(__dirname, '../.spotify-rate-limits.local.json')
    : '';
const cookieSecure = isProduction || process.env.COOKIE_SECURE === 'true';
const cookieSameSite = process.env.COOKIE_SAME_SITE ?? 'lax';

if (isProduction) {
  if (sessionSecret === 'dev-session-secret' || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET doit etre une valeur aleatoire de 32 caracteres minimum en production.');
  }
  if (!frontendUrl.startsWith('https://')) {
    throw new Error('FRONTEND_URL doit utiliser https:// en production.');
  }
  if (!spotifyRedirectUri.startsWith('https://')) {
    throw new Error('SPOTIFY_REDIRECT_URI doit utiliser https:// en production.');
  }
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL est manquant dans le fichier .env.');
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const roomManager = new RoomManager();
const authSessions = new Map();
const oauthStates = new Map();
const spotifyRateLimits = new Map();
let spotifyAppToken = null;
const spotifyScopes = [
  'user-library-read',
  'streaming',
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
];

function loadAuthSessionCache() {
  if (!authSessionCachePath) return;

  try {
    const raw = fs.readFileSync(authSessionCachePath, 'utf8');
    const sessions = JSON.parse(raw);
    for (const [sid, session] of Object.entries(sessions)) {
      authSessions.set(sid, session);
    }
    console.info(`Loaded ${authSessions.size} Spotify auth session(s) from dev cache.`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Spotify auth session cache ignored:', error.message);
    }
  }
}

function persistAuthSessionCache() {
  if (!authSessionCachePath) return;

  const sessions = Object.fromEntries(authSessions);
  fs.writeFileSync(authSessionCachePath, JSON.stringify(sessions, null, 2));
}

loadAuthSessionCache();

function loadSpotifyRateLimitCache() {
  if (!spotifyRateLimitCachePath) return;

  try {
    const raw = fs.readFileSync(spotifyRateLimitCachePath, 'utf8');
    const limits = JSON.parse(raw);
    for (const [key, until] of Object.entries(limits)) {
      if (Number(until) > Date.now()) {
        spotifyRateLimits.set(key, Number(until));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Spotify rate limit cache ignored:', error.message);
    }
  }
}

function persistSpotifyRateLimitCache() {
  if (!spotifyRateLimitCachePath) return;

  const activeLimits = Object.fromEntries(
    [...spotifyRateLimits].filter(([, until]) => until > Date.now()),
  );
  fs.writeFileSync(spotifyRateLimitCachePath, JSON.stringify(activeLimits, null, 2));
}

loadSpotifyRateLimitCache();

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  }),
);
if (isProduction) {
  app.set('trust proxy', 1);
}
app.use(express.json());
app.use(express.static(clientDistPath));

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((cookie) => cookie.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex');
}

function createCookie(response, name, value, maxAgeSeconds) {
  const signed = `${value}.${sign(value)}`;
  response.cookie(name, signed, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    maxAge: maxAgeSeconds * 1000,
  });
}

function clearCookie(response, name) {
  response.clearCookie(name, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
  });
}

function readSignedCookie(request, name) {
  const raw = parseCookies(request.headers.cookie)[name];
  if (!raw) return null;
  const [value, signature] = raw.split('.');
  if (!value || signature !== sign(value)) return null;
  return value;
}

function mapTodo(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    done: row.done,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrack(track) {
  return {
    spotifyTrackId: track.id,
    uri: track.uri,
    title: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album?.name ?? '',
    imageUrl: track.album?.images?.[0]?.url ?? '',
    durationMs: track.duration_ms,
  };
}

function getPlaylistItemTrack(item) {
  return item?.track ?? item?.item ?? null;
}

function mapPlaylistItemsToTracks(items = []) {
  return items
    .map((item) => getPlaylistItemTrack(item))
    .filter((track) => track?.type === 'track')
    .map((track) => mapTrack(track))
    .filter((track) => track.uri);
}

function normalizeSpotifyId(value) {
  const raw = String(value ?? '').trim();
  return raw.includes(':') ? raw.split(':').at(-1) : raw;
}

function addQueryParams(url, params) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function mapSession(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    questionCount: row.question_count,
    answerMode: row.answer_mode,
    listenDurationSeconds: row.listen_duration_seconds,
    score: row.score,
    maxScore: row.max_score,
    currentQuestionIndex: row.current_question_index,
    isFinished: row.is_finished,
    createdAt: row.created_at,
  };
}

function mapAnswer(row, reveal = false) {
  const base = {
    id: row.id,
    questionIndex: row.question_index,
    spotifyTrackId: row.spotify_track_id,
    trackUri: row.track_uri,
    album: row.album,
    imageUrl: row.image_url,
    durationMs: row.duration_ms,
    userTitleAnswer: row.user_title_answer,
    userArtistAnswer: row.user_artist_answer,
    isTitleCorrect: row.is_title_correct,
    isArtistCorrect: row.is_artist_correct,
    points: row.points,
    answeredAt: row.answered_at,
  };

  if (!reveal && !row.answered_at) {
    return base;
  }

  return {
    ...base,
    expectedTitle: row.expected_title,
    expectedArtists: JSON.parse(row.expected_artists),
  };
}

function handleServerError(error, response) {
  console.error(error);
  response.status(500).json({
    message:
      error instanceof Error && error.message ? error.message : 'Erreur serveur.',
  });
}

async function readSpotifyError(response) {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message ?? payload?.error ?? response.statusText;
}

async function readJsonOrNull(response) {
  return response.json().catch(() => null);
}

function hashSessionId(sid) {
  return crypto.createHash('sha256').update(sid).digest('hex');
}

function getTokenEncryptionKey() {
  return crypto.createHash('sha256').update(sessionSecret).digest();
}

function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptToken(value) {
  const [iv, tag, encrypted] = String(value).split('.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getTokenEncryptionKey(),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function initAuthSessionStore() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spotify_auth_sessions (
      sid_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spotify_id VARCHAR(255) NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_spotify_auth_sessions_user_id ON spotify_auth_sessions(user_id)',
  );
}

async function initDatabaseSchema() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
}

async function saveAuthSession(sid, session) {
  const sessionWithId = { ...session, sid };
  authSessions.set(sid, sessionWithId);
  persistAuthSessionCache();
  await pool.query(
    `INSERT INTO spotify_auth_sessions
     (sid_hash, user_id, spotify_id, access_token, refresh_token, expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (sid_hash)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       spotify_id = EXCLUDED.spotify_id,
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = NOW()`,
    [
      hashSessionId(sid),
      session.userId,
      session.spotifyId,
      encryptToken(session.accessToken),
      encryptToken(session.refreshToken),
      session.expiresAt,
      (session.scopes ?? []).join(' '),
    ],
  );
}

async function readAuthSession(sid) {
  const cachedSession = authSessions.get(sid);
  if (cachedSession) return cachedSession;

  const result = await pool.query(
    `SELECT user_id, spotify_id, access_token, refresh_token, expires_at, scopes
     FROM spotify_auth_sessions
     WHERE sid_hash = $1`,
    [hashSessionId(sid)],
  );
  const row = result.rows[0];
  if (!row) return null;

  try {
    const session = {
      sid,
      userId: row.user_id,
      spotifyId: row.spotify_id,
      accessToken: decryptToken(row.access_token),
      refreshToken: decryptToken(row.refresh_token),
      expiresAt: Number(row.expires_at),
      scopes: String(row.scopes ?? '').split(' ').filter(Boolean),
    };
    authSessions.set(sid, session);
    return session;
  } catch (error) {
    console.warn('Spotify auth session could not be decrypted and was deleted.');
    await deleteAuthSession(sid);
    return null;
  }
}

async function deleteAuthSession(sid) {
  authSessions.delete(sid);
  persistAuthSessionCache();
  await pool.query('DELETE FROM spotify_auth_sessions WHERE sid_hash = $1', [hashSessionId(sid)]);
}

async function findStoredRefreshToken(spotifyId) {
  const cachedSession = [...authSessions.values()].find(
    (session) => session.spotifyId === spotifyId && session.refreshToken,
  );
  if (cachedSession?.refreshToken) return cachedSession.refreshToken;

  const result = await pool.query(
    `SELECT refresh_token
     FROM spotify_auth_sessions
     WHERE spotify_id = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [spotifyId],
  );
  const encryptedRefreshToken = result.rows[0]?.refresh_token;
  if (!encryptedRefreshToken) return '';

  try {
    return decryptToken(encryptedRefreshToken);
  } catch {
    return '';
  }
}

function getSpotifyRateLimitReason(step, response) {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    spotifyRateLimits.set(step, Date.now() + retryAfterSeconds * 1000);
    persistSpotifyRateLimitCache();
  }
  console.warn(
    `Spotify rate limit during ${step}${retryAfter ? `, retry-after=${retryAfter}s` : ''}.`,
  );
  return `rate-limited${retryAfter ? `-${retryAfter}` : ''}`;
}

function getActiveSpotifyRateLimitReason(steps) {
  const now = Date.now();
  const active = steps
    .map((step) => spotifyRateLimits.get(step) ?? 0)
    .filter((until) => until > now)
    .sort((a, b) => b - a)[0];

  if (!active) return '';

  return `rate-limited-${Math.ceil((active - now) / 1000)}`;
}

function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(feat|ft|featuring)\b.*$/g, '')
    .replace(/\b(remastered|radio edit|edit|version|explicit)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCloseEnough(userAnswer, expected) {
  const user = normalizeAnswer(userAnswer);
  const wanted = normalizeAnswer(expected);
  if (!user || !wanted) return false;
  return wanted.includes(user) || user.includes(wanted);
}

function scoreAnswer(answerMode, expectedTitle, expectedArtists, titleAnswer, artistAnswer) {
  if (answerMode === 'either') {
    const answer = titleAnswer || artistAnswer;
    const titleCorrect = isCloseEnough(answer, expectedTitle);
    const artistCorrect = expectedArtists.some((artist) => isCloseEnough(answer, artist));
    return {
      isTitleCorrect: titleCorrect,
      isArtistCorrect: artistCorrect,
      points: titleCorrect || artistCorrect ? 1 : 0,
    };
  }

  const titleCorrect =
    answerMode !== 'artist' ? isCloseEnough(titleAnswer, expectedTitle) : false;
  const artistCorrect =
    answerMode !== 'title'
      ? expectedArtists.some((artist) => isCloseEnough(artistAnswer, artist))
      : false;

  return {
    isTitleCorrect: titleCorrect,
    isArtistCorrect: artistCorrect,
    points: Number(titleCorrect) + Number(artistCorrect),
  };
}

function requireSpotifyConfig(response) {
  if (!spotifyClientId || !spotifyClientSecret) {
    response.status(500).json({ message: 'Configuration Spotify incomplete.' });
    return false;
  }
  return true;
}

async function spotifyFetch(session, url, options = {}) {
  const activeSession = await ensureFreshToken(session);
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${activeSession.accessToken}`,
    },
  });

  if (response.status === 401) {
    await refreshSpotifySession(activeSession);
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        Authorization: `Bearer ${activeSession.accessToken}`,
      },
    });
  }

  return response;
}

async function ensureFreshToken(session) {
  if (Date.now() < session.expiresAt - 30_000) {
    return session;
  }
  return refreshSpotifySession(session);
}

class SpotifyRefreshTokenError extends Error {}

async function refreshSpotifySession(session) {
  if (!spotifyClientId || !spotifyClientSecret) {
    throw new Error('Configuration Spotify incomplete.');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString(
        'base64',
      )}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  });

  if (!response.ok) {
    const message = await readSpotifyError(response);
    throw new SpotifyRefreshTokenError(
      `Session Spotify expiree ou invalide (${response.status}: ${message}).`,
    );
  }

  const payload = await response.json();
  session.accessToken = payload.access_token;
  session.refreshToken = payload.refresh_token ?? session.refreshToken;
  session.expiresAt = Date.now() + payload.expires_in * 1000;
  if (session.sid) {
    await saveAuthSession(session.sid, session);
  }
  return session;
}

async function getSpotifyAppToken() {
  if (!spotifyClientId || !spotifyClientSecret) {
    throw new Error('Configuration Spotify incomplete.');
  }
  if (spotifyAppToken && Date.now() < spotifyAppToken.expiresAt - 30_000) {
    return spotifyAppToken.accessToken;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString(
        'base64',
      )}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) {
    throw new Error('Token application Spotify impossible.');
  }

  const payload = await response.json();
  spotifyAppToken = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  return spotifyAppToken.accessToken;
}

async function spotifyAppFetch(url, options = {}) {
  const accessToken = await getSpotifyAppToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function requireAuth(request, response) {
  const sid = readSignedCookie(request, 'spotify_session');
  const session = sid ? await readAuthSession(sid) : null;
  if (!session) {
    response.status(401).json({ message: 'Spotify non connecte.' });
    return null;
  }

  try {
    return await ensureFreshToken(session);
  } catch (error) {
    if (error instanceof SpotifyRefreshTokenError) {
      await deleteAuthSession(sid);
      clearCookie(response, 'spotify_session');
      response.status(401).json({
        message: 'Session Spotify expiree. Reconnecte-toi avec Spotify.',
      });
      return null;
    }
    throw error;
  }
}

async function fetchLikedTracks(session) {
  const tracks = [];
  let nextUrl = 'https://api.spotify.com/v1/me/tracks?limit=50';

  while (nextUrl) {
    const response = await spotifyFetch(session, nextUrl);
    if (!response.ok) {
      throw new Error('Impossible de recuperer les titres likes.');
    }
    const payload = await response.json();
    tracks.push(...payload.items.map((item) => mapTrack(item.track)).filter((track) => track.uri));
    nextUrl = payload.next;
  }

  return tracks;
}

async function fetchUserPlaylists(session) {
  const playlists = [];
  let nextUrl = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (nextUrl) {
    const spotifyResponse = await spotifyFetch(session, nextUrl);
    if (!spotifyResponse.ok) {
      throw new Error('Impossible de recuperer les playlists.');
    }

    const payload = await spotifyResponse.json();
    playlists.push(
      ...payload.items
        .filter((playlist) => playlist?.id)
        .map((playlist) => ({
          id: playlist.id,
          name: playlist.name ?? 'Playlist sans nom',
          trackCount: playlist.tracks?.total ?? 0,
          tracksHref: playlist.tracks?.href ?? '',
          imageUrl: playlist.images?.[0]?.url ?? '',
        })),
    );
    nextUrl = payload.next;
  }

  return playlists;
}

async function fetchPlaylistTracks(session, playlistId, tracksHref = '') {
  const cleanPlaylistId = normalizeSpotifyId(playlistId);
  const playlistItemsUrl = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
    cleanPlaylistId,
  )}/items`;
  const tracksUrl = addQueryParams(playlistItemsUrl, { limit: '50' });
  const tracksWithTypesUrl = addQueryParams(playlistItemsUrl, {
    limit: '50',
    additional_types: 'track',
  });

  const attempts = [
    {
      label: 'playlist items with user token',
      run: () => fetchPlaylistTracksFromUrl((url) => spotifyFetch(session, url), tracksUrl),
    },
    {
      label: 'playlist items with user token and additional_types',
      run: () =>
        fetchPlaylistTracksFromUrl((url) => spotifyFetch(session, url), tracksWithTypesUrl),
    },
    {
      label: 'playlist details with user token',
      run: () =>
        fetchPlaylistTracksFromPlaylistDetails(
        (url) => spotifyFetch(session, url),
        cleanPlaylistId,
      ),
    },
    {
      label: 'playlist items with app token',
      run: () => fetchPlaylistTracksFromUrl(spotifyAppFetch, tracksUrl),
    },
    {
      label: 'playlist details with app token',
      run: () => fetchPlaylistTracksFromPlaylistDetails(spotifyAppFetch, cleanPlaylistId),
    },
  ];

  const forbiddenReasons = [];
  const emptyReasons = [];
  for (const attempt of attempts) {
    try {
      const tracks = await attempt.run();
      if (tracks.length > 0) {
        return tracks;
      }
      emptyReasons.push(attempt.label);
    } catch (error) {
      if (!(error instanceof SpotifyPlaylistForbiddenError)) {
        throw error;
      }
      forbiddenReasons.push(`${attempt.label}: ${error.message}`);
    }
  }

  if (forbiddenReasons.length > 0) {
    const emptyDetails =
      emptyReasons.length > 0 ? ` Fallbacks vides: ${emptyReasons.join(' | ')}.` : '';
    throw new SpotifyPlaylistForbiddenError(
      `Playlist Spotify refusee. Details: ${forbiddenReasons.join(' | ')}.${emptyDetails}`,
    );
  }

  return [];
}

class SpotifyPlaylistForbiddenError extends Error {}

async function fetchPlaylistTracksFromUrl(fetcher, firstUrl) {
  const tracks = [];
  let nextUrl = firstUrl;

  while (nextUrl) {
    const spotifyResponse = await fetcher(nextUrl);
    if (!spotifyResponse.ok) {
      if (spotifyResponse.status === 403) {
        throw new SpotifyPlaylistForbiddenError(await readSpotifyError(spotifyResponse));
      }

      const message = await readSpotifyError(spotifyResponse);
      throw new Error(
        `Impossible de recuperer les titres de la playlist (${spotifyResponse.status}: ${message}).`,
      );
    }

    const payload = await spotifyResponse.json();
    tracks.push(...mapPlaylistItemsToTracks(payload.items));
    nextUrl = payload.next;
  }

  return tracks;
}

async function fetchPlaylistTracksFromPlaylistDetails(fetcher, playlistId) {
  const fields =
    'tracks(total,next,items(track(id,uri,name,duration_ms,type,artists(name),album(name,images))))';
  const spotifyResponse = await fetcher(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(
      playlistId,
    )}?fields=${encodeURIComponent(fields)}`,
  );

  if (!spotifyResponse.ok) {
    if (spotifyResponse.status === 403) {
      throw new SpotifyPlaylistForbiddenError(await readSpotifyError(spotifyResponse));
    }

    const message = await readSpotifyError(spotifyResponse);
    throw new Error(
      `Impossible de recuperer les titres de la playlist (${spotifyResponse.status}: ${message}).`,
    );
  }

  const payload = await spotifyResponse.json();
  const tracks = mapPlaylistItemsToTracks(payload.tracks?.items);

  if (payload.tracks?.next) {
    tracks.push(...(await fetchPlaylistTracksFromUrl(fetcher, payload.tracks.next)));
  }

  return tracks;
}

function shuffle(items) {
  return [...items].sort(() => crypto.randomInt(0, 1000) - 500);
}

function hasPlaylistScopes(session) {
  const grantedScopes = session.scopes ?? [];
  return (
    grantedScopes.includes('playlist-read-private') &&
    grantedScopes.includes('playlist-read-collaborative')
  );
}

function missingPlaylistScopesMessage() {
  return "Token Spotify sans permissions playlist. Deconnecte-toi, supprime l'autorisation de cette app dans ton compte Spotify, puis reconnecte-toi.";
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/auth/spotify/login', (_request, response) => {
  if (!requireSpotifyConfig(response)) return;

  const rateLimitReason = getActiveSpotifyRateLimitReason([
    'oauth-token',
    'current-user-profile',
  ]);
  if (rateLimitReason) {
    return response.redirect(`${frontendUrl}/?auth=${rateLimitReason}`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  createCookie(response, 'spotify_oauth_state', state, 10 * 60);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: spotifyClientId,
    scope: spotifyScopes.join(' '),
    redirect_uri: spotifyRedirectUri,
    state,
    show_dialog: 'true',
  });

  response.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.post('/api/auth/logout', async (request, response) => {
  const sid = readSignedCookie(request, 'spotify_session');
  if (sid) {
    await deleteAuthSession(sid);
  }
  clearCookie(response, 'spotify_session');
  response.status(204).send();
});

app.get('/api/auth/spotify/callback', async (request, response) => {
  if (!requireSpotifyConfig(response)) return;

  const { code, state } = request.query;
  const stateFromCookie = readSignedCookie(request, 'spotify_oauth_state');
  const stateExpiresAt = oauthStates.get(String(state));
  oauthStates.delete(String(state));
  clearCookie(response, 'spotify_oauth_state');

  if (
    !code ||
    String(state) !== stateFromCookie ||
    (stateExpiresAt && stateExpiresAt < Date.now())
  ) {
    console.warn('Spotify OAuth callback rejected because state validation failed.');
    return response.redirect(`${frontendUrl}/?auth=failed`);
  }

  try {
    const tokenRateLimitReason = getActiveSpotifyRateLimitReason(['oauth-token']);
    if (tokenRateLimitReason) {
      return response.redirect(`${frontendUrl}/?auth=${tokenRateLimitReason}`);
    }

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${spotifyClientId}:${spotifyClientSecret}`).toString(
          'base64',
        )}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: spotifyRedirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const message = await readSpotifyError(tokenResponse);
      console.warn(`Spotify OAuth token exchange failed (${tokenResponse.status}): ${message}`);
      const authReason =
        tokenResponse.status === 429
          ? getSpotifyRateLimitReason('oauth-token', tokenResponse)
          : 'failed';
      return response.redirect(`${frontendUrl}/?auth=${authReason}`);
    }

    const tokenPayload = await readJsonOrNull(tokenResponse);
    if (!tokenPayload?.access_token) {
      return response.redirect(`${frontendUrl}/?auth=failed`);
    }

    const profileRateLimitReason = getActiveSpotifyRateLimitReason(['current-user-profile']);
    if (profileRateLimitReason) {
      return response.redirect(`${frontendUrl}/?auth=${profileRateLimitReason}`);
    }

    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });
    if (!profileResponse.ok) {
      const message = await readSpotifyError(profileResponse);
      console.warn(`Spotify profile fetch failed (${profileResponse.status}): ${message}`);
      const authReason =
        profileResponse.status === 429
          ? getSpotifyRateLimitReason('current-user-profile', profileResponse)
          : 'failed';
      return response.redirect(`${frontendUrl}/?auth=${authReason}`);
    }

    const profile = await readJsonOrNull(profileResponse);
    if (!profile?.id) {
      return response.redirect(`${frontendUrl}/?auth=failed`);
    }

    if (profile.product !== 'premium') {
      return response.redirect(`${frontendUrl}/?auth=not-premium`);
    }

    const userResult = await pool.query(
      `INSERT INTO users (spotify_id, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (spotify_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email, updated_at = NOW()
       RETURNING id, spotify_id, display_name, email`,
      [profile.id, profile.display_name ?? '', profile.email ?? ''],
    );

    const sid = crypto.randomBytes(24).toString('hex');
    const refreshToken = tokenPayload.refresh_token || (await findStoredRefreshToken(profile.id));
    if (!refreshToken) {
      console.warn('Spotify OAuth callback did not return a refresh token and no stored token exists.');
      return response.redirect(`${frontendUrl}/?auth=failed`);
    }

    await saveAuthSession(sid, {
      userId: userResult.rows[0].id,
      spotifyId: profile.id,
      accessToken: tokenPayload.access_token,
      refreshToken,
      expiresAt: Date.now() + tokenPayload.expires_in * 1000,
      scopes: String(tokenPayload.scope ?? '').split(' ').filter(Boolean),
    });
    createCookie(response, 'spotify_session', sid, 30 * 24 * 60 * 60);
    return response.redirect(`${frontendUrl}/dashboard`);
  } catch (error) {
    console.error(error);
    return response.redirect(`${frontendUrl}/?auth=failed`);
  }
});

app.post('/api/auth/spotify/refresh', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;
  response.json({ accessToken: session.accessToken, expiresAt: session.expiresAt });
});

app.get('/api/auth/me', async (request, response) => {
  const sid = readSignedCookie(request, 'spotify_session');
  const storedSession = sid ? await readAuthSession(sid) : null;
  if (!storedSession) {
    return response.json({ user: null, accessToken: '', expiresAt: 0, scopes: [] });
  }

  let session;
  try {
    session = await ensureFreshToken(storedSession);
  } catch (error) {
    if (error instanceof SpotifyRefreshTokenError) {
      await deleteAuthSession(sid);
      clearCookie(response, 'spotify_session');
      return response.json({ user: null, accessToken: '', expiresAt: 0, scopes: [] });
    }
    throw error;
  }

  const result = await pool.query(
    'SELECT id, spotify_id, display_name, email FROM users WHERE id = $1',
    [session.userId],
  );
  if (result.rowCount === 0) {
    await deleteAuthSession(sid);
    clearCookie(response, 'spotify_session');
    return response.json({ user: null, accessToken: '', expiresAt: 0, scopes: [] });
  }
  response.json({
    user: result.rows[0],
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    scopes: session.scopes ?? [],
  });
});

app.get('/api/auth/debug-scopes', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  response.json({
    scopes: session.scopes ?? [],
    hasPlaylistReadPrivate: Boolean(session.scopes?.includes('playlist-read-private')),
    hasPlaylistReadCollaborative: Boolean(
      session.scopes?.includes('playlist-read-collaborative'),
    ),
  });
});

app.get('/api/spotify/liked-tracks', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    response.json(await fetchLikedTracks(session));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/spotify/playlists', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    response.json(await fetchUserPlaylists(session));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/spotify/playlists/:playlistId/tracks', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    response.json(await fetchPlaylistTracks(session, request.params.playlistId));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/spotify/playlists/:playlistId/debug', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    const playlistId = normalizeSpotifyId(request.params.playlistId);
    const playlists = await fetchUserPlaylists(session);
    const playlist = playlists.find((item) => item.id === playlistId);
    const detailsUrl = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
      playlistId,
    )}?fields=${encodeURIComponent(
      'id,name,public,owner(id,display_name),tracks(total,href)',
    )}`;
    const tracksUrl = `https://api.spotify.com/v1/playlists/${encodeURIComponent(
      playlistId,
    )}/items?limit=1&additional_types=track`;

    const [detailsResponse, tracksResponse] = await Promise.all([
      spotifyFetch(session, detailsUrl),
      spotifyFetch(session, tracksUrl),
    ]);

    response.json({
      playlistFromList: playlist ?? null,
      detailsStatus: detailsResponse.status,
      detailsError: detailsResponse.ok ? null : await readSpotifyError(detailsResponse),
      tracksStatus: tracksResponse.status,
      tracksError: tracksResponse.ok ? null : await readSpotifyError(tracksResponse),
    });
  } catch (error) {
    handleServerError(error, response);
  }
});

app.post('/api/blindtests', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  const {
    sourceType = 'liked',
    playlistId = '',
    questionCount,
    answerMode,
    listenDurationSeconds,
  } = request.body;
  const count = Number(questionCount);
  const duration = Number(listenDurationSeconds);

  if (!['liked', 'playlist'].includes(sourceType)) {
    return response.status(400).json({ message: 'Source non supportee pour le MVP.' });
  }
  if (sourceType === 'playlist' && !playlistId) {
    return response.status(400).json({ message: 'Playlist obligatoire.' });
  }
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !['title', 'artist', 'both', 'either'].includes(answerMode)
  ) {
    return response.status(400).json({ message: 'Configuration de blindtest invalide.' });
  }
  if (![5, 10, 15].includes(duration)) {
    return response.status(400).json({ message: 'Duree ecoute invalide.' });
  }

  try {
    let sourceName = 'Titres likes';
    let sourceTracks = [];

    if (sourceType === 'playlist') {
      if (!hasPlaylistScopes(session)) {
        return response.status(403).json({
          message: missingPlaylistScopesMessage(),
        });
      }

      const playlists = await fetchUserPlaylists(session);
      const selectedPlaylist = playlists.find((playlist) => playlist.id === playlistId);
      if (!selectedPlaylist) {
        return response.status(404).json({ message: 'Playlist introuvable.' });
      }

      sourceName = selectedPlaylist.name;
      sourceTracks = await fetchPlaylistTracks(
        session,
        playlistId,
        selectedPlaylist.tracksHref,
      );
    } else {
      sourceTracks = await fetchLikedTracks(session);
    }

    if (sourceTracks.length === 0) {
      return response.status(400).json({
        message:
          sourceType === 'playlist'
            ? `Aucun titre exploitable trouve dans "${sourceName}". Verifie que la playlist contient des morceaux Spotify, pas seulement des podcasts, episodes ou titres indisponibles.`
            : 'Aucun titre like trouve.',
      });
    }

    const selectedTracks = shuffle(sourceTracks).slice(0, Math.min(count, sourceTracks.length));
    const maxScore = selectedTracks.length * (answerMode === 'both' ? 2 : 1);
    const db = await pool.connect();

    try {
      await db.query('BEGIN');
      const sessionResult = await db.query(
        `INSERT INTO blindtest_sessions
         (user_id, source_type, source_name, question_count, answer_mode, listen_duration_seconds, max_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          session.userId,
          sourceType,
          sourceName,
          selectedTracks.length,
          answerMode,
          duration,
          maxScore,
        ],
      );

      for (const [index, track] of selectedTracks.entries()) {
        await db.query(
          `INSERT INTO blindtest_answers
           (session_id, question_index, spotify_track_id, track_uri, expected_title, expected_artists, album, image_url, duration_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            sessionResult.rows[0].id,
            index,
            track.spotifyTrackId,
            track.uri,
            track.title,
            JSON.stringify(track.artists),
            track.album,
            track.imageUrl,
            track.durationMs,
          ],
        );
      }

      await db.query('COMMIT');
      const answers = await pool.query(
        'SELECT * FROM blindtest_answers WHERE session_id = $1 ORDER BY question_index',
        [sessionResult.rows[0].id],
      );
      return response.status(201).json({
        session: mapSession(sessionResult.rows[0]),
        questions: answers.rows.map((row) => mapAnswer(row)),
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  } catch (error) {
    if (error instanceof SpotifyPlaylistForbiddenError) {
      return response.status(403).json({
        message:
          `${error.message} Verifie que la playlist est lisible avec ton compte, puis reconnecte-toi a Spotify si tu viens d'ajouter les permissions playlist.`,
      });
    }

    return handleServerError(error, response);
  }
});

app.get('/api/blindtests/history', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    const result = await pool.query(
      'SELECT * FROM blindtest_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [session.userId],
    );
    response.json(result.rows.map(mapSession));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/blindtests/:id', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    const sessionResult = await pool.query(
      'SELECT * FROM blindtest_sessions WHERE id = $1 AND user_id = $2',
      [Number(request.params.id), session.userId],
    );
    if (sessionResult.rowCount === 0) {
      return response.status(404).json({ message: 'Blindtest introuvable.' });
    }

    const answers = await pool.query(
      'SELECT * FROM blindtest_answers WHERE session_id = $1 ORDER BY question_index',
      [Number(request.params.id)],
    );
    const reveal = sessionResult.rows[0].is_finished;

    return response.json({
      session: mapSession(sessionResult.rows[0]),
      questions: answers.rows.map((row) => mapAnswer(row, reveal)),
    });
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.post('/api/blindtests/:id/answer', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  const { trackId, titleAnswer = '', artistAnswer = '' } = request.body;

  try {
    const sessionResult = await pool.query(
      'SELECT * FROM blindtest_sessions WHERE id = $1 AND user_id = $2',
      [Number(request.params.id), session.userId],
    );
    if (sessionResult.rowCount === 0) {
      return response.status(404).json({ message: 'Blindtest introuvable.' });
    }
    if (sessionResult.rows[0].is_finished) {
      return response.status(400).json({ message: 'Blindtest deja termine.' });
    }

    const answerResult = await pool.query(
      'SELECT * FROM blindtest_answers WHERE session_id = $1 AND spotify_track_id = $2',
      [Number(request.params.id), trackId],
    );
    if (answerResult.rowCount === 0) {
      return response.status(404).json({ message: 'Question introuvable.' });
    }

    const answer = answerResult.rows[0];
    const expectedArtists = JSON.parse(answer.expected_artists);
    const scoring = scoreAnswer(
      sessionResult.rows[0].answer_mode,
      answer.expected_title,
      expectedArtists,
      titleAnswer,
      artistAnswer,
    );

    const updatedAnswer = await pool.query(
      `UPDATE blindtest_answers
       SET user_title_answer = $1,
           user_artist_answer = $2,
           is_title_correct = $3,
           is_artist_correct = $4,
           points = $5,
           answered_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        String(titleAnswer).trim(),
        String(artistAnswer).trim(),
        scoring.isTitleCorrect,
        scoring.isArtistCorrect,
        scoring.points,
        answer.id,
      ],
    );

    const total = await pool.query(
      'SELECT COALESCE(SUM(points), 0)::int AS score, COUNT(answered_at)::int AS answered_count FROM blindtest_answers WHERE session_id = $1',
      [Number(request.params.id)],
    );
    await pool.query(
      'UPDATE blindtest_sessions SET score = $1, current_question_index = $2 WHERE id = $3',
      [total.rows[0].score, total.rows[0].answered_count, Number(request.params.id)],
    );

    return response.json({
      answer: mapAnswer(updatedAnswer.rows[0], true),
      score: total.rows[0].score,
      answeredCount: total.rows[0].answered_count,
    });
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.post('/api/blindtests/:id/finish', async (request, response) => {
  const session = await requireAuth(request, response);
  if (!session) return;

  try {
    const result = await pool.query(
      `UPDATE blindtest_sessions
       SET is_finished = TRUE,
           score = (SELECT COALESCE(SUM(points), 0)::int FROM blindtest_answers WHERE session_id = blindtest_sessions.id)
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [Number(request.params.id), session.userId],
    );
    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Blindtest introuvable.' });
    }

    const answers = await pool.query(
      'SELECT * FROM blindtest_answers WHERE session_id = $1 ORDER BY question_index',
      [Number(request.params.id)],
    );
    return response.json({
      session: mapSession(result.rows[0]),
      questions: answers.rows.map((row) => mapAnswer(row, true)),
    });
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.get('/api/todos', async (_request, response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, done, created_at, updated_at FROM todos ORDER BY id DESC',
    );
    response.json(result.rows.map(mapTodo));
  } catch (error) {
    handleServerError(error, response);
  }
});

app.get('/api/todos/:id', async (request, response) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, done, created_at, updated_at FROM todos WHERE id = $1',
      [Number(request.params.id)],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.post('/api/todos', async (request, response) => {
  const { title, description = '' } = request.body;

  if (!title || typeof title !== 'string') {
    return response.status(400).json({ message: 'Le titre est obligatoire.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO todos (title, description)
       VALUES ($1, $2)
       RETURNING id, title, description, done, created_at, updated_at`,
      [title.trim(), String(description).trim()],
    );

    return response.status(201).json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.put('/api/todos/:id', async (request, response) => {
  const id = Number(request.params.id);
  const { title, description = '', done = false } = request.body;

  if (!title || typeof title !== 'string') {
    return response.status(400).json({ message: 'Le titre est obligatoire.' });
  }

  try {
    const result = await pool.query(
      `UPDATE todos
       SET title = $1, description = $2, done = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, title, description, done, created_at, updated_at`,
      [title.trim(), String(description).trim(), Boolean(done), id],
    );

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.json(mapTodo(result.rows[0]));
  } catch (error) {
    return handleServerError(error, response);
  }
});

app.delete('/api/todos/:id', async (request, response) => {
  const id = Number(request.params.id);

  try {
    const result = await pool.query('DELETE FROM todos WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return response.status(404).json({ message: 'Todo introuvable.' });
    }

    return response.status(204).send();
  } catch (error) {
    return handleServerError(error, response);
  }
});

async function getSocketAuthSession(socket) {
  const raw = parseCookies(socket.handshake.headers.cookie ?? '').spotify_session;
  if (!raw) return null;
  const [sid, signature] = raw.split('.');
  if (!sid || signature !== sign(sid)) return null;
  const session = await readAuthSession(sid);
  if (!session) return null;

  try {
    return await ensureFreshToken(session);
  } catch (error) {
    if (error instanceof SpotifyRefreshTokenError) {
      await deleteAuthSession(sid);
      throw new Error('Session Spotify expiree. Reconnecte-toi avec Spotify.');
    }
    throw error;
  }
}

async function getSocketHostUser(socket) {
  const session = await getSocketAuthSession(socket);
  if (!session) return null;

  const result = await pool.query(
    'SELECT id, spotify_id, display_name, email FROM users WHERE id = $1',
    [session.userId],
  );
  if (result.rowCount === 0) return null;
  return { session, user: result.rows[0] };
}

function validateRoomSetup(payload = {}) {
  const sourceType = payload.sourceType === 'playlist' ? 'playlist' : 'liked';
  const playlistId = String(payload.playlistId ?? '').trim();
  const questionCount = Number(payload.questionCount);
  const listenDurationSeconds = Number(payload.listenDurationSeconds);
  const answerMode = ['title', 'artist', 'both', 'either'].includes(payload.answerMode)
    ? payload.answerMode
    : '';

  if (sourceType === 'playlist' && !playlistId) {
    throw new Error('Playlist obligatoire.');
  }
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
    throw new Error('Nombre de questions invalide.');
  }
  if (!answerMode) {
    throw new Error('Mode de reponse invalide.');
  }
  if (![5, 10, 15].includes(listenDurationSeconds)) {
    throw new Error('Duree ecoute invalide.');
  }

  return { sourceType, playlistId, questionCount, answerMode, listenDurationSeconds };
}

async function buildRoomQuestions(session, setup) {
  let sourceTracks = [];
  if (setup.sourceType === 'playlist') {
    if (!hasPlaylistScopes(session)) {
      throw new Error(missingPlaylistScopesMessage());
    }

    const playlists = await fetchUserPlaylists(session);
    const selectedPlaylist = playlists.find((playlist) => playlist.id === setup.playlistId);
    if (!selectedPlaylist) throw new Error('Playlist introuvable.');
    sourceTracks = await fetchPlaylistTracks(
      session,
      setup.playlistId,
      selectedPlaylist.tracksHref,
    );
  } else {
    sourceTracks = await fetchLikedTracks(session);
  }

  if (sourceTracks.length === 0) {
    throw new Error('Aucun titre exploitable trouve pour cette source.');
  }

  return shuffle(sourceTracks).slice(0, Math.min(setup.questionCount, sourceTracks.length));
}

function emitRoomState(io, room) {
  io.to(room.code).emit('roomUpdated', roomManager.publicRoom(room));
}

function emitQuestion(io, room) {
  io.to(room.code).emit('questionStarted', roomManager.publicQuestion(room));
  io.to(room.hostSocketId).emit('hostPlayTrack', roomManager.hostQuestion(room));
}

function emitRoomError(socket, error) {
  socket.emit('roomError', {
    message: error instanceof Error && error.message ? error.message : 'Action impossible.',
  });
}

function setupRoomSockets() {
  const io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('createRoom', async () => {
      try {
        const auth = await getSocketHostUser(socket);
        if (!auth) throw new Error('Connexion Spotify requise pour creer une room.');

        const { room, player } = roomManager.createRoom(socket.id, auth.user);
        socket.join(room.code);
        socket.emit('roomCreated', {
          room: roomManager.publicRoom(room),
          playerId: player.id,
          role: 'host',
        });
        emitRoomState(io, room);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('joinRoom', (payload = {}) => {
      try {
        const { room, player } = roomManager.joinRoom(payload.code, socket.id, payload.pseudo);
        socket.join(room.code);
        socket.emit('roomJoined', {
          room: roomManager.publicRoom(room),
          playerId: player.id,
          role: 'guest',
        });
        socket.to(room.code).emit('playerJoined', roomManager.publicRoom(room));
        emitRoomState(io, room);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('startGame', async (payload = {}) => {
      try {
        const setup = validateRoomSetup(payload);
        const auth = await getSocketAuthSession(socket);
        if (!auth) throw new Error('Connexion Spotify requise pour lancer la partie.');

        const tracks = await buildRoomQuestions(auth, setup);
        const room = roomManager.startGame(payload.code, socket.id, setup, tracks);
        io.to(room.code).emit('gameStarted', roomManager.publicRoom(room));
        emitQuestion(io, room);
        io.to(room.code).emit('leaderboardUpdated', roomManager.leaderboard(room));
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('submitAnswer', (payload = {}) => {
      try {
        const { room, answer, ignored } = roomManager.submitAnswer(
          payload.code,
          socket.id,
          payload,
        );
        if (ignored) return;

        io.to(room.code).emit('questionLocked', answer);
        io.to(room.code).emit('leaderboardUpdated', roomManager.leaderboard(room));
        emitRoomState(io, room);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('nextQuestion', (payload = {}) => {
      try {
        const { room, finished } = roomManager.nextQuestion(payload.code, socket.id);
        if (finished) {
          io.to(room.code).emit('gameFinished', {
            room: roomManager.publicRoom(room),
            leaderboard: roomManager.leaderboard(room),
          });
          emitRoomState(io, room);
          return;
        }

        emitRoomState(io, room);
        emitQuestion(io, room);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('leaveRoom', () => {
      const result = roomManager.handleDisconnect(socket.id);
      if (!result) return;
      if (result.closed) {
        io.to(result.room.code).emit('roomClosed', {
          reason: 'Le host a quitte la room.',
        });
        io.in(result.room.code).socketsLeave(result.room.code);
        return;
      }
      socket.leave(result.room.code);
      socket.to(result.room.code).emit('playerLeft', roomManager.publicRoom(result.room));
      emitRoomState(io, result.room);
    });

    socket.on('closeRoom', (payload = {}) => {
      try {
        const room = roomManager.closeRoom(payload.code, socket.id);
        io.to(room.code).emit('roomClosed', { reason: 'Room fermee par le host.' });
        io.in(room.code).socketsLeave(room.code);
      } catch (error) {
        emitRoomError(socket, error);
      }
    });

    socket.on('disconnect', () => {
      const result = roomManager.handleDisconnect(socket.id);
      if (!result) return;
      if (result.closed) {
        io.to(result.room.code).emit('roomClosed', {
          reason: 'Le host sest deconnecte.',
        });
        io.in(result.room.code).socketsLeave(result.room.code);
        return;
      }
      socket.to(result.room.code).emit('playerLeft', roomManager.publicRoom(result.room));
      emitRoomState(io, result.room);
    });
  });
}

setupRoomSockets();

app.use((_request, response) => {
  response.sendFile(path.join(clientDistPath, 'index.html'));
});

await initDatabaseSchema();
await initAuthSessionStore();

httpServer.listen(port, host, () => {
  console.log(`API Spotify Blindtest lancee sur http://127.0.0.1:${port}`);
});
