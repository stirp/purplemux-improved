import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ panes: vi.fn(), poll: vi.fn(), idle: vi.fn() }));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: mocks.panes }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ poll: mocks.poll, areSessionsIdle: mocks.idle }) }));
import { assertUpdateSessionsIdle } from '@/lib/app-update-guard';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.panes.mockResolvedValue(new Map([['pt-task', { command: 'bash' }]]));
  mocks.idle.mockReturnValue(true);
});

describe('update task guard', () => {
  it('refreshes from a strict snapshot and reuses existing idle policy', async () => {
    await assertUpdateSessionsIdle();
    expect(mocks.panes).toHaveBeenCalledWith({ strict: true });
    expect(mocks.poll).toHaveBeenCalledWith(await mocks.panes.mock.results[0].value);
    expect(mocks.idle).toHaveBeenCalledWith(['pt-task'], await mocks.panes.mock.results[0].value);
  });
  it.each(['busy', 'query', 'poll', 'extra-pane'])('blocks %s instead of assuming idle', async (kind) => {
    if (kind === 'busy') mocks.idle.mockReturnValue(false);
    if (kind === 'query') mocks.panes.mockRejectedValue(new Error('tmux failed'));
    if (kind === 'poll') mocks.poll.mockRejectedValue(new Error('refresh failed'));
    if (kind === 'extra-pane') mocks.panes.mockResolvedValue(new Map([['pt-task:123', {}]]));
    await expect(assertUpdateSessionsIdle()).rejects.toThrow();
  });
});
