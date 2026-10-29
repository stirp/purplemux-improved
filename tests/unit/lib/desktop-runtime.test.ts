import { afterEach, expect, it, vi } from 'vitest';
import Module, { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prepareDesktopRuntime } from '../../../electron/desktop-runtime';

const mocks = vi.hoisted(() => ({ resolveShell: vi.fn() }));
vi.mock('../../../electron/shell-env', () => ({ applyResolvedShellEnv: mocks.resolveShell }));
const resetPaths = () => (Module as unknown as { _initPaths: () => void })._initPaths();
afterEach(() => { vi.unstubAllEnvs(); resetPaths(); vi.restoreAllMocks(); });

it('resolves shell before capturing pristine environment and enabling standalone-only dependencies', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pmux-runtime-'));
  try {
    const modules = path.join(directory, '.next', 'standalone', 'node_modules');
    const name = `pmux-runtime-probe-${path.basename(directory).toLowerCase()}`;
    const dependency = path.join(modules, name);
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, 'index.js'), 'module.exports = "standalone-loaded";');
    const require = createRequire(path.join(directory, 'dist-electron', 'main.js'));
    vi.stubEnv('__PMUX_PRISTINE_ENV', undefined);
    vi.stubEnv('NODE_PATH', undefined);
    vi.stubEnv('PATH', '/finder/path');
    resetPaths();
    let resolveShell!: () => void;
    mocks.resolveShell.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveShell = () => { vi.stubEnv('PATH', '/resolved/shell/path'); vi.stubEnv('NODE_PATH', '/shell/modules'); resolve(); };
    }));
    const ready = prepareDesktopRuntime(directory);
    expect(process.env.__PMUX_PRISTINE_ENV).toBeUndefined();
    expect(() => require(name)).toThrow();
    resolveShell();
    await ready;
    expect(JSON.parse(process.env.__PMUX_PRISTINE_ENV!)).toMatchObject({ PATH: '/resolved/shell/path', NODE_PATH: '/shell/modules' });
    expect(process.env.NODE_PATH?.split(path.delimiter)).toEqual([modules, '/shell/modules']);
    expect(require(name)).toBe('standalone-loaded');
    await prepareDesktopRuntime(directory);
    expect(process.env.NODE_PATH?.split(path.delimiter)).toEqual([modules, '/shell/modules']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
