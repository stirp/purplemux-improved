export const requestWorktreeAction = async <T>(workspaceId: string, action: string, payload: object = {}, signal?: AbortSignal): Promise<T> => {
  const response = await fetch('/api/workspace/worktree-actions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, action, ...payload }), signal,
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { code: data.code });
  return data;
};
