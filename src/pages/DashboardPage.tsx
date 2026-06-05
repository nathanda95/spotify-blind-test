import { useEffect, useState } from 'react';
import { getBlindtestHistory } from '../api/blindtestApi';
import { getLikedTracks, logoutSpotify } from '../api/spotifyApi';
import type { BlindtestSession, User } from '../types';

type Props = {
  user: User;
  onStartSetup: () => void;
  onCreateRoom: () => void;
};

export function DashboardPage({ user, onStartSetup, onCreateRoom }: Props) {
  const [likedCount, setLikedCount] = useState<number | null>(null);
  const [history, setHistory] = useState<BlindtestSession[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [tracks, sessions] = await Promise.all([getLikedTracks(), getBlindtestHistory()]);
        setLikedCount(tracks.length);
        setHistory(sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement impossible.');
      }
    }

    void loadDashboard();
  }, []);

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">Connecte avec Spotify</p>
          <h1>Salut {user.display_name || user.email || 'joueur'}.</h1>
        </div>
        <div className="actions">
          <button type="button" onClick={onCreateRoom}>
            Creer une room
          </button>
          <button type="button" onClick={onStartSetup}>
            Nouveau blindtest solo
          </button>
          <button
            className="secondary"
            type="button"
            onClick={async () => {
              await logoutSpotify();
              window.location.href = '/';
            }}
          >
            Deconnexion
          </button>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="stats-grid">
        <article className="stat">
          <span>Titres likes</span>
          <strong>{likedCount ?? '...'}</strong>
        </article>
        <article className="stat">
          <span>Parties sauvegardees</span>
          <strong>{history.length}</strong>
        </article>
      </section>

      <section className="panel">
        <h2>Historique</h2>
        {history.length === 0 && <p className="muted">Aucune partie terminee pour le moment.</p>}
        <div className="history-list">
          {history.map((session) => (
            <article className="history-row" key={session.id}>
              <div>
                <strong>Blindtest #{session.id}</strong>
                <p>
                  {session.questionCount} titres - {session.answerMode} -{' '}
                  {session.listenDurationSeconds}s
                </p>
              </div>
              <span>
                {session.score}/{session.maxScore}
              </span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
