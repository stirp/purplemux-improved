import { isValidRegionTypography, regionTypographyEqual, type TRegionTypography } from '@/lib/region-typography';
import { DEFAULT_BRANCH_NAME_PROMPT } from '@/lib/branch-name-prompt';
import { GIT_GENERATION_PROMPTS, type TGitGenerationPromptKey } from '@/lib/git-generation-prompts';
import { create } from 'zustand';
import type { TEditorPreset } from '@/lib/editor-url';
import type { TToastPosition } from '@/lib/toast-position';
import type { TGitAskProvider, TNoteSummaryProvider } from '@/lib/config-store';
import { DEFAULT_LINE_HEIGHT } from '@/lib/terminal-line-height';
import { AGENT_ENVIRONMENT_KEYS, type TAgentEnvironment } from '@/lib/agent-environment';

export type { TToastPosition } from '@/lib/toast-position';
export type { TGitAskProvider, TNoteSummaryProvider } from '@/lib/config-store';

export type TNetworkAccess = 'localhost' | 'tailscale' | 'all';
export type TTerminalKeyBar = 'auto' | 'always' | 'never';

export const DEFAULT_TOAST_DURATION = 10000;
export const DEFAULT_TOAST_POSITION_DESKTOP: TToastPosition = 'top-right';
export const DEFAULT_TOAST_POSITION_MOBILE: TToastPosition = 'top-center';

export interface IConfigInitialData {
  updatedAt?: string;
  codexEnvironment?: TAgentEnvironment;
  claudeEnvironment?: TAgentEnvironment;
  appTheme?: string | null;
  terminalTheme?: { light: string; dark: string } | null;
  customCSS?: string;
  regionTypography?: TRegionTypography;
  dangerouslySkipPermissions?: boolean;
  claudeShowTerminal?: boolean;
  gitAskProvider?: TGitAskProvider;
  noteSummaryProvider?: TNoteSummaryProvider;
  branchNameProvider?: TGitAskProvider;
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
  hasAuthPassword?: boolean;
  locale?: string;
  fontSize?: string;
  lineHeight?: string;
  lineHeightCustom?: number;
  terminalKeyBar?: TTerminalKeyBar;
  systemResourcesEnabled?: boolean;
  networkAccess?: TNetworkAccess;
  hostEnvLocked?: boolean;
  bindHostIsLocal?: boolean;
}

interface IConfigState {
  appTheme: string | null;
  terminalTheme: { light: string; dark: string } | null;
  claudeEnvironment: TAgentEnvironment;
  setClaudeEnvironment: (env: TAgentEnvironment) => Promise<void>;
  setAgentEnvironment: (provider: TGitAskProvider, env: TAgentEnvironment) => Promise<void>;
  codexEnvironment: TAgentEnvironment;
  setCodexEnvironment: (env: TAgentEnvironment) => Promise<void>;
  dangerouslySkipPermissions: boolean;
  claudeShowTerminal: boolean;
  gitAskProvider: TGitAskProvider;
  noteSummaryProvider: TNoteSummaryProvider;
  branchNameProvider: TGitAskProvider;
  branchNamePrompt: string;
  commitMessagePrompt: string;
  reviewDescriptionPrompt: string;
  setGitGenerationPrompt: (key: TGitGenerationPromptKey, prompt: string) => Promise<void>;
  setBranchNameSettings: (provider: TGitAskProvider, prompt: string) => Promise<void>;
  editorUrl: string;
  editorPreset: TEditorPreset;
  notificationsEnabled: boolean;
  toastOnCompleteEnabled: boolean;
  toastDuration: number;
  toastPositionDesktop: TToastPosition;
  toastPositionMobile: TToastPosition;
  hasAuthPassword: boolean;
  locale: string;
  customCSS: string;
  regionTypography: TRegionTypography;
  setRegionTypography: (settings: TRegionTypography) => Promise<void>;
  syncConfig: () => Promise<void>;
  fontSize: string;
  lineHeight: string;
  lineHeightCustom: number;
  terminalKeyBar: TTerminalKeyBar;
  systemResourcesEnabled: boolean;
  networkAccess: TNetworkAccess;
  hostEnvLocked: boolean;
  bindHostIsLocal: boolean;

  hydrate: (data: IConfigInitialData) => void;
  setDangerouslySkipPermissions: (enabled: boolean) => void;
  setClaudeShowTerminal: (enabled: boolean) => void;
  setGitAskProvider: (provider: TGitAskProvider) => void;
  setNoteSummaryProvider: (provider: TNoteSummaryProvider) => void;
  setEditorUrl: (url: string) => void;
  setEditorPreset: (preset: TEditorPreset) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setToastOnCompleteEnabled: (enabled: boolean) => void;
  setToastDuration: (duration: number) => void;
  setToastPositionDesktop: (position: TToastPosition) => void;
  setToastPositionMobile: (position: TToastPosition) => void;
  changePassword: (password: string) => void;
  setLocale: (locale: string) => void;
  setCustomCSS: (css: string) => void;
  setFontSize: (fontSize: string) => void;
  setLineHeight: (lineHeight: string) => void;
  setLineHeightCustom: (value: number) => void;
  setTerminalKeyBar: (value: TTerminalKeyBar) => void;
  setSystemResourcesEnabled: (enabled: boolean) => void;
  setNetworkAccess: (value: TNetworkAccess) => void;
}

const initialConfig = {
  notificationsEnabled: true,
  toastOnCompleteEnabled: true,
  toastDuration: DEFAULT_TOAST_DURATION,
  toastPositionDesktop: DEFAULT_TOAST_POSITION_DESKTOP,
  toastPositionMobile: DEFAULT_TOAST_POSITION_MOBILE,
  editorUrl: '',
  editorPreset: 'code-server' as TEditorPreset,
  dangerouslySkipPermissions: false,
  claudeShowTerminal: true,
  gitAskProvider: 'claude' as TGitAskProvider,
  noteSummaryProvider: 'claude' as TNoteSummaryProvider,
  hasAuthPassword: false,
  locale: 'en',
  customCSS: '',
  regionTypography: {} as TRegionTypography,
  fontSize: 'normal',
  lineHeight: 'normal',
  lineHeightCustom: DEFAULT_LINE_HEIGHT,
  terminalKeyBar: 'auto' as TTerminalKeyBar,
  systemResourcesEnabled: false,
  networkAccess: 'all' as TNetworkAccess,
  hostEnvLocked: false,
  bindHostIsLocal: false,
};

const saveConfig = (updates: Record<string, unknown>) => {
  fetch('/api/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  }).catch((err) => {
    console.log(`[config-store] update failed: ${err instanceof Error ? err.message : err}`);
  });
};

let configSync: Promise<void> | null = null;
let configUpdatedAt = '';

const useConfigStore = create<IConfigState>((set, get) => ({
  appTheme: null,
  terminalTheme: null,
  commitMessagePrompt: GIT_GENERATION_PROMPTS.commitMessagePrompt.defaultPrompt,
  reviewDescriptionPrompt: GIT_GENERATION_PROMPTS.reviewDescriptionPrompt.defaultPrompt,
  setGitGenerationPrompt: async (key, prompt) => {
    const response = await fetch('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: prompt }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? `HTTP ${response.status}`);
    }
    set({ [key]: prompt });
  },
  branchNameProvider: 'claude',
  branchNamePrompt: DEFAULT_BRANCH_NAME_PROMPT,
  setBranchNameSettings: async (provider, prompt) => {
    const response = await fetch('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchNameProvider: provider, branchNamePrompt: prompt }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? `HTTP ${response.status}`);
    }
    set({ branchNameProvider: provider, branchNamePrompt: prompt });
  },
  codexEnvironment: {},
  claudeEnvironment: {},
  setCodexEnvironment: (env) => get().setAgentEnvironment('codex', env),
  setClaudeEnvironment: (env) => get().setAgentEnvironment('claude', env),
  setAgentEnvironment: async (provider, env) => {
    const key = AGENT_ENVIRONMENT_KEYS[provider];
    const current = get()[key];
    if (Object.keys(current).length === Object.keys(env).length &&
        Object.entries(env).every(([name, value]) => Object.hasOwn(current, name) && current[name] === value)) return;
    const response = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: env }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail = typeof data?.error === 'string' ? `: ${data.error}` : '';
      throw new Error(`HTTP ${response.status}${detail}`);
    }
    set({ [key]: env });
  },
  dangerouslySkipPermissions: initialConfig.dangerouslySkipPermissions,
  claudeShowTerminal: initialConfig.claudeShowTerminal,
  gitAskProvider: initialConfig.gitAskProvider,
  noteSummaryProvider: initialConfig.noteSummaryProvider,
  editorUrl: initialConfig.editorUrl,
  editorPreset: initialConfig.editorPreset,
  notificationsEnabled: initialConfig.notificationsEnabled,
  toastOnCompleteEnabled: initialConfig.toastOnCompleteEnabled,
  toastDuration: initialConfig.toastDuration,
  toastPositionDesktop: initialConfig.toastPositionDesktop,
  toastPositionMobile: initialConfig.toastPositionMobile,
  hasAuthPassword: initialConfig.hasAuthPassword,
  locale: initialConfig.locale,
  customCSS: initialConfig.customCSS,
  regionTypography: initialConfig.regionTypography,
  fontSize: initialConfig.fontSize,
  lineHeight: initialConfig.lineHeight,
  lineHeightCustom: initialConfig.lineHeightCustom,
  terminalKeyBar: initialConfig.terminalKeyBar,
  systemResourcesEnabled: initialConfig.systemResourcesEnabled,
  networkAccess: initialConfig.networkAccess,
  hostEnvLocked: initialConfig.hostEnvLocked,
  bindHostIsLocal: initialConfig.bindHostIsLocal,

  hydrate: (data) => {
    if (data.updatedAt && configUpdatedAt && data.updatedAt <= configUpdatedAt) return;
    configUpdatedAt = data.updatedAt ?? '';

    set({
      appTheme: data.appTheme ?? null,
      terminalTheme: data.terminalTheme ?? null,
      branchNameProvider: data.branchNameProvider === 'codex' ? 'codex' : 'claude',
      branchNamePrompt: data.branchNamePrompt ?? DEFAULT_BRANCH_NAME_PROMPT,
      commitMessagePrompt: data.commitMessagePrompt ?? GIT_GENERATION_PROMPTS.commitMessagePrompt.defaultPrompt,
      reviewDescriptionPrompt: data.reviewDescriptionPrompt ?? GIT_GENERATION_PROMPTS.reviewDescriptionPrompt.defaultPrompt,
      codexEnvironment: data.codexEnvironment ?? {},
      claudeEnvironment: data.claudeEnvironment ?? {},
      dangerouslySkipPermissions: data.dangerouslySkipPermissions ?? false,
      claudeShowTerminal: data.claudeShowTerminal ?? true,
      gitAskProvider: data.gitAskProvider === 'codex' ? 'codex' : 'claude',
      noteSummaryProvider: data.noteSummaryProvider === 'codex' ? 'codex' : 'claude',
      editorUrl: data.editorUrl ?? '',
      editorPreset: data.editorPreset ?? 'code-server',
      notificationsEnabled: data.notificationsEnabled ?? true,
      toastOnCompleteEnabled: data.toastOnCompleteEnabled ?? true,
      toastDuration: data.toastDuration ?? DEFAULT_TOAST_DURATION,
      toastPositionDesktop: data.toastPositionDesktop ?? DEFAULT_TOAST_POSITION_DESKTOP,
      toastPositionMobile: data.toastPositionMobile ?? DEFAULT_TOAST_POSITION_MOBILE,
      hasAuthPassword: data.hasAuthPassword ?? false,
      locale: data.locale ?? 'en',
      customCSS: data.customCSS ?? '',
      regionTypography: isValidRegionTypography(data.regionTypography) ? data.regionTypography : {},
      fontSize: data.fontSize ?? 'normal',
      lineHeight: data.lineHeight ?? 'normal',
      lineHeightCustom: data.lineHeightCustom ?? DEFAULT_LINE_HEIGHT,
      terminalKeyBar: data.terminalKeyBar ?? 'auto',
      systemResourcesEnabled: data.systemResourcesEnabled ?? false,
      networkAccess: data.networkAccess ?? 'all',
      hostEnvLocked: data.hostEnvLocked ?? get().hostEnvLocked,
      bindHostIsLocal: data.bindHostIsLocal ?? get().bindHostIsLocal,
    });
  },

  setDangerouslySkipPermissions: (enabled) => {
    set({ dangerouslySkipPermissions: enabled });
    saveConfig({ dangerouslySkipPermissions: enabled });
  },

  setClaudeShowTerminal: (enabled) => {
    set({ claudeShowTerminal: enabled });
    saveConfig({ claudeShowTerminal: enabled });
  },

  setGitAskProvider: (provider) => {
    set({ gitAskProvider: provider });
    saveConfig({ gitAskProvider: provider });
  },

  setNoteSummaryProvider: (provider) => {
    set({ noteSummaryProvider: provider });
    saveConfig({ noteSummaryProvider: provider });
  },

  setEditorUrl: (url) => {
    if (get().editorUrl === url) return;
    set({ editorUrl: url });
    saveConfig({ editorUrl: url });
  },

  setEditorPreset: (preset) => {
    if (get().editorPreset === preset) return;
    set({ editorPreset: preset });
    saveConfig({ editorPreset: preset });
  },

  setNotificationsEnabled: (enabled) => {
    set({ notificationsEnabled: enabled });
    saveConfig({ notificationsEnabled: enabled });
  },

  setToastOnCompleteEnabled: (enabled) => {
    if (get().toastOnCompleteEnabled === enabled) return;
    set({ toastOnCompleteEnabled: enabled });
    saveConfig({ toastOnCompleteEnabled: enabled });
  },

  setToastDuration: (duration) => {
    if (get().toastDuration === duration) return;
    set({ toastDuration: duration });
    saveConfig({ toastDuration: duration });
  },

  setToastPositionDesktop: (position) => {
    if (get().toastPositionDesktop === position) return;
    set({ toastPositionDesktop: position });
    saveConfig({ toastPositionDesktop: position });
  },

  setToastPositionMobile: (position) => {
    if (get().toastPositionMobile === position) return;
    set({ toastPositionMobile: position });
    saveConfig({ toastPositionMobile: position });
  },

  changePassword: (password) => {
    set({ hasAuthPassword: true });
    saveConfig({ authPassword: password });
  },

  setLocale: (locale) => {
    set({ locale });
    saveConfig({ locale });
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).electronAPI) {
      (window as unknown as { electronAPI: { setLocale: (l: string) => void } }).electronAPI.setLocale(locale);
    }
  },

  syncConfig: () => {
    if (configSync) return configSync;
    configSync = Promise.resolve().then(async () => {
      try {
        const response = await fetch('/api/config');
        if (response.ok) get().hydrate(await response.json());
      } catch {
        // Keep the current configuration while offline.
      } finally {
        configSync = null;
      }
    });
    return configSync;
  },

  setRegionTypography: async (regionTypography) => {
    if (regionTypographyEqual(regionTypography, get().regionTypography)) return;
    const response = await fetch('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regionTypography }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
    if (data?.config) get().hydrate(data.config);
    else await get().syncConfig();
  },

  setCustomCSS: (css) => {
    set({ customCSS: css });
    saveConfig({ customCSS: css });
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
    saveConfig({ fontSize });
  },

  setLineHeight: (lineHeight) => {
    set({ lineHeight });
    saveConfig({ lineHeight });
  },

  setLineHeightCustom: (value) => {
    if (get().lineHeightCustom === value) return;
    set({ lineHeightCustom: value });
    saveConfig({ lineHeightCustom: value });
  },

  setTerminalKeyBar: (value) => {
    if (get().terminalKeyBar === value) return;
    set({ terminalKeyBar: value });
    saveConfig({ terminalKeyBar: value });
  },

  setSystemResourcesEnabled: (enabled) => {
    set({ systemResourcesEnabled: enabled });
    saveConfig({ systemResourcesEnabled: enabled });
  },

  setNetworkAccess: (value) => {
    set({ networkAccess: value });
    saveConfig({ networkAccess: value });
  },
}));

export default useConfigStore;
