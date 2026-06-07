import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createBlindtest } from '../api/blindtestApi';
import { getPlaylists } from '../api/spotifyApi';
import type { AnswerMode, BlindtestPayload, SpotifyPlaylist } from '../types';

const answerModeLabels: Record<AnswerMode, string> = {
  title: 'Titre',
  artist: 'Artiste',
  both: 'Titre + artiste',
  either: 'Titre ou artiste',
};

type Props = {
  onCreated: (payload: BlindtestPayload) => void;
  onCancel: () => void;
};

export function BlindtestSetupPage({ onCreated, onCancel }: Props) {
  const [sourceType, setSourceType] = useState<'liked' | 'playlist'>('liked');
  const [playlistId, setPlaylistId] = useState('');
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionCountMode, setQuestionCountMode] = useState<'preset' | 'custom'>('preset');
  const [answerMode, setAnswerMode] = useState<AnswerMode>('title');
  const [listenDurationSeconds, setListenDurationSeconds] = useState(10);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
        setError(err instanceof Error ? err.message : 'Playlists indisponibles.');
      } finally {
        setIsLoadingPlaylists(false);
      }
    }

    void loadPlaylists();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (sourceType === 'playlist' && !playlistId) {
      setError('Choisis une playlist pour lancer le blindtest.');
      return;
    }
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 100) {
      setError('Choisis un nombre de chansons entre 1 et 100.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const payload = await createBlindtest({
        sourceType,
        playlistId: sourceType === 'playlist' ? playlistId : undefined,
        questionCount,
        answerMode,
        listenDurationSeconds,
      });
      onCreated(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell narrow">
      <form className="panel setup-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Configuration</p>
        <h1>Lancer le blindtest</h1>

        {error && <p className="error">{error}</p>}

        <fieldset>
          <legend>Source des chansons</legend>
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
              <select
                value={playlistId}
                onChange={(event) => setPlaylistId(event.target.value)}
                disabled={isLoadingPlaylists || playlists.length === 0}
              >
                {isLoadingPlaylists && <option>Chargement des playlists...</option>}
                {!isLoadingPlaylists && playlists.length === 0 && (
                  <option>Aucune playlist trouvee</option>
                )}
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.name} ({playlist.trackCount})
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedPlaylist && (
            <p className="muted">
              Source: {selectedPlaylist.name} - {selectedPlaylist.trackCount} titres
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Nombre de chansons</legend>
          <div className="segmented">
            {[5, 10, 20].map((value) => (
              <button
                className={questionCountMode === 'preset' && questionCount === value ? 'active' : 'secondary'}
                key={value}
                type="button"
                onClick={() => {
                  setQuestionCount(value);
                  setQuestionCountMode('preset');
                }}
              >
                {value}
              </button>
            ))}
            <button
              className={questionCountMode === 'custom' ? 'active' : 'secondary'}
              type="button"
              onClick={() => setQuestionCountMode('custom')}
            >
              Custom
            </button>
          </div>
          {questionCountMode === 'custom' && (
            <label className="inline-field">
              Nombre
              <input
                min={1}
                max={100}
                type="number"
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value))}
              />
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>Mode de reponse</legend>
          <div className="segmented">
            {(['title', 'artist', 'either', 'both'] as AnswerMode[]).map((value) => (
              <button
                className={answerMode === value ? 'active' : 'secondary'}
                key={value}
                type="button"
                onClick={() => setAnswerMode(value)}
              >
                {answerModeLabels[value]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Duree d'ecoute</legend>
          <div className="segmented">
            {[5, 10, 15].map((value) => (
              <button
                className={listenDurationSeconds === value ? 'active' : 'secondary'}
                key={value}
                type="button"
                onClick={() => setListenDurationSeconds(value)}
              >
                {value}s
              </button>
            ))}
          </div>
        </fieldset>

        <div className="actions">
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Preparation...' : 'Lancer le blindtest'}
          </button>
          <button className="secondary" type="button" onClick={onCancel}>
            Retour
          </button>
        </div>
      </form>
    </main>
  );
}
