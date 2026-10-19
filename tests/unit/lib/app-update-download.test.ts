import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ mkdir: vi.fn(), mkdtemp: vi.fn(), readFile: vi.fn(), access: vi.fn(), exec: vi.fn() }));
vi.mock('node:fs/promises', () => ({ default: mocks }));
vi.mock('node:child_process', () => ({ execFile: mocks.exec }));
vi.mock('@/lib/app-update-guard', () => ({ assertUpdateSessionsIdle: vi.fn() }));
import { downloadServerUpdate } from '@/lib/app-update-server';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mkdtemp.mockResolvedValue('/isolated/updates/0.6.0-staging');
  mocks.readFile.mockResolvedValue(JSON.stringify({ name: 'purplemux-improved', version: '0.6.0' }));
  mocks.exec.mockImplementation((_command, _args, _options, callback) => callback(null, { stdout: '', stderr: '' }));
});

describe('server update installation', () => {
  it('installs an exact official version in staging without global writes or lifecycle scripts', async () => {
    const directory = await downloadServerUpdate('0.6.0');
    expect(directory).toBe('/isolated/updates/0.6.0-staging/node_modules/purplemux-improved');
    const [command, args, options] = mocks.exec.mock.calls[0];
    expect(command).toBe('npm');
    expect(args).toEqual(['install', '--prefix', '/isolated/updates/0.6.0-staging', '--registry', 'https://registry.npmjs.org', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts', 'purplemux-improved@0.6.0']);
    expect(options.timeout).toBe(600_000);
    expect(mocks.access).toHaveBeenCalledTimes(3);
    expect(mocks.exec.mock.calls[1][1]).toEqual(['--check', directory + '/dist/server.js']);
  });
  it('rejects commands disguised as versions before any filesystem or process action', async () => {
    await expect(downloadServerUpdate('0.6.0;echo bad')).rejects.toThrow('Invalid version');
    expect(mocks.mkdir).not.toHaveBeenCalled();
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('rejects mismatched packages and incomplete installations', async () => {
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ name: 'different-package', version: '0.6.0' }));
    await expect(downloadServerUpdate('0.6.0')).rejects.toThrow('mismatch');
    mocks.access.mockRejectedValueOnce(new Error('missing server'));
    await expect(downloadServerUpdate('0.6.0')).rejects.toThrow('missing server');
  });
});
