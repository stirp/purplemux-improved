import { getAllPanesInfo } from '@/lib/tmux';
import { getStatusManager } from '@/lib/status-manager';

export const assertUpdateSessionsIdle = async (): Promise<void> => {
  const panes = await getAllPanesInfo({ strict: true });
  const sessions = [...panes.keys()].filter((name) => name.startsWith('pt-'));
  const manager = getStatusManager();
  await manager.poll(panes);
  if (sessions.some((name) => name.includes(':')) || !manager.areSessionsIdle(sessions, panes)) {
    throw new Error('Tasks are running or their state is unknown. Retry when all sessions are idle.');
  }
};
