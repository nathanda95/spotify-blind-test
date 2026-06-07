import { FormEvent, useEffect, useMemo, useState } from 'react';

type Props = {
  loginUrl: string;
  error?: string;
  roomError?: string;
  onJoinRoom: (payload: { code: string; pseudo: string }) => void;
};

function formatRetryDelay(value: string | null) {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];

    if (days > 0) parts.push(`${days} jour${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    }

    return `environ ${parts.join(' ')}`;
  }

  return value;
}

export function SpotifyLoginPage({ loginUrl, error, roomError, onJoinRoom }: Props) {
  const [authError] = useState(() => new URLSearchParams(window.location.search).get('auth'));
  const [code, setCode] = useState('');
  const [pseudo, setPseudo] = useState('');
  const retryAfter = useMemo(() => {
    if (!authError?.startsWith('rate-limited')) return null;
    return formatRetryDelay(authError.replace(/^rate-limited-?/, '') || null);
  }, [authError]);
  const isRateLimited = authError?.startsWith('rate-limited');

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    onJoinRoom({ code: code.trim().toUpperCase(), pseudo: pseudo.trim() });
  }

  useEffect(() => {
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [authError]);

  return (
    <main className="app-shell narrow">
      <section className="hero">
        <p className="eyebrow">Spotify Blindtest</p>
        <h1>Devine tes titres likes, directement depuis Spotify.</h1>
        <p className="muted">
          Connecte ton compte Spotify Premium, choisis les regles, puis lance une partie.
        </p>
        {(error || authError) && (
          <p className="error">
            {isRateLimited
              ? `Spotify a limite la derniere tentative de connexion.${
                  retryAfter ? ` Reessaie dans ${retryAfter}.` : ' Reessaie dans quelques minutes.'
                }`
              : authError === 'not-premium'
              ? 'Compte Spotify Premium requis pour utiliser la lecture.'
              : error || 'Connexion Spotify impossible.'}
          </p>
        )}
        <a className="button" href={loginUrl}>
          Se connecter avec Spotify
        </a>
      </section>

      <form className="panel join-panel" onSubmit={handleJoin}>
        <div>
          <p className="eyebrow">Multijoueur</p>
          <h2>Rejoindre une room</h2>
          <p className="muted">Aucun compte Spotify requis pour les invites.</p>
        </div>
        {roomError && <p className="error">{roomError}</p>}
        <label>
          Code de room
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
          />
        </label>
        <label>
          Pseudo
          <input
            value={pseudo}
            onChange={(event) => setPseudo(event.target.value)}
            placeholder="Ton pseudo"
            maxLength={32}
          />
        </label>
        <button type="submit">Rejoindre</button>
      </form>
    </main>
  );
}
