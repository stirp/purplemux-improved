import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNativeCommandComposerReady, NativeCommandCompletion } from '@/lib/native-command-completion';

const claude = '────────────────────\n❯\n────────────────────\n  bypass permissions on';
const codex = '› Ask Codex to do anything\n\n  gpt-5.5 high · ~/repo';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('native command completion', () => {
  it.each([['claude', claude], ['codex', codex]] as const)('keeps %s command menus active, then returns after the composer is restored', (provider, idle) => {
    let screen: string = idle;
    const complete = vi.fn();
    const completion = new NativeCommandCompletion(provider, () => screen, complete);
    completion.parsed(screen);
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    screen = provider === 'claude' ? claude.replace('❯', '❯ /model') : codex.replace('› Ask Codex to do anything', '› /model');
    completion.parsed(screen);
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    completion.input('\r');
    screen = 'Select model\n› 1. Current model\n  2. Other model\nEnter to confirm · Esc to go back';
    completion.parsed(screen);
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    completion.input('\r');
    screen = idle;
    completion.parsed(screen);
    vi.advanceTimersByTime(249);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it.each(['\r', '\n', '\x1b', '\x03'])('recognizes completion/cancellation input %j even when the whole menu opens and closes in one frame', (input) => {
    const complete = vi.fn();
    const completion = new NativeCommandCompletion('claude', () => claude, complete);
    completion.input(input);
    vi.advanceTimersByTime(500);
    expect(complete).not.toHaveBeenCalled();
    completion.parsed(claude);
    vi.advanceTimersByTime(250);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('does not treat arrow keys or pasted multiline text as command submission', () => {
    const complete = vi.fn();
    const completion = new NativeCommandCompletion('codex', () => codex, complete);
    for (const input of ['\x1b[A', '\x1b[B', '\x1b[200~first\nsecond\x1b[201~']) {
      completion.input(input);
      completion.parsed(codex);
      vi.advanceTimersByTime(500);
    }
    expect(complete).not.toHaveBeenCalled();
  });

  it('waits for running commands and rejects a transient ready screen before a nested menu', () => {
    let screen = claude;
    const complete = vi.fn();
    const completion = new NativeCommandCompletion('claude', () => screen, complete);
    completion.input('\r');
    screen = claude + '\nesc to interrupt';
    completion.parsed(screen);
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    screen = claude;
    completion.parsed(screen);
    vi.advanceTimersByTime(100);
    screen = claude + '\nEnter to select · Esc to cancel';
    completion.parsed(screen);
    vi.advanceTimersByTime(1000);
    expect(complete).not.toHaveBeenCalled();
    screen = claude;
    completion.parsed(screen);
    vi.advanceTimersByTime(250);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('cancels pending restoration on input, tab switch, and disposal', () => {
    const complete = vi.fn();
    const completion = new NativeCommandCompletion('codex', () => codex, complete);
    completion.input('\r');
    completion.parsed(codex);
    completion.input('\x1b[B');
    vi.advanceTimersByTime(500);
    expect(complete).not.toHaveBeenCalled();
    completion.parsed(codex);
    completion.cancelPending();
    vi.advanceTimersByTime(500);
    expect(complete).not.toHaveBeenCalled();
    completion.parsed(codex);
    vi.advanceTimersByTime(250);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('checks the latest screen before restoring input and rejects stale composers behind menus', () => {
    let screen = codex;
    const complete = vi.fn();
    const completion = new NativeCommandCompletion('codex', () => screen, complete);
    completion.input('\r');
    completion.parsed(screen);
    screen += '\n› 1. Approve\n  2. Reject';
    vi.advanceTimersByTime(250);
    expect(complete).not.toHaveBeenCalled();
    expect(isNativeCommandComposerReady('codex', screen)).toBe(false);
    expect(isNativeCommandComposerReady('claude', claude.replace('❯', '❯ /'))).toBe(false);
    expect(isNativeCommandComposerReady('codex', '› Input disabled.')).toBe(false);
  });
});
