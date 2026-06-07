import { useEffect, useMemo, useState } from 'react';
import { roomSocket } from '../socket';
import type {
  HostTrackPayload,
  LeaderboardEntry,
  PublicQuestion,
  PublicRoom,
  QuestionLockedPayload,
  RoomRole,
  RoomSetup,
} from '../roomTypes';

type JoinPayload = {
  code: string;
  pseudo: string;
};

export function useRoomSocket() {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [role, setRole] = useState<RoomRole | null>(null);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [hostTrack, setHostTrack] = useState<HostTrackPayload | null>(null);
  const [lockedAnswer, setLockedAnswer] = useState<QuestionLockedPayload | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState('');
  const [closedReason, setClosedReason] = useState('');

  useEffect(() => {
    if (!roomSocket.connected) roomSocket.connect();

    function handleJoined(payload: { room: PublicRoom; playerId: string; role: RoomRole }) {
      setRoom(payload.room);
      setPlayerId(payload.playerId);
      setRole(payload.role);
      setError('');
      setClosedReason('');
    }

    function handleRoomUpdated(nextRoom: PublicRoom) {
      setRoom(nextRoom);
    }

    function handleGameStarted(nextRoom: PublicRoom) {
      setRoom(nextRoom);
      setLockedAnswer(null);
      setQuestion(null);
    }

    function handleQuestionStarted(nextQuestion: PublicQuestion) {
      setQuestion(nextQuestion);
      setLockedAnswer(null);
      setHostTrack(null);
    }

    function handleRoomClosed(payload: { reason?: string }) {
      setClosedReason(payload.reason || 'Room fermee.');
      setRoom(null);
      setQuestion(null);
      setHostTrack(null);
      setLockedAnswer(null);
      setLeaderboard([]);
    }

    roomSocket.on('roomCreated', handleJoined);
    roomSocket.on('roomJoined', handleJoined);
    roomSocket.on('roomUpdated', handleRoomUpdated);
    roomSocket.on('playerJoined', handleRoomUpdated);
    roomSocket.on('playerLeft', handleRoomUpdated);
    roomSocket.on('gameStarted', handleGameStarted);
    roomSocket.on('questionStarted', handleQuestionStarted);
    roomSocket.on('hostPlayTrack', setHostTrack);
    roomSocket.on('questionLocked', setLockedAnswer);
    roomSocket.on('leaderboardUpdated', setLeaderboard);
    roomSocket.on('gameFinished', (payload: { room: PublicRoom; leaderboard: LeaderboardEntry[] }) => {
      setRoom(payload.room);
      setLeaderboard(payload.leaderboard);
    });
    roomSocket.on('roomClosed', handleRoomClosed);
    roomSocket.on('roomError', (payload: { message?: string }) => {
      setError(payload.message || 'Action impossible.');
    });

    return () => {
      roomSocket.off('roomCreated', handleJoined);
      roomSocket.off('roomJoined', handleJoined);
      roomSocket.off('roomUpdated', handleRoomUpdated);
      roomSocket.off('playerJoined', handleRoomUpdated);
      roomSocket.off('playerLeft', handleRoomUpdated);
      roomSocket.off('gameStarted', handleGameStarted);
      roomSocket.off('questionStarted', handleQuestionStarted);
      roomSocket.off('hostPlayTrack', setHostTrack);
      roomSocket.off('questionLocked', setLockedAnswer);
      roomSocket.off('leaderboardUpdated', setLeaderboard);
      roomSocket.off('gameFinished');
      roomSocket.off('roomClosed', handleRoomClosed);
      roomSocket.off('roomError');
    };
  }, []);

  return useMemo(
    () => ({
      room,
      playerId,
      role,
      question,
      hostTrack,
      lockedAnswer,
      leaderboard,
      error,
      closedReason,
      clearError: () => setError(''),
      createRoom: () => roomSocket.emit('createRoom'),
      joinRoom: (payload: JoinPayload) => roomSocket.emit('joinRoom', payload),
      startGame: (setup: RoomSetup) => roomSocket.emit('startGame', { code: room?.code, ...setup }),
      submitAnswer: (payload: { titleAnswer: string; artistAnswer: string }) =>
        roomSocket.emit('submitAnswer', { code: room?.code, ...payload }),
      nextQuestion: () => roomSocket.emit('nextQuestion', { code: room?.code }),
      closeRoom: () => roomSocket.emit('closeRoom', { code: room?.code }),
      leaveRoom: () => roomSocket.emit('leaveRoom'),
    }),
    [
      closedReason,
      error,
      hostTrack,
      leaderboard,
      lockedAnswer,
      playerId,
      question,
      role,
      room,
    ],
  );
}
