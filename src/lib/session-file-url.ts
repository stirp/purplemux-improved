import type { IEditorFileLocation } from '@/lib/editor-url';

export const buildSessionFileUrl = (file: IEditorFileLocation): string =>
  `/api/session-files${file.path.split('/').map(encodeURIComponent).join('/')}?view=1${file.line ? `#L${file.line}` : ''}`;

export const getSessionFileReturnUrl = (value: unknown): string =>
  typeof value === 'string' && /^\/(?:[?#]|$)/.test(value) && !/[\x00-\x20\x7f\\]/.test(value) ? value : '/';

export const buildSessionFilePreviewUrl = (file: IEditorFileLocation, returnTo: string): string => {
  const query = new URLSearchParams({ file: file.path, returnTo: getSessionFileReturnUrl(returnTo) });
  if (file.line) query.set('line', String(file.line));
  return `/file-preview?${query}`;
};
