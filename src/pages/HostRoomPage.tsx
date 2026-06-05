import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getPlaylists } from '../api/spotifyApi';
import type { PublicRoom, RoomSetup } from '../roomTypes';
import type { AnswerMode, SpotifyPlaylist } from '../types';

const answerModeLabels: Record<AnswerMode, string> = {
  title: 'Titre',
  artist: 'Artiste',
  both: 'Titre + artiste',
  either: 'Titre ou artiste',
};

type Props = {
  room: PublicRoom;
  error: string;
  onStartGame: (setup: RoomSetup) => void;
  onCloseRoom: () => void;
};

export function HostRoomPage({ room, error, onStartGame, onCloseRoom }: Props) {
  const [sourceType, setSourceType] = useState<'liked' | 'playlist'>('liked');
  const [playlistId, setPlaylistId] = useState('');
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('title');
  const [listenDurationSeconds, setListenDurationSeconds] = useState(10);
  const [playlistError, setPlaylistError] = useState('');

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === playlistId),
    [playlistId, playlists],
  );

  useEffect(() => {
    async function loadPlaylists() {
      try {
        const data = await getPlaylists();
        setPlaylists(data);
        setPlaylistId(data[0]?.id ?? '');
      } catch (err) {
        setPlaylistError(err instanceof Error ? err.message : 'Playlists indisponibles.');
      }
    }

    void loadPlaylists();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    onStartGame({
      sourceType,
      playlistId: sourceType === 'playlist' ? playlistId : undefined,
      questionCount,
      answerMode,
      listenDurationSeconds,
    });
  }

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">Room host</p>
          <h1>{room.code}</h1>
          <p className="muted">Partage ce code aux joueurs.</p>
        </div>
        <button className="secondary" type="button" onClick={onCloseRoom}>
          Fermer la room
        </button>
      </section>

      {(error || playlistError) && <p className="error">{error || playlistError}</p>}

      <div className="room-layout">
        <section className="panel">
          <h2>Joueurs</h2>
          <div className="player-list">
            {room.players.map((player) => (
              <div className="player-row" key={player.id}>
                <strong>{player.pseudo}</strong>
                <span>{player.role === 'host' ? 'Host' : 'Invite'}</span>
              </div>
            ))}
          </div>
        </section>

        <form className="panel setup-form" onSubmit={submit}>
          <h2>Configuration</h2>
          <fieldset>
            <legend>Source</legend>
            <div className="segmented">
              <button
                className={sourceType === 'liked' ? 'active' : 'secondary'}
                type="button"
                onClick={() => setSourceType('liked')}
              >
                Titres likes
              </button>
              <button
                className={sourceType === 'playlist' ? 'active' : 'secondary'}
                type="button"
                onClick={() => setSourceType('playlist')}
              >
                Playlist
              </button>
            </div>
            {sourceType === 'playlist' && (
              <label>
                Playlist
                <select value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
                  {playlists.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name} ({playlist.trackCount})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selectedPlaylist && <p className="muted">{selectedPlaylist.trackCount} titres</p>}
          </fieldset>

          <label>
            Nombre de questions
            <input
              min={1}
              max={100}
              type="number"
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
            />
          </label>

          <fieldset>
            <legend>Mode de reponse</legend>
            <div className="segmented">
              {(['title', 'artist', 'either', 'both'] as AnswerMode[]).map((mode) => (
                <button
                  className={answerMode === mode ? 'active' : 'secondary'}
                  key={mode}
                  type="button"
                  onClick={() => setAnswerMode(mode)}
                >
                  {answerModeLabels[mode]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Duree d'ecoute</legend>
            <div className="segmented">
              {[5, 10, 15].map((duration) => (
                <button
                  className={listenDurationSeconds === duration ? 'active' : 'secondary'}
                  key={duration}
                  type="button"
                  onClick={() => setListenDurationSeconds(duration)}
                >
                  {duration}s
                </button>
              ))}
            </div>
          </fieldset>

          <button type="submit" disabled={room.players.length < 1}>
            Start game
          </button>
        </form>
      </div>
    </main>
  );
}
