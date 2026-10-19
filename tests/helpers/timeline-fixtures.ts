import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

export const jsonl = (records: unknown[]) => records.map((record) => JSON.stringify(record)).join('\n') + '\n';
export const claudeUser = (content: unknown) => ({ type: 'user', message: { role: 'user', content } });
export const claudeToolCall = (name = 'Bash', input: Record<string, unknown> = { command: 'echo test' }) => ({
  type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool', name, input }] },
});
export const claudeToolResult = (content?: unknown, isError = false) => claudeUser([
  { type: 'tool_result', tool_use_id: 'tool', content, is_error: isError },
]);

export const createJsonlFixture = () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });
  return async (records: unknown[] | string) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-timeline-'));
    directories.push(directory);
    const file = path.join(directory, 'session.jsonl');
    await fs.writeFile(file, typeof records === 'string' ? records : jsonl(records));
    return file;
  };
};
