import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openFiles: vi.fn(), meta: vi.fn(), find: vi.fn(), readFile: vi.fn(), readdir: vi.fn(), access: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/user' } }));
vi.mock('fs/promises', () => ({ default: { readFile: mocks.readFile, readdir: mocks.readdir, access: mocks.access, constants: { R_OK: 4 } } }));
vi.mock('@/lib/process-utils', () => ({ getProcessOpenFiles: mocks.openFiles }));
vi.mock('@/lib/providers/codex/session-detection', () => ({ readCodexSessionMeta: mocks.meta, findCodexSessionById: mocks.find }));
vi.mock('@/lib/providers/claude/session-detection', () => ({ toClaudeProjectName: (cwd: string) => cwd.replace(/\//g, '-') }));
import { classifyAgentArgv, resolveLocalAgentSession } from '@/lib/local-agent-session';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const started = '2026-10-19T10:00:00.000Z';
beforeEach(() => { vi.resetAllMocks(); mocks.openFiles.mockResolvedValue([]); mocks.readdir.mockResolvedValue([]); mocks.access.mockResolvedValue(undefined); });

describe('local agent identity and transcripts', () => {
  it('recognizes executables and known Node wrappers without matching prompts or shell commands', () => {
    expect(classifyAgentArgv(['/vendor/codex/codex', 'resume', id])).toBe('codex');
    expect(classifyAgentArgv(['claude'])).toBe('claude');
    expect(classifyAgentArgv(['node', '/pkg/@anthropic-ai/claude-code/cli.js'])).toBe('claude');
    expect(classifyAgentArgv(['node', '/pkg/@openai/codex/bin/codex.js'])).toBe('codex');
    expect(classifyAgentArgv(['node', '/app/server.js', 'codex'])).toBeNull();
    expect(classifyAgentArgv(['sh', '-c', 'claude'])).toBeNull();
    expect(classifyAgentArgv(['rg', 'codex'])).toBeNull();
  });
  it('uses open Codex transcripts and refuses ambiguity, subagents and custom roots', async () => {
    mocks.openFiles.mockResolvedValue(['/user/.codex/sessions/a.jsonl']);
    mocks.meta.mockResolvedValue({ sessionId: id, cwd: '/repo', isSubagent: false });
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex'], started)).toEqual({ sessionId: id, jsonlPath: '/user/.codex/sessions/a.jsonl' });
    mocks.openFiles.mockResolvedValue(['/user/.codex/sessions/a.jsonl', '/user/.codex/sessions/b.jsonl']);
    mocks.meta.mockImplementation(async (file: string) => ({ sessionId: file.endsWith('a.jsonl') ? id : other, cwd: '/repo', isSubagent: false }));
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex'], started)).toBeNull();
    mocks.meta.mockResolvedValue({ sessionId: id, cwd: '/repo', isSubagent: true });
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex'], started)).toBeNull();
    mocks.openFiles.mockResolvedValue(['/custom/sessions/a.jsonl']);
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex'], started)).toBeNull();
  });
  it('requires Claude PID registration to match PID, cwd and process lifetime', async () => {
    mocks.readdir.mockResolvedValue(['pid.json']);
    mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 5, cwd: '/repo', startedAt: Date.parse(started) + 500, sessionId: id }));
    expect((await resolveLocalAgentSession(5, 'claude', '/repo', ['claude'], started))?.sessionId).toBe(id);
    expect(await resolveLocalAgentSession(6, 'claude', '/repo', ['claude'], started)).toBeNull();
    expect(await resolveLocalAgentSession(5, 'claude', '/other', ['claude'], started)).toBeNull();
    expect(await resolveLocalAgentSession(5, 'claude', '/repo', ['claude'], '2026-10-20T10:00:00Z')).toBeNull();
  });
  it('never guesses the latest session for a cwd; explicit resume needs an existing matching transcript', async () => {
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex'], started)).toBeNull();
    expect(mocks.find).not.toHaveBeenCalled();
    mocks.find.mockResolvedValue({ sessionId: id, cwd: '/repo', jsonlPath: '/user/.codex/sessions/a.jsonl' });
    expect((await resolveLocalAgentSession(5, 'codex', '/repo', ['codex', 'resume', id], started))?.sessionId).toBe(id);
    mocks.find.mockResolvedValue({ sessionId: id, cwd: '/other' });
    expect(await resolveLocalAgentSession(5, 'codex', '/repo', ['codex', 'resume', id], started)).toBeNull();
    mocks.access.mockRejectedValue(new Error('denied'));
    expect(await resolveLocalAgentSession(5, 'claude', '/repo', ['claude', '--resume', id], started)).toBeNull();
  });
});
