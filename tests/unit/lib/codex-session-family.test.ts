import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => mocks.home } };
});
import { collectCodexSessionFamily } from '@/lib/codex-session-family';

beforeEach(async () => { mocks.home = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-codex-family-')); });
afterEach(async () => { await fs.rm(mocks.home, { recursive: true, force: true }); });

const write = async (id: string, meta: object, archived = false) => {
  const directory = path.join(mocks.home, '.codex', archived ? 'archived_sessions' : 'sessions/2020/01/01');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id, ...meta } }) + '\n');
};

describe('Codex session family', () => {
  it('finds old, archived and nested descendants without including ordinary forks or unrelated reviews', async () => {
    await write('review', { source: { subagent: 'review' }, parent_thread_id: 'parent', cwd: '/different' });
    await write('nested', { source: { subagent: { thread_spawn: { parent_thread_id: 'review' } } } }, true);
    await write('old-child', { source: { subagent: 'review' }, forked_from_id: 'parent' });
    await write('user-fork', { source: 'cli', forked_from_id: 'parent' });
    await write('other-review', { source: { subagent: 'review' }, parent_thread_id: 'other' });
    await write('unknown-review', { source: { subagent: 'review' } });
    const ids = await collectCodexSessionFamily('parent');
    expect(ids.slice().sort()).toEqual(['nested', 'old-child', 'parent', 'review']);
    expect(ids.indexOf('nested')).toBeLessThan(ids.indexOf('review'));
    expect(ids.at(-1)).toBe('parent');
  });

  it('prioritizes explicit parent over legacy fork metadata and deduplicates cycles', async () => {
    await write('child', { source: { subagent: 'review' }, parent_thread_id: 'parent', forked_from_id: 'other' });
    await write('parent', { source: { subagent: 'review' }, parent_thread_id: 'child' });
    expect(await collectCodexSessionFamily('parent')).toEqual(['child', 'parent']);
    expect(await collectCodexSessionFamily('other')).toEqual(['other']);
  });

  it('ignores malformed metadata and symlinks outside the session roots', async () => {
    await write('broken', {});
    const directory = path.join(mocks.home, '.codex/sessions/2020/01/01');
    await fs.writeFile(path.join(directory, 'broken.jsonl'), '{');
    const outside = path.join(mocks.home, 'outside.jsonl');
    await fs.writeFile(outside, JSON.stringify({ type: 'session_meta', payload: { id: 'outside', source: { subagent: 'review' }, parent_thread_id: 'parent' } }));
    await fs.symlink(outside, path.join(directory, 'linked.jsonl'));
    expect(await collectCodexSessionFamily('parent')).toEqual(['parent']);
  });

  it('allows a parent with no remaining files to be retried', async () => {
    expect(await collectCodexSessionFamily('missing')).toEqual(['missing']);
  });
});
