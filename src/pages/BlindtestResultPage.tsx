import type { BlindtestPayload } from '../types';

type Props = {
  game: BlindtestPayload;
  onBackToDashboard: () => void;
};

export function BlindtestResultPage({ game, onBackToDashboard }: Props) {
  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">Resultat</p>
          <h1>
            {game.session.score}/{game.session.maxScore} points
          </h1>
        </div>
        <button type="button" onClick={onBackToDashboard}>
          Tableau de bord
        </button>
      </section>

      <section className="panel">
        <h2>Detail question par question</h2>
        <div className="result-list">
          {game.questions.map((question) => (
            <article className="result-row" key={question.id}>
              {question.imageUrl && <img alt={question.album} src={question.imageUrl} />}
              <div>
                <strong>
                  {question.expectedTitle} - {question.expectedArtists?.join(', ')}
                </strong>
                <p>
                  Titre: {question.isTitleCorrect ? 'correct' : 'incorrect'} | Artiste:{' '}
                  {question.isArtistCorrect ? 'correct' : 'incorrect'}
                </p>
              </div>
              <span>+{question.points}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
