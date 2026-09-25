import { useCallback, useEffect, useRef, useState } from 'react';

interface INativeCommandsOptions {
  scopeKey: string;
  sendStdin: (text: string) => void;
  focusTerminal: () => void;
  focusInput: () => void;
  revealTerminal?: () => void;
}

const useNativeCommands = ({ scopeKey, sendStdin, focusTerminal, focusInput, revealTerminal }: INativeCommandsOptions) => {
  const [openScopes, setOpenScopes] = useState<Set<string>>(() => new Set());
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
  }, [scopeKey]);

  const open = useCallback((text: string) => {
    if (!/^\/[^\r\n]*$/.test(text)) return;
    setOpenScopes((current) => new Set(current).add(scopeKey));
    revealTerminal?.();
    // Forward typing only. Enter and command execution remain under CLI control.
    sendStdin(text);
    focusTerminal();
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(focusTerminal, 180);
  }, [scopeKey, sendStdin, focusTerminal, revealTerminal]);

  const close = useCallback(() => {
    if (!openScopes.has(scopeKey)) return;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    // Clear the composer without Escape/Ctrl-C, which can interrupt a running turn.
    sendStdin('\x05\x15');
    setOpenScopes((current) => {
      const next = new Set(current);
      next.delete(scopeKey);
      return next;
    });
    focusTimer.current = setTimeout(focusInput, 0);
  }, [openScopes, scopeKey, sendStdin, focusInput]);

  return { active: openScopes.has(scopeKey), open, close };
};

export default useNativeCommands;
