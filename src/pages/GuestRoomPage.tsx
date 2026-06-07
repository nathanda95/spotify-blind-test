import type { PublicRoom } from '../roomTypes';

type Props = {
  room: PublicRoom;
  error: string;
  onLeaveRoom: () => void;
};

export function GuestRoomPage({ room, error, onLeaveRoom }: Props) {
  return (
    <main className="app-shell narrow">
      <section className="panel game-panel">
        <div>
          <p className="eyebrow">Room {room.code}</p>
          <h1>En attente du host</h1>
          <p className="muted">Garde cette page ouverte, la partie demarre automatiquement.</p>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="player-list">
          {room.players.map((player) => (
            <div className="player-row" key={player.id}>
              <strong>{player.pseudo}</strong>
              <span>{player.role === 'host' ? 'Host' : 'Invite'}</span>
            </div>
          ))}
        </div>

        <button className="secondary" type="button" onClick={onLeaveRoom}>
          Quitter
        </button>
      </section>
    </main>
  );
}
