import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { ensureHookSettings } from '@/lib/hook-settings';
import { CLAUDE_LAUNCHER_BOOTSTRAP, CLAUDE_LAUNCHER_FILENAME, CLAUDE_LAUNCHER_SCRIPT } from '@/lib/providers/claude/launcher';
import vm from 'node:vm';

vi.mock('fs/promises', () => ({ default: {
  mkdir: vi.fn(),
  readFile: vi.fn().mockRejectedValue(new Error('missing')),
  writeFile: vi.fn(),
} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), error: vi.fn() }) }));

it('installs the launcher at the path loaded by the short terminal command', async () => {
  await ensureHookSettings(8022);
  const target = path.join(os.homedir(), '.purplemux', CLAUDE_LAUNCHER_FILENAME);
  expect(fs.writeFile).toHaveBeenCalledWith(target, CLAUDE_LAUNCHER_SCRIPT, { mode: 0o600 });
  const load = vi.fn((name: string) => {
    if (name === 'node:path') return path;
    if (name === 'node:os') return os;
  });
  vm.runInNewContext(CLAUDE_LAUNCHER_BOOTSTRAP, { require: load });
  expect(load).toHaveBeenLastCalledWith(target);
});

it('fails initialization if the launcher cannot be installed', async () => {
  vi.mocked(fs.writeFile).mockRejectedValue(new Error('write failed'));
  await expect(ensureHookSettings(8022)).rejects.toThrow('write failed');
});
