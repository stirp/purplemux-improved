import fs from 'fs/promises';

const READ_BLOCK_BYTES = 64 * 1024;

/** Read backwards to a user message without repeatedly parsing an expanding tail. */
export const readJsonlTurn = async (
  filePath: string,
  isUserMessage: (line: string) => boolean,
  beforeByte?: number,
): Promise<{ content: string; startByteOffset: number; fileSize: number; readOffset: number }> => {
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return { content: '', startByteOffset: 0, fileSize: 0, readOffset: 0 };
  }
  try {
    const { size: fileSize } = await handle.stat();
    const end = Math.max(0, Math.min(beforeByte ?? fileSize, fileSize));
    let position = end;
    let lineEnd = end;
    let fragments: Buffer[] = [];
    const lines: string[] = [];
    let readOffset = end;
    let startByteOffset = end;

    const consumeLine = (start: number): boolean => {
      const line = Buffer.concat(fragments.reverse()).toString('utf-8');
      fragments = [];
      startByteOffset = start;
      if (!line.trim()) return false;
      // A writer may be in the middle of appending the final JSON record.
      if (lineEnd === fileSize) {
        try { JSON.parse(line); } catch {
          readOffset = start;
          return false;
        }
      }
      lines.push(line);
      return isUserMessage(line);
    };

    while (position > 0) {
      const from = Math.max(0, position - READ_BLOCK_BYTES);
      const buffer = Buffer.alloc(position - from);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, from);
      if (bytesRead !== buffer.length) throw new Error('Session file changed while reading history');
      let segmentEnd = buffer.length;
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i] !== 10) continue;
        fragments.push(buffer.subarray(i + 1, segmentEnd));
        if (consumeLine(from + i + 1)) {
          return { content: lines.reverse().join('\n'), startByteOffset, fileSize, readOffset };
        }
        segmentEnd = i;
        lineEnd = from + i;
      }
      fragments.push(buffer.subarray(0, segmentEnd));
      position = from;
    }
    consumeLine(0);
    return { content: lines.reverse().join('\n'), startByteOffset: 0, fileSize, readOffset };
  } finally {
    await handle.close();
  }
};
