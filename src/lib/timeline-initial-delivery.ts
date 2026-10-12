import type { ISessionStats, TTimelineServerMessage } from '@/types/timeline';

export const deliverTimelineInit = (
  init: Extract<TTimelineServerMessage, { type: 'timeline:init' }>,
  send: (message: TTimelineServerMessage) => void,
  readStats: () => Promise<ISessionStats | null>,
  isCurrent: () => boolean,
  onError: (error: unknown) => void,
): void => {
  if (!isCurrent()) return;
  send({ ...init, sessionStats: null });
  void Promise.resolve().then(readStats).then((stats) => {
    if (stats && isCurrent()) send({ type: 'timeline:stats-update', sessionStats: stats });
  }).catch(onError);
};
