import { useEffect, useState } from 'react';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import type { IAgentCheckResponse } from '@/lib/agent-check';

const CHECK_INTERVAL_MS = 800;
const REQUEST_TIMEOUT_MS = 10_000;
const STARTUP_GRACE_MS = 60_000;

const useCodexBootCheck = (tabId: string | undefined, sessionName: string | undefined) => {
  const view = useTabStore((s) => tabId ? selectSessionView(s.tabs, tabId) : 'session-list');
  const cliState = useTabStore((s) => tabId ? s.tabs[tabId]?.cliState : undefined);
  const agentProcess = useTabStore((s) => tabId ? s.tabs[tabId]?.agentProcess : null);
  const [failure, setFailure] = useState<{ tabId: string; sessionName: string } | null>(null);
  const ready = agentProcess === true || (cliState != null
    && cliState !== 'inactive' && cliState !== 'unknown' && cliState !== 'cancelled');

  useEffect(() => {
    if (!tabId || !sessionName || view !== 'check') return;
    if (ready) {
      useTabStore.getState().setSessionView(tabId, 'timeline');
      return;
    }

    const startedAt = Date.now();
    let stopped = false;
    let nextCheck: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const check = async () => {
      const requestedAt = Date.now();
      controller = new AbortController();
      const requestController = controller;
      const deadline = new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          resolve(null);
          requestController.abort();
        }, REQUEST_TIMEOUT_MS);
      });
      try {
        const data = await Promise.race([
          fetch(`/api/check-agent?session=${encodeURIComponent(sessionName)}`, { signal: requestController.signal })
            .then(async (res): Promise<IAgentCheckResponse | null> => res.ok ? await res.json() : null),
          deadline,
        ]);
        if (stopped) return;
        const tab = useTabStore.getState().tabs[tabId];
        const checkedAt = typeof data?.checkedAt === 'number' && Number.isFinite(data.checkedAt)
          ? data.checkedAt : requestedAt;
        if (!tab || tab.sessionView !== 'check' || tab.agentProcessCheckedAt > checkedAt) return;
        if (data?.running === true && data.providerPanelType === 'codex-cli') {
          useTabStore.getState().setAgentProcess(tabId, true, checkedAt);
          setFailure(null);
        } else {
          // Only a fresh negative check after the launcher's budget proves failure.
          setFailure(data?.running === false && requestedAt - startedAt >= STARTUP_GRACE_MS
            ? { tabId, sessionName } : null);
        }
      } catch {
        if (!stopped) setFailure(null);
      } finally {
        clearTimeout(timeout);
        if (!stopped) nextCheck = setTimeout(() => { void check(); }, CHECK_INTERVAL_MS);
      }
    };
    void check();
    return () => {
      stopped = true;
      clearTimeout(nextCheck);
      clearTimeout(timeout);
      controller?.abort();
    };
  }, [tabId, sessionName, view, ready]);

  return view === 'check' && !ready && failure?.tabId === tabId && failure?.sessionName === sessionName;
};

export default useCodexBootCheck;
