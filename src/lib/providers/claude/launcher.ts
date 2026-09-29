import { isValidAgentEnvironment, MAX_AGENT_CONFIG_BYTES } from '@/lib/agent-environment';

// Shared by browser and server command builders. Read overrides at execution
// time so credentials never appear in the terminal command or shell history.
export const CLAUDE_LAUNCHER_SCRIPT = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');
const isValidAgentEnvironment = ${isValidAgentEnvironment.toString()};
try {
  let config = {};
  let fd;
  try {
    fd = fs.openSync(path.join(os.homedir(), '.purplemux', 'config.json'), 'r');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Failed to read agent environment configuration');
  }
  if (fd !== undefined) {
    try {
      const limit = ${MAX_AGENT_CONFIG_BYTES};
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) throw new Error('Agent config.json must be a regular file');
      if (stat.size > limit) throw new Error('Agent config.json exceeds the 4 MiB size limit');
      const buffer = Buffer.alloc(limit + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
        if (read === 0) break;
        length += read;
      }
      if (length > limit) throw new Error('Agent config.json exceeds the 4 MiB size limit');
      try {
        config = JSON.parse(buffer.toString('utf8', 0, length));
      } catch {
        throw new Error('Agent config.json contains invalid JSON');
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Agent config.json must contain a JSON object');
  }
  const env = config.claudeEnvironment === undefined ? {} : config.claudeEnvironment;
  if (!isValidAgentEnvironment(env)) {
    throw new Error('Invalid Claude environment configuration');
  }
  const args = process.argv.slice(1).map((arg, index, argv) =>
    ['--settings', '--append-system-prompt-file'].includes(argv[index - 1]) && arg.startsWith('~/')
      ? path.join(os.homedir(), arg.slice(2)) : arg);
  const options = { stdio: 'inherit', env: { ...process.env, ...env } };
  const onExit = (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      setTimeout(() => process.exit(1), 100);
    } else process.exit(code ?? 1);
  };
  const onError = () => {
    console.error('Failed to launch Claude');
    process.exit(1);
  };
  const child = spawn('claude', args, options);
  child.on('exit', onExit);
  child.on('error', (error) => {
    if (error.code !== 'ENOENT') return onError();
    const shell = process.env.SHELL || '/bin/sh';
    let fish = false;
    try {
      fish = !!execFileSync(shell, ['-c', 'status fish-path'], {
        encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], env: process.env,
      }).trim();
    } catch {
    }
    const shellQuote = (value) => "'" + (fish
      ? value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")
      : value.replaceAll("'", "'\\''")) + "'";
    const assignments = Object.entries(env).map(([key, value]) =>
      fish ? 'set -gx ' + key + ' ' + shellQuote(value) : 'export ' + key + '=' + shellQuote(value));
    assignments.push(fish ? 'set -g __purplemux_environment_ready 1' : '__purplemux_environment_ready=1');
    const payload = (fish ? 'true; and ' : '') + assignments.join(fish ? '; and ' : ' && ') + ';';
    const diagnostic = "printf '%s\\n' 'Failed to apply Claude environment from fd 3' >&2; exit 1;";
    const applyEnvironment = fish
      ? 'set -e __purplemux_environment_ready; /bin/cat <&3 | source; set -l __purplemux_pipe_status $pipestatus; ' +
        'if test "$__purplemux_pipe_status[1]" -ne 0; or test "$__purplemux_pipe_status[2]" -ne 0; or test "$__purplemux_environment_ready" != 1; ' + diagnostic + ' end; '
      : 'unset __purplemux_environment_ready; __purplemux_payload=$(/bin/cat <&3) && eval "$__purplemux_payload" && ' +
        'test "$__purplemux_environment_ready" = 1 || { ' + diagnostic + ' }; unset __purplemux_payload; ';
    const acknowledge = fish ? "printf purplemux-ready >&4; or exit 1; " : "printf purplemux-ready >&4 || exit 1; ";
    const command = applyEnvironment + acknowledge + 'claude ' + args.map(shellQuote).join(' ');
    const fallback = spawn(shell, ['-ilc', command], { ...options, stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'] });
    let ready = false;
    let failed = false;
    const timer = setTimeout(() => fail('Timed out after 120000 ms waiting for the Claude shell environment'), 120000);
    const fail = (message) => {
      if (failed) return;
      failed = true;
      clearTimeout(timer);
      fallback.kill('SIGKILL');
      fallback.stdio[3].destroy();
      fallback.stdio[4].destroy();
      console.error(message);
      process.exit(1);
    };
    let acknowledgment = '';
    fallback.stdio[4].on('data', (chunk) => {
      acknowledgment += chunk.toString();
      if (acknowledgment === 'purplemux-ready') {
        ready = true;
        clearTimeout(timer);
      } else if (!'purplemux-ready'.startsWith(acknowledgment)) fail('Invalid Claude environment acknowledgment');
    });
    fallback.stdio[4].on('error', () => fail('Failed to acknowledge the Claude shell environment'));
    fallback.stdio[3].on('error', () => fail('Failed to send the Claude shell environment'));
    fallback.stdio[3].end(payload, () => fallback.stdio[3].destroy());
    fallback.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (!ready) fail('Claude shell exited before applying its environment');
      else if (!failed) onExit(code, signal);
    });
    fallback.on('error', () => fail('Failed to launch the Claude shell'));

  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
`;

// Escape backslashes outside single quotes so POSIX shells and fish agree.
const quoteShellArgument = (value: string): string =>
  "'" + value.replace(/['\\]/g, (character) => character === "'" ? "'\\''" : "'\\\\'") + "'";

export const buildClaudeLauncherCommand = (args: string[]): string =>
  ['node', '-e', CLAUDE_LAUNCHER_SCRIPT.trim().replace(/\n\s*/g, ' '), '--', ...args]
    .map(quoteShellArgument).join(' ');
