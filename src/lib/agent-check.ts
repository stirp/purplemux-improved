import type { TPanelType } from '@/types/terminal';
import useTabStore from '@/hooks/use-tab-store';

export type TAgentPanelType = Extract<TPanelType, 'claude-code' | 'codex-cli'>;

export interface IAgentCheckResponse {
  running?: boolean;
  checkedAt?: number;
  sessionId?: unknown;
  resumable?: unknown;
  providerId?: unknown;
  providerDisplayName?: unknown;
  providerPanelType?: unknown;
}

export interface IAgentCheckOutcome {
  running: boolean;
  checkedAt: number;
}

export const isAgentPanelType = (value: unknown): value is TAgentPanelType =>
  value === 'claude-code' || value === 'codex-cli';

export const refreshDetectedAgent = async (tabId: string, sessionName: string | null): Promise<void> => {
  if (!sessionName) return;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timeout = setTimeout(() => {
      resolve(null);
      controller.abort();
    }, 3_000);
  });
  try {
    const data = await Promise.race([
      fetch(`/api/check-agent?session=${encodeURIComponent(sessionName)}`, { signal: controller.signal })
        .then(async (res): Promise<IAgentCheckResponse | null> => res.ok ? await res.json() : null),
      deadline,
    ]);
    if (data) applyAgentCheckResult(tabId, data);
  } catch {
    // Keep the last known state when the live process check is unavailable.
  } finally {
    clearTimeout(timeout);
  }
};

export const applyAgentCheckResult = (
  tabId: string,
  data: IAgentCheckResponse,
): IAgentCheckOutcome => {
  const checkedAt = typeof data.checkedAt === 'number' ? data.checkedAt : Date.now();
  if (data.running === true && isAgentPanelType(data.providerPanelType)) {
    const providerId = typeof data.providerId === 'string' && data.providerId
      ? data.providerId
      : data.providerPanelType === 'codex-cli' ? 'codex' : 'claude';
    const detectedSessionId = typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : undefined;
    useTabStore.getState().setDetectedAgent(tabId, {
      running: true,
      checkedAt,
      providerId,
      panelType: data.providerPanelType,
      ...(detectedSessionId !== undefined ? { sessionId: detectedSessionId } : {}),
    });
    return { running: true, checkedAt };
  }

  if (data.running === false) {
    useTabStore.getState().setDetectedAgent(tabId, { running: false, checkedAt });
    return { running: false, checkedAt };
  }
  const previous = useTabStore.getState().tabs[tabId];
  return { running: previous?.agentProcess === true, checkedAt: previous?.agentProcessCheckedAt ?? 0 };
};
