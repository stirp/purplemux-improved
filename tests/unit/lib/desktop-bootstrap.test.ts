import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'tsup';
import { expect, it, vi } from 'vitest';

it('loads the packaged main entry without root dependencies or premature shell capture', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pmux-bootstrap-'));
  try {
    await build({ config: 'electron/tsup.config.ts', outDir: directory, silent: true });
    const source = await readFile(path.join(directory, 'main.js'), 'utf8');
    const app = { isPackaged: true, on: vi.fn(), requestSingleInstanceLock: () => true };
    const electron = { app, ipcMain: { handle: vi.fn() } };
    const nodeRequire = createRequire(path.join(directory, 'main.js'));
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', PATH: '/usr/bin' };
    const processStub = { ...process, env, execPath: '/opt/purplemux/purplemux' };
    const require = vi.fn((id: string) => {
      if (id === 'electron') return electron;
      if (!isBuiltin(id)) throw new Error(`Packaged root dependency unavailable: ${id}`);
      if (id === 'process' || id === 'node:process') return processStub;
      if (id === 'fs' || id === 'node:fs') return {
        ...nodeRequire(id),
        readFileSync: () => { throw Object.assign(new Error('No user configuration'), { code: 'ENOENT' }); },
      };
      return nodeRequire(id);
    });
    runInNewContext('globalThis.global = globalThis;\n' + source, {
      require, process: processStub, module: { exports: {} }, exports: {},
      __dirname: directory, __filename: path.join(directory, 'main.js'),
      console, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    });
    expect(app.on).toHaveBeenCalledWith('ready', expect.any(Function));
    expect(env.__PMUX_PRISTINE_ENV).toBeUndefined();
    expect(require.mock.calls.some(([id]) => ['zod', 'dayjs', 'pino'].includes(id))).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
