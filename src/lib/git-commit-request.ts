type TCommitAction = 'inspect' | 'generate' | 'commit';

const failure = (code: string, message = code) => Object.assign(new Error(message), { code });

export const requestCommit = async <T>(session: string, action: TCommitAction, payload: object = {}, signal?: AbortSignal): Promise<T> => {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 150_000);
  try {
    const response = await fetch('/api/git/commit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ session, action, ...payload }),
    });
    if ([408, 504].includes(response.status)) throw failure(action === 'commit' ? 'commitUnknown' : action === 'generate' ? 'generateTimeout' : 'requestTimeout');
    const data = await response.json().catch((error) => {
      if (controller.signal.aborted || !(error instanceof SyntaxError)) throw error;
      return null;
    });
    if (!response.ok) {
      if (data && typeof data.error === 'string') throw Object.assign(new Error(data.error), { code: typeof data.code === 'string' ? data.code : undefined });
      throw failure(action === 'commit' ? 'commitUnknown' : 'requestFailed');
    }
    if (!data || typeof data !== 'object') throw failure(action === 'commit' ? 'commitUnknown' : 'requestFailed');
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw failure(action === 'commit' ? 'commitUnknown' : action === 'generate' ? 'generateTimeout' : 'requestTimeout');
    if (error instanceof TypeError) throw failure(action === 'commit' ? 'commitUnknown' : 'requestFailed');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
};
