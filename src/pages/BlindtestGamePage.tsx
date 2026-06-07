import { FormEvent, useState } from 'react';
import { answerBlindtest, finishBlindtest } from '../api/blindtestApi';
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer';
import type { BlindtestPayload, BlindtestQuestion } from '../types';

type Props = {
  game: BlindtestPayload;
  onGameChange: (game: BlindtestPayload) => void;
  onFinished: (game: BlindtestPayload) => void;
};

export function BlindtestGamePage({ game, onGameChange, onFinished }: Props) {
  const player = useSpotifyPlayer();
  const [currentIndex, setCurrentIndex] = useState(game.session.currentQuestionIndex);
  const [titleAnswer, setTitleAnswer] = useState('');
  const [artistAnswer, setArtistAnswer] = useState('');
  const [eitherAnswer, setEitherAnswer] = useState('');
  const [feedback, setFeedback] = useState<BlindtestQuestion | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const question = game.questions[currentIndex];
  const isEitherMode = game.session.answerMode === 'either';
  const needsTitle = game.session.answerMode !== 'artist' && !isEitherMode;
  const needsArtist = game.session.answerMode !== 'title' && !isEitherMode;

  async function listen() {
    if (!question) return;
    await player.playTrack(question.trackUri, game.session.listenDurationSeconds);
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    if (!question) return;
    setIsSubmitting(true);
    setError('');
    try {
      const result = await answerBlindtest(game.session.id, {
        trackId: question.spotifyTrackId,
        titleAnswer: isEitherMode ? eitherAnswer : titleAnswer,
        artistAnswer: isEitherMode ? eitherAnswer : artistAnswer,
      });
      const updatedQuestions = game.questions.map((item) =>
        item.spotifyTrackId === question.spotifyTrackId ? result.answer : item,
      );
      const updatedGame = {
        ...game,
        session: {
          ...game.session,
          score: result.score,
          currentQuestionIndex: currentIndex + 1,
        },
        questions: updatedQuestions,
      };
      setFeedback(result.answer);
      onGameChange(updatedGame);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation impossible.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function nextQuestion() {
    setTitleAnswer('');
    setArtistAnswer('');
    setEitherAnswer('');
    setFeedback(null);

    if (currentIndex + 1 >= game.questions.length) {
      const finished = await finishBlindtest(game.session.id);
      onFinished(finished);
      return;
    }

    setCurrentIndex((value) => value + 1);
  }

  if (!question) {
    return null;
  }

  return (
    <main className="app-shell narrow">
      <section className="panel game-panel">
        <div className="game-topline">
          <span>
            Question {currentIndex + 1}/{game.questions.length}
          </span>
          <strong>
            Score {game.session.score}/{game.session.maxScore}
          </strong>
        </div>

        <div className="cover-placeholder">
          {feedback?.imageUrl ? <img alt={feedback.album} src={feedback.imageUrl} /> : '?'}
        </div>

        <button type="button" onClick={() => void listen()} disabled={!player.isReady}>
          {player.isPlaying ? 'Lecture...' : `Ecouter ${game.session.listenDurationSeconds}s`}
        </button>
        {!player.isReady && <p className="muted">Player Spotify non pret.</p>}
        {(player.error || error) && <p className="error">{player.error || error}</p>}

        {!feedback ? (
          <form className="answer-form" onSubmit={submitAnswer}>
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
                  placeholder="Artiste principal"
                />
              </label>
            )}
            <button type="submit" disabled={isSubmitting}>
              Valider
            </button>
          </form>
        ) : (
          <section className="feedback">
            <h2>{feedback.points > 0 ? 'Bien joue' : 'Rate'}</h2>
            <p>
              {feedback.expectedTitle} - {feedback.expectedArtists?.join(', ')}
            </p>
            <p className="muted">+{feedback.points} point(s)</p>
            <button type="button" onClick={() => void nextQuestion()}>
              {currentIndex + 1 >= game.questions.length ? 'Voir le resultat' : 'Question suivante'}
            </button>
          </section>
        )}
      </section>
    </main>
  );
}
