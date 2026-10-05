import type { TRegionTypography } from '@/lib/region-typography';
import fs from 'fs/promises';
import { watchFile, unwatchFile, type StatWatcher, type Stats } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { broadcastSync } from '@/lib/sync-server';
import { toPublicConfig } from '@/lib/public-config';
import { createLogger } from '@/lib/logger';
import type { TNetworkAccess } from '@/lib/network-access';
import type { TEditorPreset } from '@/lib/editor-url';
import type { TToastPosition } from '@/lib/toast-position';
import { AGENT_ENVIRONMENT_KEYS, isValidAgentEnvironment, MAX_AGENT_CONFIG_BYTES, type TAgentEnvironment } from '@/lib/agent-environment';

export type TAgentProvider = 'claude' | 'codex';
export type TGitAskProvider = TAgentProvider;
export type TNoteSummaryProvider = TAgentProvider;

const log = createLogger('config');

export interface IConfigData {
  authPassword?: string;
  authSecret?: string;
  appTheme?: string;
  terminalTheme?: { light: string; dark: string };
  customCSS?: string;
  regionTypography?: TRegionTypography;
  dangerouslySkipPermissions?: boolean;
  claudeShowTerminal?: boolean;
  codexEnvironment?: TAgentEnvironment;
  claudeEnvironment?: TAgentEnvironment;
  gitAskProvider?: TGitAskProvider;
  noteSummaryProvider?: TNoteSummaryProvider;
  branchNameProvider?: TAgentProvider;
  branchNamePrompt?: string;
  commitMessagePrompt?: string;
  reviewDescriptionPrompt?: string;
  editorUrl?: string;
  editorPreset?: TEditorPreset;
  notificationsEnabled?: boolean;
  toastOnCompleteEnabled?: boolean;
  toastDuration?: number;
  toastPositionDesktop?: TToastPosition;
  toastPositionMobile?: TToastPosition;
  locale?: string;
  fontSize?: string;
  lineHeight?: string;
  lineHeightCustom?: number;
  terminalKeyBar?: 'auto' | 'always' | 'never';
  systemResourcesEnabled?: boolean;
  networkAccess?: TNetworkAccess;
  updatedAt: string;
}

const BASE_DIR = path.join(os.homedir(), '.purplemux');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');

const g = globalThis as unknown as {
  __ptConfigLock?: Promise<void>;
  __ptConfigContentCache?: string;
  __ptAgentConfigCache?: Promise<IConfigData>;
  __ptAgentConfigWatcher?: StatWatcher;
};
if (!g.__ptConfigLock) g.__ptConfigLock = Promise.resolve();

const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  let release: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const prev = g.__ptConfigLock!;
  g.__ptConfigLock = next;
  await prev;
  try {
    return await fn();
  } finally {
    release!();
  }
};

const emptyConfig = (): IConfigData => ({
  updatedAt: new Date().toISOString(),
});

const configSizeError = () => Object.assign(new Error('config.json exceeds the 4 MiB size limit'), { code: 'CONFIG_TOO_LARGE' });

export const readConfig = async (): Promise<IConfigData | null> => {
  try {
    const handle = await fs.open(CONFIG_FILE, 'r');
    try {
      const stat = await handle.stat();
      if (stat.size > MAX_AGENT_CONFIG_BYTES) throw configSizeError();
      if (!stat.isFile()) throw new Error('config.json must be a regular file');
      const buffer = Buffer.alloc(MAX_AGENT_CONFIG_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > MAX_AGENT_CONFIG_BYTES) throw configSizeError();
      return JSON.parse(buffer.toString('utf8', 0, length)) as IConfigData;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'CONFIG_TOO_LARGE') throw error;
    return null;
  }
};

export const writeConfig = async (data: IConfigData): Promise<void> => {
  const { updatedAt: _, ...rest } = data;
  const contentKey = JSON.stringify(rest);
  if (g.__ptConfigContentCache === contentKey) return;

  data.updatedAt = new Date(Math.max(Date.now(), (Date.parse(data.updatedAt) || 0) + 1)).toISOString();
  const serialized = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_AGENT_CONFIG_BYTES) throw configSizeError();
  const tmpFile = CONFIG_FILE + '.tmp';
  try {
    await fs.writeFile(tmpFile, serialized, { mode: 0o600 });
    await fs.rename(tmpFile, CONFIG_FILE);
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {});
    throw err;
  }

  g.__ptConfigContentCache = contentKey;
  g.__ptAgentConfigCache = undefined;
  broadcastSync({ type: 'config', config: toPublicConfig(data) });
};

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_LEN = 16;
const SCRYPT_PREFIX = 'scrypt:';

export const MIN_PASSWORD_LENGTH = 4;

export const isHashedPassword = (value: string | undefined | null): boolean =>
  typeof value === 'string' && value.startsWith(SCRYPT_PREFIX);

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = crypto.randomBytes(SCRYPT_SALT_LEN);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(plain, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return `${SCRYPT_PREFIX}${salt.toString('hex')}:${derived.toString('hex')}`;
};

export const verifyPassword = async (plain: string, stored: string): Promise<boolean> => {
  if (!isHashedPassword(stored)) return false;
  const [, saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(plain, salt, expected.length, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  return crypto.timingSafeEqual(derived, expected);
};

export const getConfig = async (): Promise<IConfigData> => {
  const data = await readConfig();
  return data ?? emptyConfig();
};

export const getAgentEnvironment = async (provider: TAgentProvider): Promise<TAgentEnvironment> => {
  if (!g.__ptAgentConfigWatcher) {
    try {
      // Poll file metadata to handle atomic replacements without directory event noise.
      const changed = (current: Stats, previous: Stats) => {
        if (current.mtimeMs !== previous.mtimeMs || current.ctimeMs !== previous.ctimeMs ||
            current.ino !== previous.ino || current.size !== previous.size) {
          g.__ptAgentConfigCache = undefined;
        }
      };
      const watcher = watchFile(CONFIG_FILE, { persistent: false, interval: 1000 }, changed);
      watcher.on('error', () => {
        unwatchFile(CONFIG_FILE, changed);
        g.__ptAgentConfigWatcher = undefined;
        g.__ptAgentConfigCache = undefined;
      });
      g.__ptAgentConfigWatcher = watcher;
    } catch {
      // If watching is unavailable, read on every call rather than serving stale data.
    }
  }
  const pending = g.__ptAgentConfigWatcher
    ? (g.__ptAgentConfigCache ??= getConfig())
    : getConfig();
  let config: IConfigData;
  try {
    config = await pending;
  } catch (error) {
    if (g.__ptAgentConfigCache === pending) g.__ptAgentConfigCache = undefined;
    throw error;
  }
  const configured = config[AGENT_ENVIRONMENT_KEYS[provider]];
  const env = configured === undefined ? {} : configured;
  if (!isValidAgentEnvironment(env)) throw new Error(`Invalid ${provider} environment configuration`);
  return { ...env };
};

export const updateConfig = async (updates: Partial<Omit<IConfigData, 'updatedAt'>>): Promise<IConfigData> =>
  withLock(async () => {
    const data = (await readConfig()) ?? emptyConfig();
    Object.assign(data, updates);
    await writeConfig(data);
    return data;
  });

export const needsSetup = async (): Promise<boolean> => {
  const data = await readConfig();
  return !isHashedPassword(data?.authPassword);
};

export const initConfigStore = async (): Promise<void> => {
  await fs.mkdir(BASE_DIR, { recursive: true });

  const existing = await readConfig();
  if (existing) {
    log.debug('config.json loaded');
    return;
  }

  await writeConfig(emptyConfig());
  log.info('Initial config.json created (onboarding required)');
};

export const getDangerouslySkipPermissions = async (): Promise<boolean> => {
  const data = await readConfig();
  return data?.dangerouslySkipPermissions ?? false;
};

export const generateSecret = (): string =>
  crypto.randomBytes(32).toString('hex');
