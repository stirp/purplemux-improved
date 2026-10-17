import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { MAX_TERMINAL_COMMANDS, terminalCommandSchema } from '@/lib/terminal-custom-commands';
import { getTerminalCommands, updateTerminalCommand } from '@/lib/workspace-store';

const orderSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).max(MAX_TERMINAL_COMMANDS)
    .refine((ids) => new Set(ids).size === ids.length),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === 'GET') return res.status(200).json(await getTerminalCommands());
    if (!['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method ?? '')) {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE, PUT');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (req.method === 'PUT') {
      const parsed = orderSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid command order' });
      return res.status(200).json(await updateTerminalCommand({ action: 'reorder', ids: parsed.data.ids }));
    }
    const id = req.body?.id;
    if (req.method !== 'POST' && (typeof id !== 'string' || !id || id.length > 100)) {
      return res.status(400).json({ error: 'Invalid command ID' });
    }
    if (req.method === 'DELETE') {
      return res.status(200).json(await updateTerminalCommand({ action: 'delete', id }));
    }
    const parsed = terminalCommandSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid terminal command' });
    const commands = await updateTerminalCommand(req.method === 'POST'
      ? { action: 'create', value: parsed.data }
      : { action: 'edit', id, value: parsed.data });
    return res.status(200).json(commands);
  } catch (error) {
    const status = (error as { status?: number }).status;
    return res.status(status === 404 || status === 409 ? status : 500).json({ error: 'Unable to update terminal commands' });
  }
};

export default handler;
