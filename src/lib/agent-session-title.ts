import type { ITabState } from '@/hooks/use-tab-store';
import type { ISessionWorkflow } from '@/lib/session-workflow';

export const agentSessionTitle = (tab?: ITabState, workflow?: ISessionWorkflow, tabId?: string): string | null => {
  if (!tab) return null;
  const provider = tab.panelType === 'codex-cli' || (!tab.panelType && tab.agentProviderId === 'codex') ? 'codex' : 'claude';
  const key = `${provider}:${tab.agentSessionId || `tab:${tabId ?? ''}`}`;
  const override = workflow?.titles?.[key];
  if (override?.trim()) return override.trim();
  const cached = tab.sessionMetaCache;
  if (cached?.sessionId && cached.sessionId === tab.agentSessionId && cached.meta.title.trim()) {
    return cached.meta.title.trim();
  }
  return tab.agentSummary?.trim() || tab.lastUserMessage?.trim() || null;
};

export const agentTabTitle = (
  name: string,
  tab: ITabState | undefined,
  workflow: ISessionWorkflow,
  tabId: string,
): string | null => name || agentSessionTitle(tab, workflow, tabId);
