import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { getWorkspaceById } from '@/lib/workspace-store';
import { inspectWorktreeSource } from '@/lib/git-worktree';
import { getConfig } from '@/lib/config-store';
import { callAgentText } from '@/lib/agent-text';
import { DEFAULT_BRANCH_NAME_PROMPT, renderBranchNamePrompt } from '@/lib/branch-name-prompt';

const exec = promisify(execFile);
const inputSchema = z.object({
  workspaceId: z.string().regex(/^ws-[a-zA-Z0-9_-]+$/),
  directoryIndex: z.number().int().min(0).default(0),
  title: z.string().trim().min(1).max(120),
  baseRef: z.string().trim().min(1).max(200).default('HEAD'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const input = inputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid branch generation options' });
  try {
    const { workspaceId, directoryIndex, title, baseRef } = input.data;
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    if (!workspace.directories[directoryIndex]) return res.status(400).json({ error: 'Source directory not found' });
    const config = await getConfig();
    if (config.branchNameProvider === 'codex') {
      return res.status(409).json({ code: 'codexTextOnlyUnavailable', error: 'Select Claude Code in branch name settings. Codex CLI cannot guarantee tool-free text generation.' });
    }
    const source = await inspectWorktreeSource(workspace, directoryIndex);
    const prompt = renderBranchNamePrompt(config.branchNamePrompt ?? DEFAULT_BRANCH_NAME_PROMPT, {
      title, workspaceName: workspace.name, baseRef,
    });
    const branch = (await callAgentText('claude', prompt, 'Return only a valid Git branch name. Do not use tools or modify files.', {
      textOnly: true,
    })).trim();
    if (!branch || branch.length > 80 || branch.startsWith('-') || /\s/.test(branch) || /^[`'"]|[`'"]$/.test(branch) || branch === 'HEAD') {
      return res.status(422).json({ error: 'Agent returned an invalid branch name. Please try again.' });
    }
    try {
      await exec('git', ['check-ref-format', `refs/heads/${branch}`], { timeout: 5000 });
    } catch {
      return res.status(422).json({ error: 'Agent returned an invalid branch name. Please try again.' });
    }
    if (source.branches.some((item) => item.ref === `refs/heads/${branch}`)) {
      return res.status(409).json({ error: 'Generated branch already exists. Please edit it or try again.' });
    }
    return res.status(200).json({ branch });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Branch generation failed' });
  }
}
