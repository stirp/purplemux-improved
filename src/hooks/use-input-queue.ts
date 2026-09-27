import useSWR from 'swr';
import type { IQueuedInput } from '@/lib/input-queue';

interface IQueueData {
  messages: IQueuedInput[];
  sending: boolean;
  error: string | null;
}

const EMPTY: IQueueData = { messages: [], sending: false, error: null };
const parseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // non-json response
  }
  return `${response.status} ${response.statusText || 'request failed'}`;
};
const request = async (url: string, init?: RequestInit): Promise<IQueueData> => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  return response.json();
};

const useInputQueue = (workspaceId?: string, tabId?: string) => {
  const url = workspaceId && tabId
    ? `/api/input-queue?${new URLSearchParams({ workspaceId, tabId })}` : null;
  const { data, mutate } = useSWR(url, request, { refreshInterval: 1000 });
  const update = async (method: string, body: unknown) => {
    if (!url) throw new Error('Missing queue target');
    const next = await request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await mutate(next, false);
  };
  return {
    ...(data ?? EMPTY),
    enqueue: (message: IQueuedInput) => update('POST', message),
    submitNow: () => update('POST', { action: 'submit-now' }),
    remove: (id: string) => update('DELETE', { id }),
  };
};

export default useInputQueue;
