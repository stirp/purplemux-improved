import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeCommandCompletion } from '@/lib/native-command-completion';

interface INativeCommandsOptions {
  scopeKey: string;
  provider: 'claude' | 'codex';
  getBufferText: () => string;
  sendStdin: (text: string) => void;
  focusTerminal: () => void;
  focusInput: () => void;
  revealTerminal?: () => void;
}

const useNativeCommands = ({ scopeKey, provider, getBufferText, sendStdin, focusTerminal, focusInput, revealTerminal }: INativeCommandsOptions) => {
  const [openScopes, setOpenScopes] = useState<Set<string>>(() => new Set());
  const completions = useRef(new Map<string, NativeCommandCompletion>());
  const current = useRef({ scopeKey, focusInput });
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { current.current = { scopeKey, focusInput }; }, [scopeKey, focusInput]);
  useEffect(() => {
    const sessions = completions.current;
    return () => { for (const completion of sessions.values()) completion.cancelPending(); };
  }, []);
  useEffect(() => () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    completions.current.get(scopeKey)?.cancelPending();
  }, [scopeKey]);

  const finish = useCallback((key: string) => {
    completions.current.get(key)?.cancelPending();
    completions.current.delete(key);
    setOpenScopes((scopes) => {
      const next = new Set(scopes);
      next.delete(key);
      return next;
    });
    if (current.current.scopeKey !== key) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      if (current.current.scopeKey === key) current.current.focusInput();
    }, 0);
  }, []);

  const open = useCallback((text: string) => {
    if (!/^\/[^\r\n]*$/.test(text)) return;
    completions.current.get(scopeKey)?.cancelPending();
    completions.current.set(scopeKey, new NativeCommandCompletion(provider, getBufferText, () => finish(scopeKey)));
    setOpenScopes((current) => new Set(current).add(scopeKey));
    revealTerminal?.();
    // Forward typing only. Enter and command execution remain under CLI control.
    sendStdin(text);
    focusTerminal();
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(focusTerminal, 180);
  }, [scopeKey, provider, getBufferText, finish, sendStdin, focusTerminal, revealTerminal]);

  const close = useCallback(() => {
    if (!openScopes.has(scopeKey)) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Clear the composer without Escape/Ctrl-C, which can interrupt a running turn.
    sendStdin('\x05\x15');
    finish(scopeKey);
  }, [openScopes, scopeKey, sendStdin, finish]);

  const onInput = useCallback((data: string) => completions.current.get(scopeKey)?.input(data), [scopeKey]);
  const onParsed = useCallback(() => {
    const completion = completions.current.get(scopeKey);
    if (completion) completion.parsed(getBufferText());
  }, [scopeKey, getBufferText]);

  return { active: openScopes.has(scopeKey), open, close, onInput, onParsed };
};

export default useNativeCommands;
