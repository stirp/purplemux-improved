import { beforeEach, describe, expect, it, vi } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: exec }) }));
import { getAllPanesInfo } from '@/lib/tmux';

beforeEach(() => vi.resetAllMocks());
describe('strict worktree session checks', () => {
  it('keeps all panes in a session so a second pane cannot hide a worktree user', async () => {
    exec.mockResolvedValue({ stdout: 'pt-task\tbash\t/worktree\t101\t123\npt-task\tbash\t/elsewhere\t102\t124\n' });
    const panes = await getAllPanesInfo({ strict: true });
    expect([...panes.values()].map((pane) => pane.path)).toEqual(['/worktree', '/elsewhere']);
    expect(await getAllPanesInfo()).toHaveLength(1);
  });
  it('accepts an absent tmux server but rejects permission errors and unavailable binaries', async () => {
    exec.mockRejectedValue({ stderr: 'no server running on /tmp/tmux-1000/purple\n' });
    expect((await getAllPanesInfo({ strict: true })).size).toBe(0);
    exec.mockRejectedValue({ stderr: 'error connecting to /tmp/tmux-1000/purple (No such file or directory)\n' });
    expect((await getAllPanesInfo({ strict: true })).size).toBe(0);
    exec.mockRejectedValue({ stderr: 'error connecting to /tmp/tmux-1000/purple (Permission denied)' });
    await expect(getAllPanesInfo({ strict: true })).rejects.toBeDefined();
    exec.mockRejectedValue({ code: 'ENOENT' });
    await expect(getAllPanesInfo({ strict: true })).rejects.toBeDefined();
    expect((await getAllPanesInfo()).size).toBe(0);
  });
  it('rejects incomplete pane information', async () => {
    exec.mockResolvedValue({ stdout: 'pt-task\tbash\t\t101\t123\n' });
    await expect(getAllPanesInfo({ strict: true })).rejects.toThrow('Invalid tmux pane information');
  });
});
