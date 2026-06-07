import type { AnswerMode } from './types';

export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type RoomRole = 'host' | 'guest';

export type RoomPlayer = {
  id: string;
  pseudo: string;
  role: RoomRole;
  connected: boolean;
  score: number;
  correctAnswers: number;
};

export type PublicRoom = {
  code: string;
  status: RoomStatus;
  host: {
    id: number;
    displayName: string;
  };
  players: RoomPlayer[];
  currentQuestionIndex: number;
  questionCount: number;
  answerMode: AnswerMode;
  listenDurationSeconds: number;
  currentQuestionLockedByPlayerId: string | null;
};

export type RoomSetup = {
  sourceType: 'liked' | 'playlist';
  playlistId?: string;
  questionCount: number;
  answerMode: AnswerMode;
  listenDurationSeconds: number;
};

export type PublicQuestion = {
  questionNumber: number;
  totalQuestions: number;
  listenDurationSeconds: number;
  answerMode: AnswerMode;
};

export type HostTrackPayload = {
  trackUri: string;
  title: string;
  artists: string[];
  album: string;
  imageUrl: string;
  durationMs: number;
};

export type QuestionLockedPayload = {
  questionIndex: number;
  playerId: string;
  playerPseudo: string;
  titleAnswer: string;
  artistAnswer: string;
  isTitleCorrect: boolean;
  isArtistCorrect: boolean;
  points: number;
  responseMs: number;
  correctAnswer: {
    title: string;
    artists: string[];
  };
};

export type LeaderboardEntry = {
  rank: number;
  id: string;
  pseudo: string;
  role: RoomRole;
  score: number;
  correctAnswers: number;
  averageResponseMs: number | null;
};
