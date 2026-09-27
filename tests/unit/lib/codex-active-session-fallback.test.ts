import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ value: '' }));
const processUtils = vi.hoisted(() => ({
  getChildPids: vi.fn(),
  getProcessArgs: vi.fn(),
  getProcessCwd: vi.fn(),
  getProcessStartTimeMs: vi.fn(),
  isProcessRunning: vi.fn(),
}));

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => mockHome.value },
    homedir: () => mockHome.value,
  };
});

vi.mock('@/lib/process-utils', () => processUtils);

vi.mock('@/lib/providers/codex/preflight', () => ({
  runCodexPreflight: vi.fn(async () => ({
    installed: true,
    version: null,
    binaryPath: null,
  })),
}));

const writeCodexSession = async (home: string, sessionId: string, cwd: string): Promise<string> => {
  const now = new Date();
  const dayDir = path.join(
    home,
    '.codex',
    'sessions',
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  );
  await fs.mkdir(dayDir, { recursive: true });
  const jsonlPath = path.join(dayDir, `rollout-${sessionId}.jsonl`);
  await fs.writeFile(jsonlPath, JSON.stringify({
    type: 'session_meta',
    timestamp: new Date(Date.now() - 5_000).toISOString(),
    payload: {
      id: sessionId,
      timestamp: new Date(Date.now() - 5_000).toISOString(),
      cwd,
    },
  }) + '\n');
  return jsonlPath;
};

describe('codex active session detection fallback', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHome.value = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-home-'));
  });

  it('never selects a newer review child as the root cwd fallback', async () => {
    const cwd = '/tmp/project-review';
    const root = await writeCodexSession(mockHome.value, 'root-session', cwd);
    const child = await writeCodexSession(mockHome.value, 'review-session', cwd);
    const meta = JSON.parse(await fs.readFile(child, 'utf8'));
    meta.payload.source = { subagent: 'review' };
    await fs.writeFile(child, JSON.stringify(meta) + '\n');
    await fs.utimes(root, new Date(0), new Date(0));
    const { findLatestCodexSessionForCwd } = await import('@/lib/providers/codex/session-detection');
    expect((await findLatestCodexSessionForCwd(cwd))?.sessionId).toBe('root-session');
  });

  it('does not attach the latest cwd session unless cwd fallback is explicit', async () => {
    const cwd = '/tmp/project-a';
    const sessionId = '55555555-5555-4555-8555-555555555555';
    const jsonlPath = await writeCodexSession(mockHome.value, sessionId, cwd);

    processUtils.getChildPids.mockResolvedValue([1234]);
    processUtils.getProcessArgs.mockResolvedValue('codex');
    processUtils.getProcessCwd.mockResolvedValue(cwd);
    processUtils.getProcessStartTimeMs.mockResolvedValue(Date.now() - 10_000);

    const { detectActiveSession } = await import('@/lib/providers/codex/session-detection');

    const defaultInfo = await detectActiveSession(999);
    expect(defaultInfo.status).toBe('running');
    expect(defaultInfo.sessionId).toBeNull();
    expect(defaultInfo.jsonlPath).toBeNull();
    expect(defaultInfo.cwd).toBe(cwd);

    const fallbackInfo = await detectActiveSession(999, undefined, { allowCwdFallback: true });
    expect(fallbackInfo.status).toBe('running');
    expect(fallbackInfo.sessionId).toBe(sessionId);
    expect(fallbackInfo.jsonlPath).toBe(jsonlPath);
  });
});
