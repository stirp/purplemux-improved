import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getWorkspaceById } from '@/lib/workspace-store';
import { withWorktreeMutation, WorktreeError } from '@/lib/worktree-manager';
import { cleanupWorktrees, measureWorktree, previewWorktreeCleanup } from '@/lib/worktree-organization';
import { fetchWorktreeRemotes, inspectWorktreeSync, synchronizeWorktree } from '@/lib/worktree-sync';
import { createWorktreeDraft, pushWorktreeBranch } from '@/lib/worktree-draft';
import { refreshWorktreeReview, saveWorktreeReview } from '@/lib/worktree-delivery';

const snapshot = z.object({
  repositoryId: z.string().min(1).max(4096), directory: z.string().min(1).max(4096),
  head: z.string().regex(/^[a-f0-9]{40,64}$/), branch: z.string().min(1).max(1024).nullable(),
  confirmedIgnoredPaths: z.array(z.string().min(1)).optional(),
});
const common = z.object({ workspaceId: z.string().regex(/^ws-[a-zA-Z0-9_-]+$/) });
const target = z.string().trim().min(1).max(1024);
const items = z.array(snapshot).min(1).max(50).refine((items) => new Set(items.map((item) => JSON.stringify([item.repositoryId, item.directory]))).size === items.length);
const schema = z.discriminatedUnion('action', [
  common.extend({ action: z.literal('measure'), item: snapshot }),
  common.extend({ action: z.literal('previewCleanup'), items }),
  common.extend({ action: z.literal('cleanup'), items }),
  common.extend({ action: z.literal('inspectSync'), item: snapshot, targetRef: target.optional() }),
  common.extend({ action: z.literal('fetch'), item: snapshot }),
  common.extend({ action: z.enum(['merge', 'rebase']), item: snapshot, targetRef: target, targetHead: z.string().regex(/^[a-f0-9]{40,64}$/) }),
  common.extend({ action: z.enum(['continue', 'abort']), item: snapshot }),
  common.extend({ action: z.literal('saveReview'), item: snapshot, url: z.string().trim().min(1).max(2048).nullable() }),
  common.extend({ action: z.literal('refreshReview'), item: snapshot }),
  common.extend({ action: z.literal('pushBranch'), item: snapshot, remote: target }),
  common.extend({ action: z.literal('createDraft'), item: snapshot, remote: target, provider: z.enum(['github', 'gitlab']),
    targetBranch: target, title: z.string().trim().min(1).max(200), body: z.string().max(20000) }),
]);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const input = schema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid worktree action' });
  try {
    const data = input.data;
    const execute = async () => {
      const source = await getWorkspaceById(data.workspaceId);
      if (!source) throw new WorktreeError('notFound', 404);
      switch (data.action) {
        case 'measure': return measureWorktree(source, data.item);
        case 'previewCleanup': return previewWorktreeCleanup(source, data.items);
        case 'cleanup': return cleanupWorktrees(source, data.items);
        case 'inspectSync': return inspectWorktreeSync(source, data.item, data.targetRef);
        case 'fetch': return fetchWorktreeRemotes(source, data.item);
        case 'merge': case 'rebase': return synchronizeWorktree(source, data.item, data.action, data.targetRef, data.targetHead);
        case 'continue': case 'abort': return synchronizeWorktree(source, data.item, data.action);
        case 'saveReview': return saveWorktreeReview(source, data.item, data.url);
        case 'pushBranch': return pushWorktreeBranch(source, data.item, data.remote);
        case 'createDraft': return createWorktreeDraft(source, data.item, data);
        case 'refreshReview': return refreshWorktreeReview(source, data.item);
      }
    };
    const reading = ['measure', 'previewCleanup', 'inspectSync'].includes(data.action);
    return res.status(200).json(reading ? await execute() : await withWorktreeMutation(execute));
  } catch (error) {
    return res.status(error instanceof WorktreeError ? error.status : 500).json({ error: error instanceof Error ? error.message : String(error),
      ...(error instanceof WorktreeError ? { code: error.code } : {}) });
  }
};
export default handler;
