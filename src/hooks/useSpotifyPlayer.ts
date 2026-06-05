import { createContext, useContext } from 'react';

export type SpotifyPlayerState = {
  deviceId: string;
  isReady: boolean;
  isPlaying: boolean;
  error: string;
  playTrack: (uri: string, durationSeconds: number) => Promise<void>;
  pause: () => Promise<void>;
};

export const SpotifyPlayerContext = createContext<SpotifyPlayerState | null>(null);

export function useSpotifyPlayer() {
  const context = useContext(SpotifyPlayerContext);
  if (!context) {
    throw new Error('useSpotifyPlayer doit etre utilise dans SpotifyPlayerProvider.');
  }
  return context;
}
