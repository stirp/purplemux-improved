import type { IAgentState, ITab, TPanelType } from '@/types/terminal';

interface IAgentIdentitySource {
  panelType?: string;
  agentState?: IAgentState;
  agentProviderId?: string;
  claudeSessionId?: string | null;
  claudeJsonlPath?: string | null;
}

export const providerIdForPanel = (panelType?: string): string | undefined =>
  panelType === 'codex-cli' ? 'codex' : panelType === 'claude-code' ? 'claude' : undefined;

export const getTabAgentProviderId = (tab?: IAgentIdentitySource): string | undefined =>
  tab?.agentState?.providerId ?? tab?.agentProviderId ?? providerIdForPanel(tab?.panelType)
  ?? (tab?.claudeSessionId || tab?.claudeJsonlPath ? 'claude' : undefined);

export const getTabAgentPanelType = (tab?: IAgentIdentitySource): TPanelType | undefined => {
  const provider = getTabAgentProviderId(tab);
  return provider === 'codex' ? 'codex-cli' : provider === 'claude' ? 'claude-code' : undefined;
};

export const ensureTabAgentIdentity = (tab: ITab): void => {
  if (tab.agentState) return;
  const providerId = getTabAgentProviderId(tab);
  if (!providerId) return;
  tab.agentState = {
    providerId,
    sessionId: providerId === 'claude' ? tab.claudeSessionId ?? null : null,
    jsonlPath: providerId === 'claude' ? tab.claudeJsonlPath ?? null : null,
    summary: providerId === 'claude' ? tab.claudeSummary ?? null : null,
  };
};

export const changeTabPanelType = (tab: ITab, panelType: TPanelType): ITab => {
  const next = { ...tab };
  ensureTabAgentIdentity(next);
  const providerId = providerIdForPanel(panelType);
  if (providerId && providerId !== next.agentState?.providerId) {
    next.agentState = undefined;
    next.panelType = panelType;
    // Claude's legacy fields remain available when explicitly returning to Claude.
    if (providerId === 'codex') next.claudeSessionId = null;
    ensureTabAgentIdentity(next);
    next.lastUserMessage = null;
    next.cliState = 'inactive';
  }
  next.panelType = panelType;
  return next;
};
