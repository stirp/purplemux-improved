import type { NextApiRequest, NextApiResponse } from 'next';
import { findTab } from '@/lib/cli-utils';
import { capturePaneContent, getSessionPanePid } from '@/lib/tmux';
import { detectActiveSession } from '@/lib/providers/claude/session-detection';
import { readClaudeStatusLine } from '@/lib/claude-status-line';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  if (!found || found.tab.panelType !== 'claude-code') return res.status(404).json({ error: 'Claude tab not found' });
  const isCurrentSession = async () => {
    const pid = await getSessionPanePid(found.tab.sessionName);
    if (!pid) return false;
    const info = await detectActiveSession(pid);
    return info.status === 'running' && info.sessionId === sessionId;
  };
  if (!await isCurrentSession()) return res.status(200).json({ active: false, text: null });
  const content = await capturePaneContent(found.tab.sessionName);
  if (!await isCurrentSession()) return res.status(200).json({ active: false, text: null });
  return res.status(200).json({ active: content !== null, text: content ? readClaudeStatusLine(content) : null });
}
