import { useEffect, useState } from 'react';
import { SpotifyPlayerProvider } from './components/SpotifyPlayerProvider';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { BlindtestGamePage } from './pages/BlindtestGamePage';
import { BlindtestResultPage } from './pages/BlindtestResultPage';
import { BlindtestSetupPage } from './pages/BlindtestSetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { SpotifyLoginPage } from './pages/SpotifyLoginPage';
import type { BlindtestPayload } from './types';

type View = 'login' | 'dashboard' | 'setup' | 'game' | 'result';

function App() {
  const auth = useSpotifyAuth();
  const [view, setView] = useState<View>('login');
  const [game, setGame] = useState<BlindtestPayload | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && view === 'login') {
      setView('dashboard');
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [auth.isAuthenticated, view]);

  if (auth.isLoading) {
    return (
      <main className="app-shell narrow">
        <p className="muted">Chargement Spotify...</p>
      </main>
    );
  }

  if (!auth.isAuthenticated || !auth.user) {
    return <SpotifyLoginPage error={auth.error} loginUrl={auth.loginUrl} />;
  }

  return (
    <SpotifyPlayerProvider accessToken={auth.accessToken}>
      {view === 'dashboard' && (
        <DashboardPage user={auth.user} onStartSetup={() => setView('setup')} />
      )}

      {view === 'setup' && (
        <BlindtestSetupPage
          onCancel={() => setView('dashboard')}
          onCreated={(payload) => {
            setGame(payload);
            setView('game');
          }}
        />
      )}

      {view === 'game' && game && (
        <BlindtestGamePage
          game={game}
          onGameChange={setGame}
          onFinished={(payload) => {
            setGame(payload);
            setView('result');
          }}
        />
      )}

      {view === 'result' && game && (
        <BlindtestResultPage
          game={game}
          onBackToDashboard={() => {
            setGame(null);
            setView('dashboard');
          }}
        />
      )}
    </SpotifyPlayerProvider>
  );
}

export default App;
