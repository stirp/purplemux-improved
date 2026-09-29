vi.mock('@/lib/config-store', () => ({ getAgentEnvironment: async (provider: 'claude' | 'codex') => ({ AGENT_ONLY: provider, SHARED: provider, [`${provider.toUpperCase()}_ONLY_KEY`]: 'private' }) }));
import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const runtime = vi.hoisted(() => ({ shell: '', environment: {} as NodeJS.ProcessEnv }));
vi.mock('@/lib/preflight', () => ({ getShellPath: async () => '/nonexistent-agent-test-bin' }));
vi.mock('@/lib/shell-env', () => ({
  defaultShell: () => runtime.shell,
  buildShellEnv: () => runtime.environment,
}));
import { callAgentText } from '@/lib/agent-text';

afterEach(() => vi.useRealTimers());

it.skipIf(process.platform === 'win32').each(existsSync('/usr/bin/fish') ? ['sh', 'fish'] : ['sh'])('kills the %s shell, Claude child and grandchild before cleaning the temporary directory on timeout', async (shell) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-process-test-'));
  const processes: number[] = [];
  let execution: Promise<string | Error> | undefined;
  try {
    runtime.shell = path.join(root, 'login-shell');
    const script = path.join(root, 'claude.cjs');
    runtime.environment = { ...process.env, NODE_BINARY: process.execPath, TEST_ROOT: root, TEST_SCRIPT: script };
    await fs.writeFile(runtime.shell, '#!/bin/sh\necho $$ > "$TEST_ROOT/shell.pid"\nclaude() { "$NODE_BINARY" "$TEST_SCRIPT"; }\nclaude\n', { mode: 0o700 });
    if (shell === 'fish') {
      runtime.shell = '/usr/bin/fish';
      runtime.environment.HOME = root;
      runtime.environment.XDG_CONFIG_HOME = path.join(root, 'config');
      const functions = path.join(root, 'config/fish/functions');
      await fs.mkdir(functions, { recursive: true });
      await fs.writeFile(path.join(functions, 'claude.fish'), 'function claude\n echo $fish_pid > "$TEST_ROOT/shell.pid"\n "$NODE_BINARY" "$TEST_SCRIPT"\nend\n');
    }
    await fs.writeFile(script, `
      const fs = require('node:fs');
      const path = require('node:path');
      const role = process.argv[2] || 'claude';
      process.on('SIGTERM', () => {});
      fs.writeFileSync(path.join(process.env.TEST_ROOT, role + '.json'), JSON.stringify({ pid: process.pid, cwd: process.cwd() }));
      if (role === 'claude') require('node:child_process').spawn(process.execPath, [__filename, 'grandchild'], { stdio: 'inherit' });
      setInterval(() => fs.appendFileSync(path.join(process.env.TEST_ROOT, role + '.heartbeat'), '.'), 20);
    `);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    execution = callAgentText('claude', 'title', 'instructions', { textOnly: true }).catch((error: Error) => error);
    let cwd = '';
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const child = JSON.parse(await fs.readFile(path.join(root, 'claude.json'), 'utf8'));
        const grandchild = JSON.parse(await fs.readFile(path.join(root, 'grandchild.json'), 'utf8'));
        processes.push(Number(await fs.readFile(path.join(root, 'shell.pid'), 'utf8')), child.pid, grandchild.pid);
        cwd = child.cwd;
        break;
      } catch { await delay(20); }
    }
    expect(processes).toHaveLength(3);
    await fs.access(cwd);
    await vi.advanceTimersByTimeAsync(120_000);
    const result = await Promise.race([execution, delay(3000).then(() => 'still running')]);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('timed out');
    await expect(fs.access(cwd)).rejects.toThrow();
    for (const pid of processes) {
      if (process.platform === 'linux') {
        const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
        expect(stat === '' || /^\d+ \(.*\) Z /.test(stat)).toBe(true);
      } else {
        expect(() => process.kill(pid, 0)).toThrow();
      }
    }
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    for (const pid of processes) {
      try { process.kill(-pid, 'SIGKILL'); } catch { /* already stopped */ }
      try { process.kill(pid, 'SIGKILL'); } catch { /* already stopped */ }
    }
    if (execution) await Promise.race([execution, delay(1000)]);
    await fs.rm(root, { recursive: true, force: true });
  }
}, 10_000);
