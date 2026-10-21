import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionPanePid, hasSession } from '@/lib/tmux';
import { getChildPids } from '@/lib/process-utils';
import { listProviders } from '@/lib/providers';
import { collectAllTabs, parseSessionName, readLayoutFile, resolveLayoutFile } from '@/lib/layout-store';
import { getTabAgentProvider } from '@/lib/tab-agent-provider';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  if (!session) {
    return res.status(400).json({ error: 'session parameter required' });
  }

  const checkedAt = Date.now();

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(200).json({ running: false, checkedAt, sessionId: null });
  }

  const panePid = await getSessionPanePid(session);
  if (!panePid) {
    return res.status(200).json({ running: false, checkedAt, sessionId: null });
  }

  const childPids = await getChildPids(panePid);
  const parsed = parseSessionName(session);
  const layout = parsed ? await readLayoutFile(resolveLayoutFile(parsed.wsId)) : null;
  const tab = layout ? collectAllTabs(layout.root).find((item) => item.sessionName === session) : undefined;
  const boundProvider = getTabAgentProvider(tab);
  const providers = boundProvider ? [boundProvider] : listProviders();
  for (const provider of providers) {
    if (!await provider.isAgentRunning(panePid, childPids)) continue;

    const info = await provider.detectActiveSession(panePid, childPids);
    const boundSessionId = tab && provider.id === boundProvider?.id ? provider.readSessionId(tab) : null;
    return res.status(200).json({
      running: true,
      checkedAt,
      sessionId: boundSessionId ?? info.sessionId,
      resumable: !!(boundSessionId && tab ? provider.readJsonlPath(tab) : info.jsonlPath),
      providerId: provider.id,
      providerDisplayName: provider.displayName,
      providerPanelType: provider.panelType,
    });
  }

  return res.status(200).json({ running: false, checkedAt, sessionId: null });
};

export default handler;
