import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { findTab } from '@/lib/cli-utils';
import { removeTabFromPane } from '@/lib/layout-store';
import '@/lib/providers';
import { getTabAgentProvider } from '@/lib/tab-agent-provider';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const tabId = req.query.tabId as string;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  if (req.method === 'GET') {
    const found = await findTab(workspaceId, tabId);
    if (!found) return res.status(404).json({ error: 'Tab not found' });
    const provider = getTabAgentProvider(found.tab);
    return res.status(200).json({
      tabId: found.tab.id,
      workspaceId: found.workspaceId,
      paneId: found.paneId,
      name: found.tab.name,
      sessionName: found.tab.sessionName,
      panelType: found.tab.panelType,
      agentProviderId: provider?.id ?? null,
      agentSessionId: provider?.readSessionId(found.tab) ?? null,
    });
  }

  if (req.method === 'DELETE') {
    const found = await findTab(workspaceId, tabId);
    if (!found) return res.status(404).json({ error: 'Tab not found' });
    const ok = await removeTabFromPane(workspaceId, found.paneId, tabId);
    return res.status(200).json({ ok });
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
