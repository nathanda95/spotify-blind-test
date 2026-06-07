import type { LeaderboardEntry, PublicRoom } from '../roomTypes';

type Props = {
  room: PublicRoom;
  leaderboard: LeaderboardEntry[];
  isHost: boolean;
  onCloseRoom: () => void;
  onBackHome: () => void;
};

export function FinalLeaderboardPage({
  room,
  leaderboard,
  isHost,
  onCloseRoom,
  onBackHome,
}: Props) {
  return (
    <main className="app-shell">
      <section className="header">
        <div>
          <p className="eyebrow">Room {room.code}</p>
          <h1>Classement final</h1>
        </div>
        {isHost ? (
          <button type="button" onClick={onCloseRoom}>
            Fermer la room
          </button>
        ) : (
          <button type="button" onClick={onBackHome}>
            Accueil
          </button>
        )}
      </section>

      <section className="panel">
        <div className="result-list">
          {leaderboard.map((entry) => (
            <article className="result-row leaderboard-final-row" key={entry.id}>
              <strong>#{entry.rank}</strong>
              <div>
                <strong>{entry.pseudo}</strong>
                <p>{entry.correctAnswers} bonne(s) reponse(s)</p>
              </div>
              <span>{entry.score} pts</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
