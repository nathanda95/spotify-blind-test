import { FormEvent, useEffect, useState } from 'react';
import type {
  HostTrackPayload,
  LeaderboardEntry,
  PublicQuestion,
  PublicRoom,
  QuestionLockedPayload,
} from '../roomTypes';
import type { SpotifyPlayerState } from '../hooks/useSpotifyPlayer';

type Props = {
  room: PublicRoom;
  question: PublicQuestion | null;
  hostTrack: HostTrackPayload | null;
  lockedAnswer: QuestionLockedPayload | null;
  leaderboard: LeaderboardEntry[];
  isHost: boolean;
  spotifyPlayer?: SpotifyPlayerState;
  error: string;
  onSubmitAnswer: (payload: { titleAnswer: string; artistAnswer: string }) => void;
  onNextQuestion: () => void;
};

export function MultiplayerGamePage({
  room,
  question,
  hostTrack,
  lockedAnswer,
  leaderboard,
  isHost,
  spotifyPlayer,
  error,
  onSubmitAnswer,
  onNextQuestion,
}: Props) {
  const [titleAnswer, setTitleAnswer] = useState('');
  const [artistAnswer, setArtistAnswer] = useState('');
  const [eitherAnswer, setEitherAnswer] = useState('');
  const isEitherMode = room.answerMode === 'either';
  const needsTitle = room.answerMode !== 'artist' && !isEitherMode;
  const needsArtist = room.answerMode !== 'title' && !isEitherMode;
  const isLocked = Boolean(lockedAnswer);
  const answer = lockedAnswer;

  useEffect(() => {
    setTitleAnswer('');
    setArtistAnswer('');
    setEitherAnswer('');
  }, [question?.questionNumber]);

  useEffect(() => {
    if (!isHost || !hostTrack || !spotifyPlayer?.isReady) return;
    void spotifyPlayer.playTrack(hostTrack.trackUri, room.listenDurationSeconds);
  }, [hostTrack?.trackUri, isHost, room.listenDurationSeconds, spotifyPlayer?.isReady]);

  useEffect(() => {
    if (!isHost || !lockedAnswer || !spotifyPlayer) return;
    void spotifyPlayer.pause();
  }, [isHost, lockedAnswer?.questionIndex]);

  async function listen() {
    if (!hostTrack || !spotifyPlayer?.isReady) return;
    await spotifyPlayer.playTrack(hostTrack.trackUri, room.listenDurationSeconds);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isLocked) return;
    onSubmitAnswer({
      titleAnswer: isEitherMode ? eitherAnswer : titleAnswer,
      artistAnswer: isEitherMode ? eitherAnswer : artistAnswer,
    });
  }

  async function next() {
    if (isHost && spotifyPlayer) {
      await spotifyPlayer.pause();
    }
    onNextQuestion();
  }

  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">Room {room.code}</p>
          <h1>
            Question {question?.questionNumber ?? room.currentQuestionIndex + 1}/
            {question?.totalQuestions ?? room.questionCount}
          </h1>
        </div>
        {isHost && (
          <button type="button" onClick={() => void next()}>
            Suivant
          </button>
        )}
      </section>

      {(error || spotifyPlayer?.error) && <p className="error">{error || spotifyPlayer?.error}</p>}

      <div className="room-layout">
        <section className="panel game-panel">
          <div className="cover-placeholder">
            {isHost && answer && hostTrack?.imageUrl ? (
              <img alt={hostTrack.album} src={hostTrack.imageUrl} />
            ) : (
              '?'
            )}
          </div>

          {isHost ? (
            <>
              <button
                type="button"
                onClick={() => void listen()}
                disabled={!hostTrack || !spotifyPlayer?.isReady}
              >
                {spotifyPlayer?.isPlaying
                  ? 'Lecture...'
                  : `Ecouter ${room.listenDurationSeconds}s`}
              </button>
              {!spotifyPlayer?.isReady && <p className="muted">Player Spotify en preparation...</p>}
            </>
          ) : (
            <p className="muted">Ecoute le son du host, puis reponds ici.</p>
          )}

          {!isLocked ? (
            <form className="answer-form" onSubmit={submit}>
              {isEitherMode && (
                <label>
                  Titre ou artiste
                  <input
                    value={eitherAnswer}
                    onChange={(event) => setEitherAnswer(event.target.value)}
                    placeholder="Titre ou artiste"
                  />
                </label>
              )}
              {needsTitle && (
                <label>
                  Titre
                  <input
                    value={titleAnswer}
                    onChange={(event) => setTitleAnswer(event.target.value)}
                    placeholder="Nom du morceau"
                  />
                </label>
              )}
              {needsArtist && (
                <label>
                  Artiste
                  <input
                    value={artistAnswer}
                    onChange={(event) => setArtistAnswer(event.target.value)}
                    placeholder="Artiste"
                  />
                </label>
              )}
              <button type="submit">Valider</button>
            </form>
          ) : answer ? (
            <section className="feedback">
              <h2>{answer.playerPseudo} a repondu</h2>
              <p>
                {answer.correctAnswer.title} -{' '}
                {answer.correctAnswer.artists.join(', ')}
              </p>
              <p className="muted">+{answer.points} point(s)</p>
            </section>
          ) : null}
        </section>

        <section className="panel">
          <h2>Classement</h2>
          <div className="leaderboard">
            {leaderboard.map((entry) => (
              <div className="leaderboard-row" key={entry.id}>
                <span>#{entry.rank}</span>
                <strong>{entry.pseudo}</strong>
                <span>{entry.score} pts</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
