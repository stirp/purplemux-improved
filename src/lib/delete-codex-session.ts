import { spawn } from 'child_process';
import readline from 'readline';
import { getShellPath } from '@/lib/preflight';

export const deleteCodexSession = async (sessionId: string): Promise<void> => {
  const shellPath = await getShellPath();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('codex', ['app-server', '--stdio'], {
      env: { ...process.env, PATH: shellPath },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const lines = readline.createInterface({ input: child.stdout });
    let settled = false;
    let initialized = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      lines.close();
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Codex session deletion timed out')), 30_000);
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', finish);
    child.stdin.on('error', finish);
    child.on('exit', () => finish(new Error('Codex exited before confirming deletion')));
    lines.on('line', (line) => {
      let response: { id?: number; error?: { message?: string } };
      try { response = JSON.parse(line); } catch { return; }
      if (response.id !== 1 && response.id !== 2) return;
      if (response.error) {
        finish(new Error(response.error.message ?? 'Codex session deletion failed'));
      } else if (response.id === 1 && !initialized) {
        initialized = true;
        send({ method: 'initialized', params: {} });
        send({ id: 2, method: 'thread/delete', params: { threadId: sessionId } });
      } else if (response.id === 2 && initialized) {
        finish();
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'purplemux-improved', version: '1.0.0' }, capabilities: { experimentalApi: true } } });
  });
};
