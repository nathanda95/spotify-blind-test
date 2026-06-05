import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { refreshSpotifyToken } from '../api/spotifyApi';
import { SpotifyPlayerContext } from '../hooks/useSpotifyPlayer';

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type SpotifyPlayer = {
  addListener: (event: string, callback: (payload: any) => void) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  pause: () => Promise<void>;
};

type Props = {
  accessToken: string;
  children: ReactNode;
};

export function SpotifyPlayerProvider({ accessToken, children }: Props) {
  const [token, setToken] = useState(accessToken);
  const [deviceId, setDeviceId] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!token) return;

    function initializePlayer() {
      if (!window.Spotify || playerRef.current) return;

      const player = new window.Spotify.Player({
        name: 'Spotify Blindtest',
        volume: 0.8,
        getOAuthToken: async (callback) => {
          try {
            const payload = await refreshSpotifyToken();
            setToken(payload.accessToken);
            callback(payload.accessToken);
          } catch {
            callback(token);
          }
        },
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
        setIsReady(true);
        setError('');
      });
      player.addListener('not_ready', () => {
        setIsReady(false);
      });
      player.addListener('player_state_changed', (state: { paused: boolean } | null) => {
        if (state) setIsPlaying(!state.paused);
      });
      player.addListener('initialization_error', ({ message }: { message: string }) =>
        setError(message),
      );
      player.addListener('authentication_error', ({ message }: { message: string }) =>
        setError(message),
      );
      player.addListener('account_error', () =>
        setError('Compte Spotify Premium requis pour lancer la lecture.'),
      );
      player.addListener('playback_error', ({ message }: { message: string }) =>
        setError(message),
      );

      playerRef.current = player;
      void player.connect();
    }

    if (window.Spotify) {
      initializePlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initializePlayer;
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      deviceId,
      isReady,
      isPlaying,
      error,
      async pause() {
        await playerRef.current?.pause();
        setIsPlaying(false);
      },
      async playTrack(uri: string, durationSeconds: number) {
        if (!deviceId) {
          setError('Player Spotify non pret.');
          return;
        }

        setError('');
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: [uri], position_ms: 0 }),
        });
        setIsPlaying(true);

        if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = window.setTimeout(() => {
          void playerRef.current?.pause();
          setIsPlaying(false);
        }, durationSeconds * 1000);
      },
    }),
    [deviceId, error, isPlaying, isReady, token],
  );

  return <SpotifyPlayerContext.Provider value={value}>{children}</SpotifyPlayerContext.Provider>;
}
