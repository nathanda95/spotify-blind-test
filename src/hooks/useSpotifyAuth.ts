import { useCallback, useEffect, useState } from 'react';
import { getCurrentUser } from '../api/spotifyApi';
import type { User } from '../types';

export function useSpotifyAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const payload = await getCurrentUser();
      setUser(payload.user);
      setAccessToken(payload.accessToken);
    } catch (err) {
      setUser(null);
      setAccessToken('');
      const message = err instanceof Error ? err.message : 'Spotify non connecte.';
      setError(message === 'Spotify non connecte.' ? '' : message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    user,
    accessToken,
    isAuthenticated: Boolean(user),
    isLoading,
    error,
    loginUrl: '/api/auth/spotify/login',
    reload,
  };
}
