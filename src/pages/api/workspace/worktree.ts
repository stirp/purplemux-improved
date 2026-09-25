import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { createWorkspace, getWorkspaceById, getWorkspaces } from '@/lib/workspace-store';
import { createGitWorktree, inspectWorktreeSource } from '@/lib/git-worktree';

const inputSchema = z.object({
  workspaceId: z.string().regex(/^ws-[a-zA-Z0-9_-]+$/),
  directoryIndex: z.number().int().min(0).default(0),
  name: z.string().trim().min(1).max(120),
  branch: z.string().trim().min(1).max(80),
  baseRef: z.string().trim().min(1).max(200).default('HEAD'),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    if (req.method === 'GET') {
      const query = z.object({ workspaceId: z.string().regex(/^ws-[a-zA-Z0-9_-]+$/), directoryIndex: z.coerce.number().int().min(0).default(0) }).safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: 'Invalid workspace' });
      const parent = await getWorkspaceById(query.data.workspaceId);
      if (!parent) return res.status(404).json({ error: 'Workspace not found' });
      return res.status(200).json(await inspectWorktreeSource(parent, query.data.directoryIndex));
    }
    const input = inputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Invalid worktree options' });
    const { workspaceId, directoryIndex, name, branch, baseRef } = input.data;
    const parent = await getWorkspaceById(workspaceId);
    if (!parent) return res.status(404).json({ error: 'Workspace not found' });
    const created = await createGitWorktree(parent, directoryIndex, branch, baseRef);
    try {
      const workspace = await createWorkspace(created.directory, name, undefined, {
        parentWorkspaceId: workspaceId,
        worktree: { repository: created.repository, branch, baseCommit: created.baseCommit },
      });
      return res.status(201).json(workspace);
    } catch {
      // A prompt-file failure may occur after workspace registration was committed.
      const saved = await getWorkspaces().then((data) => data.workspaces.find((workspace) => workspace.directories.includes(created.directory))).catch(() => undefined);
      if (saved) return res.status(201).json(saved);
      return res.status(500).json({ error: 'Worktree created but workspace registration failed', createdDirectory: created.directory });
    }
  } catch (error) {
    const detail = error as Error & { stderr?: string };
    return res.status(400).json({ error: detail.stderr?.trim() || detail.message || 'Failed to create worktree' });
  }
};

export default handler;
