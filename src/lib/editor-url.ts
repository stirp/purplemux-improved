export type TEditorPreset =
  | 'code-server'
  | 'vscode'
  | 'vscode-remote'
  | 'vscode-insiders'
  | 'cursor'
  | 'windsurf'
  | 'zed'
  | 'custom'
  | 'off';

export const EDITOR_PRESETS: readonly TEditorPreset[] = [
  'code-server',
  'vscode',
  'vscode-remote',
  'vscode-insiders',
  'cursor',
  'windsurf',
  'zed',
  'custom',
  'off',
] as const;

export const isValidEditorPreset = (value: unknown): value is TEditorPreset =>
  typeof value === 'string' && (EDITOR_PRESETS as readonly string[]).includes(value);

const ensureLeadingSlash = (folder: string): string =>
  folder.startsWith('/') ? folder : `/${folder}`;

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

export const isValidSshHost = (host: string): boolean =>
  /^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(host.trim());

export const buildEditorUrl = (
  preset: TEditorPreset,
  url: string,
  folder: string,
): string | null => {
  const path = ensureLeadingSlash(folder || '/');
  const folderPath = path.endsWith('/') ? path : `${path}/`;
  const encoded = encodeURIComponent(path);

  switch (preset) {
    case 'vscode-remote':
      return isValidSshHost(url)
        ? `vscode://vscode-remote/ssh-remote+${encodeURIComponent(url.trim())}${encodePath(folderPath)}?windowId=_blank`
        : null;
    case 'code-server': {
      const base = url.trim();
      if (!base) return null;
      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}folder=${encoded}`;
    }
    case 'vscode':
      return `vscode://file${folderPath}?windowId=_blank`;
    case 'vscode-insiders':
      return `vscode-insiders://file${folderPath}?windowId=_blank`;
    case 'cursor':
      return `cursor://file${folderPath}?windowId=_blank`;
    case 'windsurf':
      return `windsurf://file${folderPath}?windowId=_blank`;
    case 'zed':
      return `zed://file${path}`;
    case 'custom': {
      const template = url.trim();
      if (!template) return null;
      return template
        .replace(/\{folderEncoded\}/g, encoded)
        .replace(/\{folder\}/g, path);
    }
    case 'off':
      return null;
    default:
      return null;
  }
};

export const isWebEditorUrl = (target: string): boolean =>
  /^https?:\/\//i.test(target);

const VALID_URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BLOCKED_SCHEME = /^(javascript|data|vbscript|blob|file|about|view-source):/i;

export const isSafeEditorTarget = (target: string): boolean =>
  VALID_URI_SCHEME.test(target) && !BLOCKED_SCHEME.test(target);

export interface IEditorFileLocation {
  path: string;
  line?: number;
  column?: number;
}

export const parseEditorFileLink = (href: string, cwd?: string): IEditorFileLocation | null => {
  if (!href || href.startsWith('#') || href.startsWith('//')) return null;
  let value = href;
  if (value.startsWith('file:///')) value = value.slice('file://'.length);
  else if (VALID_URI_SCHEME.test(value) && !/^[^/:]+\.[^/:]+:\d+(?::\d+)?$/.test(value)) return null;

  const location = value.match(/(?::(\d+)(?::(\d+))?|#L(\d+)(?:C(\d+))?(?:-L?\d+(?:C\d+)?)?)$/);
  if (location) value = value.slice(0, location.index);
  if (VALID_URI_SCHEME.test(value)) return null;
  if (/[?#]/.test(value)) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!value || /[\x00-\x1f]/.test(value)) return null;
  if (!value.startsWith('/')) {
    if (!cwd?.startsWith('/')) return null;
    value = `${cwd}/${value}`;
  }
  const segments: string[] = [];
  for (const part of value.split('/')) {
    if (part === '..') segments.pop();
    else if (part && part !== '.') segments.push(part);
  }
  const line = Number(location?.[1] ?? location?.[3]) || undefined;
  const column = Number(location?.[2] ?? location?.[4]) || undefined;
  return { path: `/${segments.join('/')}`, line, column };
};

export const buildEditorFileUrl = (
  preset: TEditorPreset,
  url: string,
  file: IEditorFileLocation,
): string | null => {
  const path = encodePath(file.path);
  const position = file.line ? `:${file.line}${file.column ? `:${file.column}` : ''}` : '';
  switch (preset) {
    case 'vscode-remote':
      // VS Code treats remote URLs without a line suffix as folders.
      return isValidSshHost(url)
        ? `vscode://vscode-remote/ssh-remote+${encodeURIComponent(url.trim())}${path}${position || ':1'}`
        : null;
    case 'vscode':
    case 'vscode-insiders':
    case 'cursor':
    case 'windsurf':
    case 'zed':
      return `${preset}://file${path}${position}`;
    default:
      return null;
  }
};

export const canOpenEditorTarget = (preset: TEditorPreset, target: string, hostname: string): boolean =>
  isSafeEditorTarget(target) && (preset === 'vscode-remote' || isWebEditorUrl(target)
    || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname));
