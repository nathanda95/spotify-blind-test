export type AnswerMode = 'title' | 'artist' | 'both';

export type User = {
  id: number;
  spotify_id: string;
  display_name: string;
  email: string;
};

export type SpotifyTrack = {
  spotifyTrackId: string;
  uri: string;
  title: string;
  artists: string[];
  album: string;
  imageUrl: string;
  durationMs: number;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  trackCount: number;
  imageUrl: string;
};

export type BlindtestSession = {
  id: number;
  sourceType: string;
  sourceName: string;
  questionCount: number;
  answerMode: AnswerMode;
  listenDurationSeconds: number;
  score: number;
  maxScore: number;
  currentQuestionIndex: number;
  isFinished: boolean;
  createdAt: string;
};

export type BlindtestQuestion = {
  id: number;
  questionIndex: number;
  spotifyTrackId: string;
  trackUri: string;
  album: string;
  imageUrl: string;
  durationMs: number;
  userTitleAnswer: string;
  userArtistAnswer: string;
  isTitleCorrect: boolean;
  isArtistCorrect: boolean;
  points: number;
  answeredAt: string | null;
  expectedTitle?: string;
  expectedArtists?: string[];
};

export type BlindtestPayload = {
  session: BlindtestSession;
  questions: BlindtestQuestion[];
};
