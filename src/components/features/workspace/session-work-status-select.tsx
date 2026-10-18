import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Circle, CircleDot, Clock3, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger } from '@/components/ui/select';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { useSessionWorkflowMutation } from '@/hooks/use-session-workflow';
import { collectWorkSessions, sessionWorkKey, WORK_STATUSES, type TWorkStatus } from '@/lib/session-workflow';
import type { TSessionHistoryProvider } from '@/types/session-history';
import { cn } from '@/lib/utils';

interface ISessionWorkStatusSelectProps {
  provider: TSessionHistoryProvider;
  tabId: string;
  sessionId: string | null;
  disabled?: boolean;
}

const STATUS_STYLES = {
  pending: { icon: Circle, className: 'text-muted-foreground' },
  'in-progress': { icon: CircleDot, className: 'text-ui-blue' },
  review: { icon: Clock3, className: 'text-ui-amber' },
  completed: { icon: CheckCircle2, className: 'text-ui-green' },
};

const SessionWorkStatusSelect = ({ provider, tabId, sessionId, disabled }: ISessionWorkStatusSelectProps) => {
  const t = useTranslations('notification');
  const workflow = useWorkspaceStore((s) => s.sessionWorkflow);
  const tabs = useTabStore((s) => s.tabs);
  const entries = useSessionHistoryStore((s) => s.entries);
  const { save, saving } = useSessionWorkflowMutation();
  const key = sessionWorkKey(provider, sessionId, `tab:${tabId}`);
  const fallback = sessionWorkKey(provider, null, `tab:${tabId}`);
  const session = useMemo(() => collectWorkSessions(entries, tabs, workflow).find((item) => item.key === key), [entries, tabs, workflow, key]);
  const tab = tabs[tabId];
  const tabProvider = tab?.agentProviderId === 'codex' || tab?.panelType === 'codex-cli' ? 'codex' : 'claude';
  const bindingPending = !!sessionId && !workflow.tabBindings?.[fallback] && workflow.statuses[fallback] !== undefined;
  const unavailable = disabled || !session || !tab || tabProvider !== provider
    || (tab.agentSessionId ?? null) !== sessionId || bindingPending;
  const status = session?.status ?? 'pending';
  const { icon: Icon, className } = STATUS_STYLES[status];

  return (
    <Select<TWorkStatus | 'auto'>
      key={`${key}:${!!unavailable}`}
      value={workflow.statuses[key] ?? 'auto'}
      disabled={unavailable}
      readOnly={saving}
      onValueChange={(value) => {
        if (unavailable || saving || !value) return;
        void save({ key, status: value === 'auto' ? null : value });
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={`${t('workStatusLabel')}: ${t('workStatus_' + status)}`}
        aria-busy={saving}
        title={t(workflow.statuses[key] ? 'workStatusLabel' : 'workStatusAuto')}
        className={cn('shrink-0 border-transparent bg-muted/40 px-2 text-xs hover:bg-muted [@media(pointer:coarse)]:min-h-11', className)}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        <span>{t('workStatus_' + status)}</span>
      </SelectTrigger>
      <SelectContent align="end" className="shadow-none">
        {WORK_STATUSES.map((value) => (
          <SelectItem key={value} value={value} className="[@media(pointer:coarse)]:min-h-11">
            {t('workStatus_' + value)}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value="auto" className="[@media(pointer:coarse)]:min-h-11">{t('workStatusAuto')}</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default SessionWorkStatusSelect;
