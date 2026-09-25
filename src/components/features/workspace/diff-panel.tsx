import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { RefreshCw, GitBranch, Columns2, Rows2, ArrowUp, ArrowDown, ArrowDownUp, Archive, X, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import Spinner from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copyToClipboard } from '@/lib/clipboard';
import useIsMobile from '@/hooks/use-is-mobile';
import useConfigStore, { type TGitAskProvider } from '@/hooks/use-config-store';
import DiffHistoryView from '@/components/features/workspace/diff-history-view';
import DiffFileList from '@/components/features/workspace/diff-file-list';
import type { IDiffSettings, TDiffTab, TDiffViewMode } from '@/types/terminal';

interface IDiffPanelProps {
  sessionName: string;
  onSendToAgent?: (text: string, provider: TGitAskProvider) => void;
  onClose?: () => void;
  settings?: IDiffSettings;
  onSettingsChange?: (patch: Partial<IDiffSettings>) => void;
}

interface IHeadCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: number;
}

interface ISyncStep {
  name: 'fetch' | 'pull' | 'push';
  ok: boolean;
  skipped: boolean;
  stdout: string;
  stderr: string;
}

type TSyncErrorKind = 'no-upstream' | 'auth' | 'diverged' | 'rejected' | 'local-changes' | 'timeout' | 'unknown';

const POLL_INTERVAL = 10_000;
const FETCH_INTERVAL = 3 * 60_000;
const ERROR_TOAST_DURATION = 15_000;
const MAX_STDERR_LENGTH = 800;
const HOME_PATH_RE = /^\/Users\/[^/]+(?=\/|$)/;

const ERROR_MESSAGE_KEYS = {
  'no-upstream': 'syncErrorNoUpstream',
  auth: 'syncErrorAuth',
  diverged: 'syncErrorDiverged',
  rejected: 'syncErrorRejected',
  'local-changes': 'syncErrorLocalChanges',
  timeout: 'syncErrorTimeout',
  unknown: 'syncErrorGeneric',
} as const;

const AGENT_PROMPT_KEYS = {
  'no-upstream': 'agentPromptNoUpstream',
  auth: 'agentPromptAuth',
  diverged: 'agentPromptDiverged',
  rejected: 'agentPromptRejected',
  'local-changes': 'agentPromptLocalChanges',
  timeout: 'agentPromptTimeout',
  unknown: 'agentPromptGeneric',
} as const;

const shortenHomePath = (value: string) => value.replace(HOME_PATH_RE, '~');

const getPathBaseName = (value: string) => {
  const parts = value.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
};

const getCompactRepoPath = (value: string) => {
  const shortened = shortenHomePath(value);
  const parts = shortened.split('/').filter(Boolean);
  const hasHomePrefix = shortened.startsWith('~/');
  const hasRootPrefix = shortened.startsWith('/');

  if (parts.length <= 4) return shortened;

  const prefix = hasHomePrefix
    ? parts.slice(0, 2).join('/')
    : hasRootPrefix
      ? `/${parts[0]}`
      : parts[0];
  return `${prefix}/.../${parts.slice(-2).join('/')}`;
};

const DiffPanel = ({ sessionName, onSendToAgent, onClose, settings, onSettingsChange }: IDiffPanelProps) => {
  const t = useTranslations('diff');
  const tt = useTranslations('terminal');
  const isMobile = useIsMobile();
  const gitAskProvider = useConfigStore((s) => s.gitAskProvider);

  const [diff, setDiff] = useState('');
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [ahead, setAhead] = useState(0);
  const [behind, setBehind] = useState(0);
  const [branch, setBranch] = useState('');
  const [upstream, setUpstream] = useState<string | null>(null);
  const [isDetached, setIsDetached] = useState(false);
  const [stash, setStash] = useState(0);
  const [headCommit, setHeadCommit] = useState<IHeadCommit | null>(null);
  const [repoRoot, setRepoRoot] = useState('');
  const viewMode: TDiffViewMode = settings?.viewMode ?? 'split';
  const activeTab: TDiffTab = settings?.activeTab ?? 'changes';
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const pollTimerRef = useRef(0);
  const currentHashRef = useRef('');
  const lastFetchAtRef = useRef(0);

  const fetchDiff = useCallback(async (opts: { remoteFetch?: boolean } = {}) => {
    setLoading(true);
    setHasUpdate(false);
    try {
      const params = new URLSearchParams({ session: sessionName });
      if (opts.remoteFetch) params.set('fetch', 'true');
      const res = await fetch(`/api/layout/diff?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setIsGitRepo(data.isGitRepo);
      if (data.isGitRepo) {
        setDiff(data.diff ?? '');
        setAhead(data.ahead ?? 0);
        setBehind(data.behind ?? 0);
        setBranch(data.branch ?? '');
        setUpstream(data.upstream ?? null);
        setIsDetached(Boolean(data.isDetached));
        setStash(data.stash ?? 0);
        setHeadCommit(data.headCommit ?? null);
        setRepoRoot(data.repoRoot ?? '');
        currentHashRef.current = data.hash ?? '';
        if (data.fetched) lastFetchAtRef.current = Date.now();
      }
    } finally {
      setLoading(false);
    }
  }, [sessionName]);

  const pollForChanges = useCallback(async () => {
    const shouldFetch = Date.now() - lastFetchAtRef.current >= FETCH_INTERVAL;
    try {
      const params = new URLSearchParams({ session: sessionName, hashOnly: 'true' });
      if (shouldFetch) params.set('fetch', 'true');
      const res = await fetch(`/api/layout/diff?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.isGitRepo) return;
      if (data.fetched) lastFetchAtRef.current = Date.now();
      setAhead(data.ahead ?? 0);
      setBehind(data.behind ?? 0);
      if (data.hash && data.hash !== currentHashRef.current) {
        setHasUpdate(true);
      }
    } catch {
      // ignore
    }
  }, [sessionName]);

  const handleRefresh = useCallback(() => {
    fetchDiff({ remoteFetch: true });
    setHistoryRefreshToken((n) => n + 1);
  }, [fetchDiff]);

  const handleTabChange = useCallback((tab: TDiffTab) => {
    onSettingsChange?.({ activeTab: tab });
  }, [onSettingsChange]);

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/git/sync?session=${sessionName}`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(t('syncErrorGeneric'));
        return;
      }

      if (data.ok) {
        const { pulled, pushed } = data.summary ?? { pulled: 0, pushed: 0 };
        if (pulled === 0 && pushed === 0) {
          toast.success(t('syncUpToDate'));
        } else {
          const parts: string[] = [];
          if (pulled > 0) parts.push(`↓${pulled}`);
          if (pushed > 0) parts.push(`↑${pushed}`);
          toast.success(`${t('syncSuccess')} · ${parts.join(' ')}`);
        }
      } else {
        const kind: TSyncErrorKind = data.errorKind ?? 'unknown';
        const messageKey = ERROR_MESSAGE_KEYS[kind];
        const failedStep = (data.steps as ISyncStep[] | undefined)?.find((s) => !s.ok && !s.skipped);
        const stderr = failedStep?.stderr ?? failedStep?.stdout ?? '';

        toast.error(t(messageKey), {
          duration: ERROR_TOAST_DURATION,
          action: onSendToAgent ? {
            label: t(gitAskProvider === 'codex' ? 'askCodex' : 'askClaude'),
            onClick: () => {
              const promptKey = AGENT_PROMPT_KEYS[kind];
              const intro = t(promptKey, {
                branch: branch || 'HEAD',
                upstream: data.upstream ?? '',
              });
              const trimmedStderr = stderr.length > MAX_STDERR_LENGTH
                ? stderr.slice(0, MAX_STDERR_LENGTH) + '\n...(truncated)'
                : stderr;
              const body = trimmedStderr
                ? `${intro}\n\n\`\`\`\n${trimmedStderr.trim()}\n\`\`\``
                : intro;
              onSendToAgent(body, gitAskProvider);
            },
          } : undefined,
        });
      }

      fetchDiff();
      setHistoryRefreshToken((n) => n + 1);
    } catch {
      toast.error(t('syncErrorGeneric'));
    } finally {
      setSyncing(false);
    }
  }, [sessionName, syncing, t, fetchDiff, onSendToAgent, gitAskProvider, branch]);

  const handleCopyRepoRoot = useCallback(async () => {
    if (!repoRoot) return;
    const ok = await copyToClipboard(repoRoot);
    if (ok) {
      toast.success(tt('copyPaneSuccess'), { duration: 1500 });
    } else {
      toast.error(tt('copyPaneCopyFailed'));
    }
  }, [repoRoot, tt]);

  useEffect(() => {
    fetchDiff().then(() => pollForChanges());
  }, [fetchDiff, pollForChanges]);

  useEffect(() => {
    if (isGitRepo === false) return;

    pollTimerRef.current = window.setInterval(pollForChanges, POLL_INTERVAL);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') pollForChanges();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isGitRepo, pollForChanges]);

  if (loading && isGitRepo === null) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (isGitRepo === false) {
    return (
      <div className="flex h-full items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <GitBranch className="h-10 w-10 opacity-20" />
          <span className="text-sm">{t('notGitRepo')}</span>
        </div>
      </div>
    );
  }

  const branchLabel = isDetached && headCommit
    ? `(detached @ ${headCommit.shortHash})`
    : branch || '—';

  const hasSyncWork = ahead > 0 || behind > 0;
  const SyncIcon = behind > 0 && ahead === 0
    ? ArrowDown
    : ahead > 0 && behind === 0
      ? ArrowUp
      : ArrowDownUp;
  const syncCountLabel = [
    behind > 0 ? `↓${behind}` : '',
    ahead > 0 ? `↑${ahead}` : '',
  ].filter(Boolean).join(' ');
  const syncTitle = syncing
    ? t('syncing')
    : hasSyncWork ? `${t('sync')} · ${syncCountLabel}` : t('sync');
  const repoBaseName = repoRoot ? getPathBaseName(repoRoot) : '';
  const repoDisplayPath = repoRoot ? getCompactRepoPath(repoRoot) : '';

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex shrink-0 flex-col border-b border-border">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
            <Tabs
              value={activeTab}
            onValueChange={(value) => handleTabChange(value as TDiffTab)}
            className="gap-0"
          >
            <TabsList className="h-7 w-auto min-w-40">
              <TabsTrigger value="changes" className="relative h-full flex-1 px-2.5 text-[11px] tracking-wide">
                {t('tabChanges').toUpperCase()}
              </TabsTrigger>
              <TabsTrigger value="history" className="relative h-full flex-1 px-2.5 text-[11px] tracking-wide">
                {t('tabHistory').toUpperCase()}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <TooltipProvider>
            <div className="ml-auto flex items-center gap-1">
              {activeTab === 'changes' && !isMobile && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground"
                      />
                    }
                    onClick={() => onSettingsChange?.({ viewMode: viewMode === 'split' ? 'unified' : 'split' })}
                    aria-label={viewMode === 'split' ? t('lineByLine') : t('sideBySide')}
                  >
                    {viewMode === 'split' ? <Rows2 className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{viewMode === 'split' ? t('lineByLine') : t('sideBySide')}</TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size={hasSyncWork ? 'sm' : 'icon-sm'}
                      className={cn(
                        'h-7',
                        hasSyncWork ? 'px-2' : 'w-7 px-0',
                        hasSyncWork && !syncing
                          ? 'bg-ui-blue/10 text-ui-blue hover:bg-ui-blue/15 hover:text-ui-blue'
                          : 'text-muted-foreground',
                      )}
                    />
                  }
                  className={cn(
                    'disabled:opacity-50',
                  )}
                  onClick={handleSync}
                  disabled={syncing || loading}
                  aria-label={syncTitle}
                >
                  {syncing
                    ? <Spinner className="h-3.5 w-3.5" />
                    : <SyncIcon className="h-3.5 w-3.5" />}
                  {hasSyncWork && !syncing && (
                    <span className="font-mono text-[11px] leading-none">{syncCountLabel}</span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="bottom">{syncTitle}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        'h-7 w-7',
                        hasUpdate && activeTab === 'changes'
                          ? 'bg-ui-blue/10 text-ui-blue hover:bg-ui-blue/15 hover:text-ui-blue'
                          : 'text-muted-foreground',
                      )}
                    />
                  }
                  className={cn(
                    'relative disabled:opacity-50',
                  )}
                  onClick={handleRefresh}
                  disabled={loading}
                  aria-label={t('refresh')}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  {hasUpdate && activeTab === 'changes' && (
                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ui-blue" />
                  )}
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {hasUpdate && activeTab === 'changes' ? `${t('hasChanges')} · ${t('refresh')}` : t('refresh')}
                </TooltipContent>
              </Tooltip>

              {onClose && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground"
                      />
                    }
                    onClick={onClose}
                    aria-label="Close Git"
                  >
                    <X className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>

        {isMobile && repoRoot && (
          <button
            type="button"
            className="flex min-h-8 min-w-0 items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left text-xs text-muted-foreground active:bg-accent/60"
            onClick={handleCopyRepoRoot}
            title={repoRoot}
            aria-label={repoRoot}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate font-medium text-foreground">
              {repoBaseName}
            </span>
            <span className="shrink-0 text-muted-foreground/50">·</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {repoDisplayPath}
            </span>
          </button>
        )}

        <div className="flex min-h-9 min-w-0 items-center gap-2 px-3 py-2 text-xs">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate font-medium text-foreground" title={branchLabel}>
              {branchLabel}
            </span>
            {upstream && (
              <span className="shrink-0 text-muted-foreground">→</span>
            )}
            {upstream && (
              <span className="truncate text-muted-foreground" title={upstream}>
                {upstream}
              </span>
            )}
          </div>

          {(ahead > 0 || behind > 0) && (
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
              {ahead > 0 && (
                <span className="flex items-center gap-0.5 text-ui-blue" title={`${ahead} commit(s) to push`}>
                  <ArrowUp className="h-3 w-3" />
                  {ahead}
                </span>
              )}
              {behind > 0 && (
                <span className="flex items-center gap-0.5 text-claude-active" title={`${behind} commit(s) to pull`}>
                  <ArrowDown className="h-3 w-3" />
                  {behind}
                </span>
              )}
            </div>
          )}

          {stash > 0 && (
            <span
              className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-muted-foreground"
              title={`${stash} stash(es)`}
            >
              <Archive className="h-3 w-3" />
              {stash}
            </span>
          )}
        </div>

      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === 'history' ? (
          <DiffHistoryView repoRoot={repoRoot} sessionName={sessionName} refreshToken={historyRefreshToken} viewMode={viewMode} />
        ) : (
          <>
            {!diff && (
              <div className="flex h-full items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <GitBranch className="h-10 w-10 opacity-20" />
                  <span className="text-sm">{t('noChanges')}</span>
                </div>
              </div>
            )}
            {diff && <DiffFileList repoRoot={repoRoot} diff={diff} viewMode={viewMode} sessionName={sessionName} />}
          </>
        )}
      </div>
    </div>
  );
};

export default DiffPanel;
