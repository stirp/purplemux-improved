import { getProvider } from '@/lib/providers/registry';
import { getTabAgentProviderId } from '@/lib/tab-agent-identity';

export const getTabAgentProvider = (tab?: Parameters<typeof getTabAgentProviderId>[0]) => {
  const providerId = getTabAgentProviderId(tab);
  return providerId ? getProvider(providerId) : null;
};
