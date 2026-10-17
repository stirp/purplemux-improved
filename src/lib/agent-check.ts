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
  try {
    const res = await fetch(`/api/check-agent?session=${encodeURIComponent(sessionName)}`);
    if (!res.ok) return;
    applyAgentCheckResult(tabId, await res.json() as IAgentCheckResponse);
  } catch {
    // Keep the last known state when the live process check is unavailable.
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

  useTabStore.getState().setDetectedAgent(tabId, { running: false, checkedAt });
  return { running: false, checkedAt };
};
