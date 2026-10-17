import type { IEditorFileLocation } from '@/lib/editor-url';

export const buildSessionFileUrl = (file: IEditorFileLocation): string =>
  `/api/session-files${file.path.split('/').map(encodeURIComponent).join('/')}?view=1${file.line ? `#L${file.line}` : ''}`;
