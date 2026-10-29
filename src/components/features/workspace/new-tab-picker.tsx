import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Globe, Search, Terminal } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Spinner from '@/components/ui/spinner';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import useNewTabSessions from '@/hooks/use-new-tab-sessions';
import useNewTabActionStore from '@/hooks/use-new-tab-action-store';
import { useAgentInstallCheck } from '@/hooks/use-agent-install-check';
import { navigateToTabOrCreate, useLayoutStore } from '@/hooks/use-layout';
import useConfigStore from '@/hooks/use-config-store';
import { buildClaudeLaunchCommand } from '@/lib/providers/claude/client';
import { fetchCodexLaunchCommand } from '@/lib/providers/codex/client';
import type { INewTabSession } from '@/lib/new-tab-sessions';
import type { TPanelType } from '@/types/terminal';

export interface INewTabPickerProps {
  paneId: string;
  mobile?: boolean;
  onClose: () => void;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string; resumeSessionId?: string }) => void | Promise<void | boolean>;
}

const NewTabPicker = ({ paneId, mobile, onClose, onCreateTab }: INewTabPickerProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const ts = useTranslations('session');
  const tn = useTranslations('notification');
  const workspaceId = useLayoutStore((state) => state.workspaceId);
  const { sessions, isLoading, isValidating, hasError, refresh } = useNewTabSessions();
  const { ensureAgentInstalled, installDialogs } = useAgentInstallCheck();
  const [query, setQuery] = useState('');
  const pending = useNewTabActionStore((state) => workspaceId ? state.pending[workspaceId] : undefined);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const applications = [
    { type: 'claude-code' as const, label: 'Claude', icon: ClaudeCodeIcon, title: t('claudeNewConversation') },
    { type: 'codex-cli' as const, label: 'Codex', icon: OpenAIIcon, title: t('codexNewConversation') },
    { type: 'terminal' as const, label: 'Terminal', icon: Terminal, title: 'Terminal' },
    ...(!mobile ? [{ type: 'web-browser' as const, label: 'Web Browser', icon: Globe, title: 'Web Browser' }] : []),
  ];
  const search = query.trim().toLocaleLowerCase();
  const filtered = sessions.filter((session) => [session.title, session.target.agentSessionId,
    session.target.providerId, session.target.workspaceDir].join(' ').toLocaleLowerCase().includes(search));

  const launch = async (type: TPanelType) => {
    if (!workspaceId || !useNewTabActionStore.getState().start(workspaceId, type)) return;
    setActionError(null);
    try {
      const provider = type === 'claude-code' ? 'claude' : type === 'codex-cli' ? 'codex' : null;
      if (provider && !await ensureAgentInstalled(provider)) return;
      const command = provider === 'codex' ? await fetchCodexLaunchCommand(workspaceId)
        : provider === 'claude' ? buildClaudeLaunchCommand({ workspaceId,
          dangerouslySkipPermissions: useConfigStore.getState().dangerouslySkipPermissions }) : undefined;
      const created = await onCreateTab(type, command ? { command } : undefined);
      if (mounted.current) {
        if (created === false) setActionError(t('tabCreateFailed'));
        else onClose();
      }
    } catch {
      const message = t(type === 'codex-cli' ? 'codexLaunchFailed' : 'tabCreateFailed');
      if (mounted.current) setActionError(message);
      toast.error(message);
    } finally {
      useNewTabActionStore.getState().finish(workspaceId);
    }
  };

  const resume = async (session: INewTabSession) => {
    const target = session.target;
    if (!useNewTabActionStore.getState().start(target.workspaceId, session.key)) return;
    setActionError(null);
    try {
      if (!await ensureAgentInstalled(target.providerId)) return;
      let selectedTabId: string | null = null;
      await navigateToTabOrCreate(target.workspaceId, target.tabId, target.agentSessionId,
        target.workspaceName, target.workspaceDir, target.providerId, {
          paneId, onNavigate: (_workspaceId, tabId) => { selectedTabId = tabId; },
        });
      if (!selectedTabId) throw new Error('resume-failed');
      const store = useLayoutStore.getState();
      if (store.workspaceId === target.workspaceId) {
        if (!store.focusTab(selectedTabId)) {
          await store.fetchLayout(target.workspaceId);
          if (useLayoutStore.getState().workspaceId === target.workspaceId && !store.focusTab(selectedTabId)) {
            throw new Error('layout-not-ready');
          }
        }
      }
      if (mounted.current) onClose();
    } catch {
      const message = t('resumeFailed');
      if (mounted.current) setActionError(message);
      toast.error(message);
    } finally {
      useNewTabActionStore.getState().finish(target.workspaceId);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={(event) => {
      if (!event.currentTarget.contains(event.target as Node)) return;
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-picker-item]:not(:disabled)')];
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (current < 0 && event.key === 'ArrowUp') return;
      event.preventDefault();
      items[(current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      <div className={`grid gap-2 border-b p-3 ${mobile ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {applications.map(({ type, label, icon: Icon, title }) => (
          <Button key={type} data-picker-item variant="outline" title={title} aria-label={title}
            className="h-auto min-w-0 flex-col gap-1.5 px-1 py-3 text-xs" disabled={!!pending}
            onClick={() => void launch(type)}>
            {pending === type ? <Spinner className="size-4" /> : <Icon className="size-4" />}
            <span className="max-w-full truncate">{label}</span>
          </Button>
        ))}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t('sessions')} <span className="text-muted-foreground">{sessions.length}</span></h3>
          <Button variant="ghost" size="sm" disabled={isValidating || !!pending} onClick={() => void refresh()}>{tc('refresh')}</Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input autoFocus={!mobile} aria-label={tn('searchPlaceholder')} placeholder={tn('searchPlaceholder')}
            className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {hasError && <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
          <span>{tc('error')}</span>
          <Button variant="ghost" size="sm" disabled={isValidating} onClick={() => void refresh()}>{tc('retry')}</Button>
        </div>}
        {actionError && <p role="alert" className="text-xs text-destructive">{actionError}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2" aria-busy={isLoading}>
        {isLoading && <div role="status" className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground"><Spinner className="size-4" />{tc('loading')}</div>}
        {!isLoading && filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">{search ? tn('searchEmpty') : ts('empty.noSession')}</p>}
        {filtered.map((session) => {
          const Icon = session.target.providerId === 'codex' ? OpenAIIcon : ClaudeCodeIcon;
          const title = session.title || ts('noMessage');
          return <button key={session.key} type="button" data-picker-item disabled={!!pending}
            className="flex w-full items-start gap-2.5 rounded-md px-3 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            aria-label={`${session.target.providerId}: ${title}`} onClick={() => void resume(session)}>
            {pending === session.key ? <Spinner className="mt-0.5 size-4 shrink-0" /> : <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={title}>{title}</span>
              <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate" title={session.target.workspaceDir ?? undefined}>{session.target.workspaceDir}</span>
                {session.updatedAt > 0 && <time className="shrink-0" dateTime={new Date(session.updatedAt).toISOString()}>{dayjs(session.updatedAt).format('MM/DD HH:mm')}</time>}
              </span>
            </span>
          </button>;
        })}
      </div>
      {installDialogs}
    </div>
  );
};

export default NewTabPicker;
