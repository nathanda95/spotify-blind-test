import { requestJson } from './http';
import type { AnswerMode, BlindtestPayload, BlindtestSession } from '../types';

export type CreateBlindtestBody = {
  sourceType: 'liked' | 'playlist';
  playlistId?: string;
  questionCount: number;
  answerMode: AnswerMode;
  listenDurationSeconds: number;
};

export function createBlindtest(body: CreateBlindtestBody) {
  return requestJson<BlindtestPayload>('/api/blindtests', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getBlindtest(id: number) {
  return requestJson<BlindtestPayload>(`/api/blindtests/${id}`);
}

export function answerBlindtest(
  id: number,
  body: { trackId: string; titleAnswer: string; artistAnswer: string },
) {
  return requestJson<{ answer: BlindtestPayload['questions'][number]; score: number }>(
    `/api/blindtests/${id}/answer`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function finishBlindtest(id: number) {
  return requestJson<BlindtestPayload>(`/api/blindtests/${id}/finish`, {
    method: 'POST',
  });
}

export function getBlindtestHistory() {
  return requestJson<BlindtestSession[]>('/api/blindtests/history');
}
