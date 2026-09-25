import { useState } from 'react';
import useSWR from 'swr';
import useTabStore from '@/hooks/use-tab-store';

interface ICodexStatusLineProps {
  tabId: string;
  enabled: boolean;
}

interface IStatusLineResponse {
  active: boolean;
  text: string | null;
}

const fetchStatusLine = async (url: string): Promise<IStatusLineResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Status line unavailable');
  return response.json();
};

const CodexStatusLine = ({ tabId, enabled }: ICodexStatusLineProps) => {
  const [text, setText] = useState<string | null>(null);
  const workspaceId = useTabStore((state) => state.tabs[tabId]?.workspaceId);
  const sessionId = useTabStore((state) => state.tabs[tabId]?.agentSessionId);
  const url = enabled && workspaceId && sessionId
    ? `/api/codex/status-line?${new URLSearchParams({ workspaceId, tabId, sessionId })}` : null;
  const { data } = useSWR(url, fetchStatusLine, {
    refreshInterval: 1000,
    onSuccess: (next) => {
      // TUI redraws and dialogs can temporarily obscure the footer.
      if (!next.active || next.text !== null) setText(next.text);
    },
  });
  const visibleText = data?.text ?? text;
  if (!enabled || !sessionId || data?.active === false || !visibleText) return null;
  return (
    <div data-codex-status-line className="mx-auto w-full max-w-content shrink-0 border-t px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
      <p className="whitespace-pre-wrap break-words">{visibleText}</p>
    </div>
  );
};

export default CodexStatusLine;
