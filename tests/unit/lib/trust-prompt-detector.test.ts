import { describe, expect, it } from 'vitest';

import { getTrustResponseKeys, matchTrustPrompt } from '@/lib/trust-prompt-detector';

describe('matchTrustPrompt', () => {
  it('uses the option prefix instead of explanatory text on the focused row', () => {
    const prompt = matchTrustPrompt('/project\nQuick safety check\n❯ No, exit   (Yes, I trust this folder)\n  Yes, I trust this folder')!;
    expect(prompt.selection).toEqual({ mode: 'navigation', selectedAnswer: 'no', yesIsFirst: false });
    expect(getTrustResponseKeys(prompt, 'yes')).toEqual(['\x1b[B', '\r']);
  });

  it.each(['     folder', 'folder'])('handles unnumbered soft wraps: %s', (continuation) => {
    const prompt = matchTrustPrompt(`/project\nQuick safety check\n❯ Yes, I trust this\n${continuation}\n  No, exit`)!;
    expect(prompt.selection).toEqual({ mode: 'navigation', selectedAnswer: 'yes', yesIsFirst: true });
  });

  it('reuses narrow numbered option parsing', () => {
    const prompt = matchTrustPrompt('/project\nQuick safety check\n  1No, exit\n❯ 2Yes, I trust this\n       folder')!;
    expect(getTrustResponseKeys(prompt, 'yes')).toEqual(['2', '\r']);
  });

  it('binds the path and selection to the latest block, even across agents', () => {
    const old = '/old\nQuick safety check\n❯ Yes, I trust this folder\n  No, exit';
    const latest = '/new\nQuick safety check\n❯ No, exit\n  Yes, I trust this folder';
    const prompt = matchTrustPrompt(`${old}\n\n${latest}`)!;
    expect(prompt.folderPath).toBe('/new');
    expect(prompt.selection).toEqual({ mode: 'navigation', selectedAnswer: 'no', yesIsFirst: false });
    expect(matchTrustPrompt(`${old}\nQuick safety check\n❯ No, exit\n  Yes, I trust this folder`)).toBeNull();
    const codex = 'You are in /codex\nDo you trust the contents of this directory?\n› 1. Yes, continue\n  2. No, quit';
    expect(matchTrustPrompt(`${old}\n${codex}`)?.agent).toBe('codex');
  });

  it('keeps an unrecognized cursor explicit and never sends numeric fallback', () => {
    const prompt = matchTrustPrompt('/project\nQuick safety check\n  No, exit\n  Yes, I trust this folder')!;
    expect(prompt.selection).toStrictEqual({ mode: 'unavailable' });
    expect(getTrustResponseKeys(prompt, 'yes')).toEqual([]);
  });

  it('handles the unnumbered Claude startup menu with either option selected', () => {
    const snapshot = [
      'Accessing workspace:',
      '/home/stirp/.purplemux/worktrees/ws-X/chore-config-file-review-srp',
      '',
      'Quick safety check: Is this a project you created or one you trust?',
      "Claude Code’ll be able to read, edit, and execute files here.",
      'Security guide',
      '› No, exit',
      '  Yes, I trust this folder',
      'Enter to confirm · Esc to cancel',
    ].join('\n');
    const prompt = matchTrustPrompt(snapshot)!;
    expect(prompt).toEqual({ agent: 'claude', folderPath: '/home/stirp/.purplemux/worktrees/ws-X/chore-config-file-review-srp', selection: { mode: 'navigation', selectedAnswer: 'no', yesIsFirst: false } });
    expect(getTrustResponseKeys(prompt, 'yes')).toEqual(['\x1b[B', '\r']);
    expect(getTrustResponseKeys(prompt, 'no')).toEqual(['\r']);
    const yesSelected = matchTrustPrompt(snapshot.replace('› No, exit', '  No, exit').replace('  Yes,', '❯ Yes,'))!;
    expect(getTrustResponseKeys(yesSelected, 'yes')).toEqual(['\r']);
    expect(getTrustResponseKeys(yesSelected, 'no')).toEqual(['\x1b[A', '\r']);
    const yesFirst = matchTrustPrompt(snapshot.replace('› No, exit\n  Yes, I trust this folder', '  Yes, I trust this folder\n❯ No, exit'))!;
    expect(getTrustResponseKeys(yesFirst, 'yes')).toEqual(['\x1b[A', '\r']);
  });

  it('preserves numbered Claude and Codex responses', () => {
    const prompt = { agent: 'claude' as const, folderPath: '/project', selection: { mode: 'numbered' as const, yesKey: '1', noKey: '2' } };
    expect(getTrustResponseKeys(prompt, 'yes')).toEqual(['1', '\r']);
    expect(getTrustResponseKeys(prompt, 'no')).toEqual(['2', '\r']);
    expect(getTrustResponseKeys({ ...prompt, agent: 'codex' }, 'yes')).toEqual(['1']);
    expect(getTrustResponseKeys({ ...prompt, agent: 'codex' }, 'no')).toEqual(['2']);
  });

  it('Claude trust prompt를 감지하고 폴더 경로를 추출한다', () => {
    const snapshot = [
      '╭───────────────────────────────────────────────────╮',
      '│ Do you trust the files in this folder?            │',
      '│                                                   │',
      '│ /Users/subicura/Workspace/github.com/subicura/foo │',
      '│                                                   │',
      '│ Quick safety check: Claude Code may read files    │',
      '│ in this folder. Reading untrusted files may lead  │',
      '│ Claude Code to behave in unexpected ways.         │',
      '│                                                   │',
      '│ ❯ 1. Yes, I trust this folder                     │',
      '│   2. No, exit                                     │',
      '╰───────────────────────────────────────────────────╯',
    ].join('\n');

    expect(matchTrustPrompt(snapshot)).toEqual({
      agent: 'claude',
      folderPath: '/Users/subicura/Workspace/github.com/subicura/foo',
      selection: { mode: 'numbered', yesKey: '1', noKey: '2' },
    });
  });

  it('Codex trust prompt를 감지하고 cwd 경로를 추출한다', () => {
    const snapshot = [
      '> You are in /Users/subicura/Workspace/github.com/subicura/nextjs-template',
      '',
      '  Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection. Trusting the directory allows project-local config, hooks, and exec policies to load.',
      '',
      '› 1. Yes, continue',
      '  2. No, quit',
      '',
      '  Press enter to continue',
    ].join('\n');

    expect(matchTrustPrompt(snapshot)).toEqual({
      agent: 'codex',
      folderPath: '/Users/subicura/Workspace/github.com/subicura/nextjs-template',
      selection: { mode: 'numbered', yesKey: '1', noKey: '2' },
    });
  });

  it('Codex trust prompt에서 git 저장소 루트 경로를 우선한다', () => {
    const snapshot = [
      '> You are in /Users/subicura/Workspace/github.com/subicura/foo/packages/web',
      '',
      '  Note: You’re in a subdirectory of a Git project. Trusting will apply to the repository root: /Users/subicura/Workspace/github.com/subicura/foo',
      '',
      '  Do you trust the contents of this directory? Working with untrusted contents comes with higher risk of prompt injection.',
      '',
      '› 1. Yes, continue',
      '  2. No, quit',
      '',
      '  Press enter to continue',
    ].join('\n');

    expect(matchTrustPrompt(snapshot)).toEqual({
      agent: 'codex',
      folderPath: '/Users/subicura/Workspace/github.com/subicura/foo',
      selection: { mode: 'numbered', yesKey: '1', noKey: '2' },
    });
  });

  it('관련 없는 출력에서는 null을 반환한다', () => {
    expect(matchTrustPrompt('just a regular shell prompt')).toBeNull();
    expect(matchTrustPrompt('Quick safety check\n(no options shown)')).toBeNull();
    expect(matchTrustPrompt('Do you trust the contents of this directory?')).toBeNull();
  });

  it('절대 경로가 없으면 null을 반환한다', () => {
    const claudeNoPath = [
      'Quick safety check',
      '1. Yes, I trust this folder',
      '2. No, exit',
    ].join('\n');
    expect(matchTrustPrompt(claudeNoPath)).toBeNull();

    const codexNoPath = [
      'Do you trust the contents of this directory?',
      '1. Yes, continue',
      '2. No, quit',
    ].join('\n');
    expect(matchTrustPrompt(codexNoPath)).toBeNull();
  });
});
