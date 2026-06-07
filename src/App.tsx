import { useEffect, useState } from 'react';
import { SpotifyPlayerProvider } from './components/SpotifyPlayerProvider';
import { useRoomSocket } from './hooks/useRoomSocket';
import { useSpotifyAuth } from './hooks/useSpotifyAuth';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { BlindtestGamePage } from './pages/BlindtestGamePage';
import { BlindtestResultPage } from './pages/BlindtestResultPage';
import { BlindtestSetupPage } from './pages/BlindtestSetupPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinalLeaderboardPage } from './pages/FinalLeaderboardPage';
import { GuestRoomPage } from './pages/GuestRoomPage';
import { HostRoomPage } from './pages/HostRoomPage';
import { MultiplayerGamePage } from './pages/MultiplayerGamePage';
import { SpotifyLoginPage } from './pages/SpotifyLoginPage';
import type { BlindtestPayload } from './types';

type View = 'login' | 'dashboard' | 'setup' | 'game' | 'result';

function App() {
  const auth = useSpotifyAuth();
  const roomSocket = useRoomSocket();
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

  if (roomSocket.room && roomSocket.role === 'guest') {
    if (roomSocket.room.status === 'lobby') {
      return (
        <GuestRoomPage
          room={roomSocket.room}
          error={roomSocket.error}
          onLeaveRoom={() => {
            roomSocket.leaveRoom();
            window.location.href = '/';
          }}
        />
      );
    }

    if (roomSocket.room.status === 'finished') {
      return (
        <FinalLeaderboardPage
          room={roomSocket.room}
          leaderboard={roomSocket.leaderboard}
          isHost={false}
          onCloseRoom={roomSocket.closeRoom}
          onBackHome={() => window.location.reload()}
        />
      );
    }

    return (
      <MultiplayerGamePage
        room={roomSocket.room}
        question={roomSocket.question}
        hostTrack={roomSocket.hostTrack}
        lockedAnswer={roomSocket.lockedAnswer}
        leaderboard={roomSocket.leaderboard}
        isHost={false}
        error={roomSocket.error}
        onSubmitAnswer={roomSocket.submitAnswer}
        onNextQuestion={roomSocket.nextQuestion}
      />
    );
  }

  if (!auth.isAuthenticated || !auth.user) {
    return (
      <SpotifyLoginPage
        error={auth.error}
        loginUrl={auth.loginUrl}
        roomError={roomSocket.error || roomSocket.closedReason}
        onJoinRoom={roomSocket.joinRoom}
      />
    );
  }

  return (
    <SpotifyPlayerProvider accessToken={auth.accessToken}>
      <AuthenticatedViews
        authUser={auth.user}
        game={game}
        roomSocket={roomSocket}
        setGame={setGame}
        setView={setView}
        view={view}
      />
    </SpotifyPlayerProvider>
  );
}

type AuthenticatedViewsProps = {
  authUser: NonNullable<ReturnType<typeof useSpotifyAuth>['user']>;
  game: BlindtestPayload | null;
  roomSocket: ReturnType<typeof useRoomSocket>;
  setGame: (game: BlindtestPayload | null) => void;
  setView: (view: View) => void;
  view: View;
};

function AuthenticatedViews({
  authUser,
  game,
  roomSocket,
  setGame,
  setView,
  view,
}: AuthenticatedViewsProps) {
  const spotifyPlayer = useSpotifyPlayer();
  const isHost = roomSocket.role === 'host';

  if (roomSocket.room && isHost) {
    if (roomSocket.room.status === 'lobby') {
      return (
        <HostRoomPage
          room={roomSocket.room}
          error={roomSocket.error}
          onStartGame={roomSocket.startGame}
          onCloseRoom={roomSocket.closeRoom}
        />
      );
    }

    if (roomSocket.room.status === 'finished') {
      return (
        <FinalLeaderboardPage
          room={roomSocket.room}
          leaderboard={roomSocket.leaderboard}
          isHost
          onCloseRoom={roomSocket.closeRoom}
          onBackHome={() => setView('dashboard')}
        />
      );
    }

    return (
      <MultiplayerGamePage
        room={roomSocket.room}
        question={roomSocket.question}
        hostTrack={roomSocket.hostTrack}
        lockedAnswer={roomSocket.lockedAnswer}
        leaderboard={roomSocket.leaderboard}
        isHost
        spotifyPlayer={spotifyPlayer}
        error={roomSocket.error}
        onSubmitAnswer={roomSocket.submitAnswer}
        onNextQuestion={roomSocket.nextQuestion}
      />
    );
  }

  if (view === 'dashboard') {
    return (
      <DashboardPage
        user={authUser}
        onStartSetup={() => setView('setup')}
        onCreateRoom={roomSocket.createRoom}
      />
    );
  }

  if (view === 'setup') {
    return (
      <BlindtestSetupPage
        onCancel={() => setView('dashboard')}
        onCreated={(payload) => {
          setGame(payload);
          setView('game');
        }}
      />
    );
  }

  if (view === 'game' && game) {
    return (
      <BlindtestGamePage
        game={game}
        onGameChange={setGame}
        onFinished={(payload) => {
          setGame(payload);
          setView('result');
        }}
      />
    );
  }

  if (view === 'result' && game) {
    return (
      <BlindtestResultPage
        game={game}
        onBackToDashboard={() => {
          setGame(null);
          setView('dashboard');
        }}
      />
    );
  }

  return null;
}

export default App;
