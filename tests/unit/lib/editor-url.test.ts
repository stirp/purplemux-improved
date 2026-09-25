import { describe, expect, it } from 'vitest';
import { buildEditorUrl, buildEditorFileUrl, canOpenEditorTarget, isValidEditorPreset, isValidSshHost, parseEditorFileLink } from '@/lib/editor-url';

describe('remote editor URLs', () => {
  it('accepts the persisted remote preset and SSH aliases', () => {
    expect(isValidEditorPreset('vscode-remote')).toBe(true);
    expect(isValidSshHost(' dev-box ')).toBe(true);
    expect(isValidSshHost('user@dev.example.com')).toBe(true);
    for (const host of ['', 'ssh://host', 'host/path', 'host:22', 'host?x=1', 'host name']) {
      expect(isValidSshHost(host)).toBe(false);
      expect(buildEditorUrl('vscode-remote', host, '/repo')).toBeNull();
    }
  });

  it('encodes paths and opens remote folders in a new window', () => {
    expect(buildEditorUrl('vscode-remote', ' dev-box ', '/repo/a #?中'))
      .toBe('vscode://vscode-remote/ssh-remote+dev-box/repo/a%20%23%3F%E4%B8%AD/?windowId=_blank');
  });

  it('marks remote files with a line so VS Code does not open them as folders', () => {
    expect(buildEditorFileUrl('vscode-remote', 'dev-box', { path: '/repo/README' }))
      .toBe('vscode://vscode-remote/ssh-remote+dev-box/repo/README:1');
    expect(buildEditorFileUrl('vscode-remote', 'user@host', { path: '/repo/a #.ts', line: 12, column: 3 }))
      .toBe('vscode://vscode-remote/ssh-remote+user%40host/repo/a%20%23.ts:12:3');
  });

  it('allows remote SSH from remote browsers while keeping local IDE restrictions', () => {
    expect(canOpenEditorTarget('vscode-remote', 'vscode://vscode-remote/ssh-remote+dev/repo/', 'server.example')).toBe(true);
    expect(canOpenEditorTarget('vscode', 'vscode://file/repo/', 'server.example')).toBe(false);
    expect(canOpenEditorTarget('vscode', 'vscode://file/repo/', '[::1]')).toBe(true);
    expect(canOpenEditorTarget('vscode-remote', 'javascript:alert(1)', 'localhost')).toBe(false);
  });

  it('preserves existing folder behavior and disabled editors', () => {
    expect(buildEditorUrl('vscode', '', '/repo')).toBe('vscode://file/repo/?windowId=_blank');
    expect(buildEditorUrl('code-server', 'https://editor.test', '/repo')).toBe('https://editor.test?folder=%2Frepo');
    expect(buildEditorUrl('off', '', '/repo')).toBeNull();
    expect(buildEditorFileUrl('off', '', { path: '/repo/a' })).toBeNull();
  });
});

describe('chat file links', () => {
  it.each([
    ['/repo/app.ts:12:3', undefined, { path: '/repo/app.ts', line: 12, column: 3 }],
    ['src/app.ts#L12-L20', '/repo', { path: '/repo/src/app.ts', line: 12 }],
    ['app.ts:12', '/repo', { path: '/repo/app.ts', line: 12 }],
    ['../app.ts#L12C3', '/repo/src', { path: '/repo/app.ts', line: 12, column: 3 }],
    ['file:///repo/a%20%23.ts:2', undefined, { path: '/repo/a #.ts', line: 2 }],
    ['/repo/%E4%B8%AD.ts', undefined, { path: '/repo/中.ts' }],
  ])('resolves %s against its own session directory', (href, cwd, expected) => {
    expect(parseEditorFileLink(href, cwd)).toMatchObject(expected);
  });

  it.each(['https://example.com/a.ts', '//example.com/a.ts', 'mailto:user@example.com', '#section', 'javascript:12', 'data:text/html,test', '/bad%XX', 'file://server/repo/a', '/repo/%00file', '/api?query=1'])('does not treat %s as a file', (href) => {
    expect(parseEditorFileLink(href, '/repo')).toBeNull();
  });

  it('does not guess a directory for relative paths', () => {
    expect(parseEditorFileLink('src/app.ts')).toBeNull();
  });
});
