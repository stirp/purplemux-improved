import type { IncomingHttpHeaders } from 'node:http';

export const PROCESS_ACTION_HEADER = 'x-purplemux-process-action';

export const isProcessActionRequestAllowed = (headers: IncomingHttpHeaders): boolean => {
  const site = headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return false;

  // Host can be rewritten by proxies. Browsers cannot send this header cross-origin
  // without a CORS preflight, which the process endpoints do not allow.
  if (site === 'same-origin' || headers[PROCESS_ACTION_HEADER] === '1') return true;

  if (headers.origin === undefined) return true;
  try {
    const origin = new URL(headers.origin);
    return (origin.protocol === 'http:' || origin.protocol === 'https:')
      && origin.host === headers.host;
  } catch {
    return false;
  }
};
