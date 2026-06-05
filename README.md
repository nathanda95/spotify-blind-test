# Spotify Blindtest

Application React + TypeScript et API Node.js + Express pour lancer un blindtest a partir des titres likes ou playlists Spotify d'un utilisateur Premium.

## Configuration Spotify

1. Creer une application dans le Spotify Developer Dashboard.
2. Ajouter l'URL de callback:

```text
http://127.0.0.1:3001/api/auth/spotify/callback
```

3. Copier le Client ID et le Client Secret dans `.env`.
4. Scopes utilises:

```text
user-library-read streaming user-read-private user-read-email user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative
```

## Variables d'environnement

Copier `.env.example` vers `.env`, puis completer:

```env
PORT=3001
APP_PORT=3001
NODE_ENV=development
FRONTEND_URL=http://127.0.0.1:5173
SESSION_SECRET=change-me
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/spotify/callback
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=spotify_blind_test
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/spotify_blind_test
DATABASE_URL_DOCKER=postgresql://postgres:postgres@db:5432/spotify_blind_test
COOKIE_SAME_SITE=lax
```

## Installation

```bash
npm install
```

## Base PostgreSQL

Creer la base, puis lancer le script SQL:

```sql
CREATE DATABASE spotify_blind_test;
```

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

Le schema contient les anciennes tables CRUD ainsi que:

- `users`
- `spotify_auth_sessions`
- `blindtest_sessions`
- `blindtest_answers`

## Lancement local

```bash
npm run dev
```

En mode dev (`npm run server` / `npm run dev`), le serveur garde aussi les sessions Spotify
dans `.spotify-auth-sessions.local.json`. Ca permet de redemarrer l'API sans refaire tout le
flux OAuth et sans rappeler `/v1/me` a chaque tentative. Les appels API Spotify utilisent ensuite
le refresh token existant.

Si Spotify renvoie `429`, le serveur garde aussi l'echeance `Retry-After` dans
`.spotify-rate-limits.local.json` et evite de rappeler Spotify avant la fin du delai.

Ces fichiers contiennent des donnees locales sensibles ou temporaires: ils sont ignores par Git.
Pour desactiver les caches:

```env
SPOTIFY_AUTH_SESSION_CACHE=off
SPOTIFY_RATE_LIMIT_CACHE=off
```

Front: `http://127.0.0.1:5173`
API: `http://127.0.0.1:3001`

## Lancement Docker

```bash
docker compose up --build
```

L'application build est servie par Express sur `http://127.0.0.1:3001`.

## Configuration production

En production, utiliser des URLs publiques HTTPS et une valeur `SESSION_SECRET` aleatoire longue:

```env
NODE_ENV=production
FRONTEND_URL=https://ton-domaine.com
SPOTIFY_REDIRECT_URI=https://ton-domaine.com/api/auth/spotify/callback
SESSION_SECRET=une-valeur-random-de-32-caracteres-minimum
DATABASE_URL=postgresql://...
COOKIE_SAME_SITE=lax
```

Avec `NODE_ENV=production`, le serveur refuse de demarrer si `FRONTEND_URL` ou
`SPOTIFY_REDIRECT_URI` ne sont pas en HTTPS. Les cookies HTTP-only passent aussi en `secure`.
Les sessions Spotify sont stockees en base dans `spotify_auth_sessions`; les tokens sont chiffres
avec `SESSION_SECRET`, et le cookie navigateur ne contient qu'un identifiant opaque signe.

## Routes API

Auth:

- `GET /api/auth/spotify/login`
- `GET /api/auth/spotify/callback`
- `POST /api/auth/spotify/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Spotify:

- `GET /api/spotify/liked-tracks`
- `GET /api/spotify/playlists`
- `GET /api/spotify/playlists/:playlistId/tracks`

Blindtest:

- `POST /api/blindtests`
- `GET /api/blindtests/:id`
- `POST /api/blindtests/:id/answer`
- `POST /api/blindtests/:id/finish`
- `GET /api/blindtests/history`

CRUD historique:

- `GET /api/todos`
- `GET /api/todos/:id`
- `POST /api/todos`
- `PUT /api/todos/:id`
- `DELETE /api/todos/:id`

## Limitations connues

- Aucun fichier audio n'est telecharge: la lecture passe uniquement par Spotify Web Playback SDK.
- Le MVP suppose un compte Spotify Premium.
- Les tokens Spotify sont gardes en memoire serveur via cookie HTTP-only; un redemarrage serveur demande une reconnexion.
- Le MVP genere les parties depuis les titres likes ou une playlist de l'utilisateur.
- Le scoring est tolerant, mais reste volontairement simple.
