import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { scheduledTaskSchema } from '@/lib/scheduled-tasks';
import { listScheduledTasks, saveScheduledTask, changeScheduledTask } from '@/lib/scheduled-task-service';
import { getScheduledTaskScheduler } from '@/lib/scheduled-task-scheduler';

const idSchema = z.string().min(1).max(100);
const actionSchema = z.object({ id: idSchema, action: z.enum(['enable', 'pause', 'run']) }).strict();
const editSchema = z.object({ id: idSchema, task: scheduledTaskSchema }).strict();
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  const workspace = idSchema.safeParse(req.query.workspaceId);
  if (!workspace.success) return res.status(400).json({ error: 'invalid' });
  try {
    switch (req.method) {
      case 'GET': return res.status(200).json(await listScheduledTasks(workspace.data));
      case 'POST': {
        const body = scheduledTaskSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'invalid' });
        return res.status(201).json(await saveScheduledTask(workspace.data, body.data));
      }
      case 'PUT': {
        const body = editSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'invalid' });
        return res.status(200).json(await saveScheduledTask(workspace.data, body.data.task, body.data.id));
      }
      case 'PATCH': {
        const body = actionSchema.safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'invalid' });
        if (body.data.action === 'run') return res.status(202).json(await getScheduledTaskScheduler().runNow(workspace.data, body.data.id));
        return res.status(200).json(await changeScheduledTask(workspace.data, body.data.id, body.data.action));
      }
      case 'DELETE': {
        const body = z.object({ id: idSchema }).strict().safeParse(req.body);
        if (!body.success) return res.status(400).json({ error: 'invalid' });
        return res.status(200).json(await changeScheduledTask(workspace.data, body.data.id, 'delete'));
      }
      default:
        res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
        return res.status(405).json({ error: 'method' });
    }
  } catch (error) {
    const failure = error as { status?: number; code?: string };
    return res.status(failure.status ?? 500).json({ error: failure.status ? failure.code : 'storage' });
  }
};
export default handler;
