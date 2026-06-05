import { requestJson } from './http';
import type { SpotifyPlaylist, SpotifyTrack } from '../types';

export type AuthPayload = {
  user: {
    id: number;
    spotify_id: string;
    display_name: string;
    email: string;
  } | null;
  accessToken: string;
  expiresAt: number;
};

export function getCurrentUser() {
  return requestJson<AuthPayload>('/api/auth/me');
}

export function refreshSpotifyToken() {
  return requestJson<{ accessToken: string; expiresAt: number }>('/api/auth/spotify/refresh', {
    method: 'POST',
  });
}

export async function logoutSpotify() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

export function getLikedTracks() {
  return requestJson<SpotifyTrack[]>('/api/spotify/liked-tracks');
}

export function getPlaylists() {
  return requestJson<SpotifyPlaylist[]>('/api/spotify/playlists');
}
