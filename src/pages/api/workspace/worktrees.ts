import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getWorkspaceById } from '@/lib/workspace-store';
import { adoptWorktree, getWorktreeOverview, removeManagedWorktree, withWorktreeMutation, WorktreeError } from '@/lib/worktree-manager';

const sourceSchema = z.object({ workspaceId: z.string().regex(/^ws-[a-zA-Z0-9_-]+$/) });
const itemSchema = sourceSchema.extend({ repositoryId: z.string().min(1), directory: z.string().min(1) });
const removeSchema = itemSchema.extend({ head: z.string().regex(/^[a-f0-9]{40,64}$/), branch: z.string().min(1).nullable(), deleteBranch: z.boolean().default(false), targetRef: z.string().trim().min(1).max(200).optional(), confirmedIgnoredPaths: z.array(z.string().min(1)).optional() });

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const schema = req.method === 'GET' ? sourceSchema : req.method === 'DELETE' ? removeSchema : itemSchema;
    const input = schema.safeParse(req.method === 'GET' ? req.query : req.body);
    if (!input.success) return res.status(400).json({ error: 'Invalid worktree options' });
    const execute = async () => {
      const source = await getWorkspaceById(input.data.workspaceId);
      if (!source) throw new WorktreeError('notFound', 404);
      if (req.method === 'GET') return getWorktreeOverview(source);
      if (req.method === 'POST') {
        const options = itemSchema.parse(input.data);
        return adoptWorktree(source, options.repositoryId, options.directory);
      }
      return removeManagedWorktree(source, removeSchema.parse(input.data));
    };
    return res.status(200).json(req.method === 'GET' ? await execute() : await withWorktreeMutation(execute));
  } catch (error) {
    return res.status(error instanceof WorktreeError ? error.status : 500).json({
      error: error instanceof Error ? error.message : 'Worktree operation failed',
      ...(error instanceof WorktreeError ? { code: error.code } : {}),
    });
  }
};

export default handler;
