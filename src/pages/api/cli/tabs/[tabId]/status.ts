import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { hasSession, getPaneCurrentCommand } from '@/lib/tmux';
import '@/lib/providers';
import { getTabAgentProvider } from '@/lib/tab-agent-provider';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });

  const provider = getTabAgentProvider(found.tab);
  const agentSessionId = provider?.readSessionId(found.tab) ?? null;
  const alive = await hasSession(found.tab.sessionName);
  if (!alive) {
    return res.status(200).json({
      tabId,
      workspaceId,
      alive: false,
      agentProviderId: provider?.id ?? null,
      agentSessionId,
      claudeSessionId: agentSessionId,
    });
  }

  const command = await getPaneCurrentCommand(found.tab.sessionName);
  return res.status(200).json({
    tabId,
    workspaceId,
    alive: true,
    command,
    cliState: found.tab.cliState ?? null,
    agentProviderId: provider?.id ?? null,
    agentSessionId,
    // Response key kept as `claudeSessionId` for back-compat with external CLI consumers.
    claudeSessionId: agentSessionId,
  });
};

export default handler;
