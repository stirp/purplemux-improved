export interface IGitDiffFile {
  oldName: string;
  newName: string;
  oldHeaderLine: string;
  newHeaderLine: string;
  hunks: string[];
  additions: number;
  deletions: number;
  isBinary: boolean;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
}

const DIFF_HEADER = /^diff --git /;

const decodePath = (path: string): string => {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  const escapes: Record<string, string> = {
    a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '"': '"', '\\': '\\',
  };
  // Git quotes non-ASCII paths as octal UTF-8 bytes, not Unicode code points.
  return path.slice(1, -1).replace(/\\([0-7]{3}(?:\\[0-7]{3})*|[abfnrtv"\\])/g, (_, escaped: string) => {
    if (escaped in escapes) return escapes[escaped];
    return new TextDecoder().decode(Uint8Array.from(escaped.split('\\').map((byte) => parseInt(byte, 8))));
  });
};

const stripPrefix = (p: string) => {
  if (p === '/dev/null') return '/dev/null';
  return decodePath(p).replace(/^[ab]\//, '');
};

const parseHeaderPaths = (line: string): [string, string] => {
  // Unquoted spaces may include " b/" inside a filename; match equal paths first.
  const samePath = line.match(/^diff --git a\/(.*) b\/\1$/);
  if (samePath) return [samePath[1], samePath[1]];
  const paths = line.match(/^diff --git ("(?:[^"\\]|\\.)*"|a\/.*?) ("(?:[^"\\]|\\.)*"|b\/.*)$/);
  return paths ? [stripPrefix(paths[1]), stripPrefix(paths[2])] : ['', ''];
};

export const parseMultiFileDiff = (input: string): IGitDiffFile[] => {
  if (!input.trim()) return [];

  const lines = input.split('\n');
  const files: IGitDiffFile[] = [];
  let current: IGitDiffFile | null = null;
  let hunkBuffer: string[] | null = null;
  let inHunk = false;

  const flushHunk = () => {
    if (current && hunkBuffer) current.hunks.push(hunkBuffer.join('\n'));
    hunkBuffer = null;
  };

  const flushFile = () => {
    flushHunk();
    if (current) files.push(current);
    current = null;
    inHunk = false;
  };

  for (const line of lines) {
    if (DIFF_HEADER.test(line)) {
      flushFile();
      const [oldName, newName] = parseHeaderPaths(line);
      current = {
        oldName,
        newName,
        oldHeaderLine: '',
        newHeaderLine: '',
        hunks: [],
        additions: 0,
        deletions: 0,
        isBinary: false,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
      };
      continue;
    }

    if (!current) continue;

    if (!inHunk) {
      if (line.startsWith('@@')) {
        inHunk = true;
        hunkBuffer = [line];
      } else if (line.startsWith('--- ')) {
        current.oldHeaderLine = line;
        current.oldName = stripPrefix(line.slice(4).replace(/\t.*$/, ''));
      } else if (line.startsWith('+++ ')) {
        current.newHeaderLine = line;
        current.newName = stripPrefix(line.slice(4).replace(/\t.*$/, ''));
      } else if (line.startsWith('new file')) {
        current.isNew = true;
        current.oldName = '/dev/null';
      } else if (line.startsWith('deleted file')) {
        current.isDeleted = true;
        current.newName = '/dev/null';
      } else if (line.startsWith('rename from ')) {
        current.isRenamed = true;
        current.oldName = decodePath(line.slice(12));
      } else if (line.startsWith('rename to ')) {
        current.isRenamed = true;
        current.newName = decodePath(line.slice(10));
      } else if (line.startsWith('Binary files') || line === 'GIT binary patch') {
        current.isBinary = true;
      }
      continue;
    }

    if (line.startsWith('@@')) {
      flushHunk();
      hunkBuffer = [line];
      continue;
    }

    if (!hunkBuffer) continue;
    hunkBuffer.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }

  flushFile();
  return files;
};

export const getDisplayName = (file: IGitDiffFile): string => {
  if (file.newName && file.newName !== '/dev/null') return file.newName;
  if (file.oldName && file.oldName !== '/dev/null') return file.oldName;
  return 'file';
};

export const buildFileDiffString = (file: IGitDiffFile): string => {
  if (file.hunks.length === 0) return '';
  const oldHeader = file.oldHeaderLine || `--- a/${file.oldName || file.newName}`;
  const newHeader = file.newHeaderLine || `+++ b/${file.newName || file.oldName}`;
  return [oldHeader, newHeader, ...file.hunks].join('\n');
};
