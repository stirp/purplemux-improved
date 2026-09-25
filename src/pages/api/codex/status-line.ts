import type { NextApiRequest, NextApiResponse } from 'next';
import { findTab } from '@/lib/cli-utils';
import { getStatusManager } from '@/lib/status-manager';
import { capturePaneContent } from '@/lib/tmux';
import { readCodexStatusLine } from '@/lib/codex-status-line';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { workspaceId, tabId, sessionId } = req.query;
  if (typeof workspaceId !== 'string' || typeof tabId !== 'string' || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'workspaceId, tabId and sessionId are required' });
  }
  const found = await findTab(workspaceId, tabId);
  if (!found || found.tab.panelType !== 'codex-cli') return res.status(404).json({ error: 'Codex tab not found' });
  const isCurrentSession = () => {
    const current = getStatusManager().getAllForClient()[tabId];
    return current?.workspaceId === workspaceId && current.agentSessionId === sessionId && current.cliState !== 'inactive';
  };
  if (!isCurrentSession()) return res.status(200).json({ active: false, text: null });
  const content = await capturePaneContent(found.tab.sessionName);
  if (!isCurrentSession()) return res.status(200).json({ active: false, text: null });
  return res.status(200).json({ active: content !== null, text: content ? readCodexStatusLine(content) : null });
};

export default handler;
