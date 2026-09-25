import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { findTab } from '@/lib/cli-utils';
import { getInputQueue } from '@/lib/input-queue-server';
import { getStatusManager } from '@/lib/status-manager';

const messageSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().max(100_000),
  attachments: z.array(z.object({ path: z.string().min(1).max(4096), filename: z.string().max(1024) })).max(20),
}).refine((message) => message.text.trim() || message.attachments.length);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { workspaceId, tabId } = req.query;
  if (typeof workspaceId !== 'string' || typeof tabId !== 'string') {
    return res.status(400).json({ error: 'workspaceId and tabId are required' });
  }
  const found = await findTab(workspaceId, tabId);
  if (!found) return res.status(404).json({ error: 'Tab not found' });
  const status = getStatusManager().getAllForClient()[tabId];
  const provider = status?.agentProviderId ?? (found.tab.panelType === 'codex-cli' ? 'codex' : 'claude');
  if (provider !== 'claude' && provider !== 'codex') return res.status(400).json({ error: 'Unsupported agent' });
  const queue = getInputQueue();
  if (req.method === 'POST') {
    if (req.body?.action === 'send-immediate') {
      const parsed = messageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid message' });
      if (!status?.agentSessionId || req.body.agentSessionId !== status.agentSessionId) {
        return res.status(409).json({ error: 'Session changed' });
      }
      try {
        await queue.sendImmediately({ tabId, workspaceId, sessionName: found.tab.sessionName, provider, agentSessionId: status.agentSessionId }, parsed.data);
      } catch {
        return res.status(409).json({ error: 'Could not send answer immediately' });
      }
    } else if (req.body?.action === 'submit-now') {
      await queue.flush(tabId, true);
    } else {
      const parsed = messageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid message' });
      if (!status || status.cliState === 'inactive' || status.cliState === 'unknown') {
        return res.status(409).json({ error: 'Agent is not ready' });
      }
      try {
        queue.enqueue({ tabId, workspaceId, sessionName: found.tab.sessionName, provider, agentSessionId: status.agentSessionId }, parsed.data);
      } catch {
        return res.status(409).json({ error: 'Queue is full' });
      }
    }
  } else if (req.method === 'DELETE') {
    if (typeof req.body?.id !== 'string') return res.status(400).json({ error: 'id is required' });
    queue.remove(tabId, req.body.id);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(queue.snapshot(tabId));
};

export default handler;
