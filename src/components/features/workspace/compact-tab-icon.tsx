import { GitCompareArrows, Globe, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import ProcessIcon from '@/components/icons/process-icon';
import Spinner from '@/components/ui/spinner';
import type { TTabDisplayStatus, TTerminalStatus } from '@/types/status';
import type { TPanelType } from '@/types/terminal';

export default function CompactTabIcon({ panelType, status, terminalStatus, process }: {
  panelType?: TPanelType;
  status: TTabDisplayStatus;
  terminalStatus?: TTerminalStatus;
  process?: string | null;
}) {
  const t = useTranslations('terminal');
  const isAgent = panelType === 'claude-code' || panelType === 'codex-cli';
  const label = panelType === 'claude-code' ? 'Claude'
    : panelType === 'codex-cli' ? 'Codex'
    : panelType === 'agent-sessions' ? t('sessionList')
    : panelType === 'web-browser' ? 'Web Browser'
    : panelType === 'diff' ? 'Git Diff' : process || 'Terminal';
  const statusLabel = !isAgent || status === 'idle' ? ''
    : status === 'busy' ? t('statusBusy')
    : status === 'needs-input' ? t('statusNeedsInput')
    : status === 'ready-for-review' ? t('statusNeedsReview') : '?';
  const color = terminalStatus === 'server' ? 'text-ui-green'
    : terminalStatus === 'running' ? 'text-ui-blue' : 'text-muted-foreground';

  return <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center" role="img" aria-label={`${label} ${statusLabel}`.trim()} title={`${label} ${statusLabel}`.trim()}>
    {panelType === 'claude-code' ? <ClaudeCodeIcon size={14} aria-hidden="true" />
      : panelType === 'codex-cli' ? <OpenAIIcon size={14} className="text-foreground" aria-hidden="true" />
      : panelType === 'agent-sessions' ? <History size={14} className="text-muted-foreground" aria-hidden="true" />
      : panelType === 'web-browser' ? <Globe size={14} className="text-muted-foreground" aria-hidden="true" />
      : panelType === 'diff' ? <GitCompareArrows size={14} className="text-muted-foreground" aria-hidden="true" />
      : <ProcessIcon process={process} className={`h-3.5 w-3.5 ${color}`} />}
    {isAgent && status !== 'idle' && <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2 items-center justify-center rounded-full bg-background" aria-hidden="true">
      {status === 'busy' ? <Spinner className="h-2 w-2 text-muted-foreground" />
        : <span className={`h-1.5 w-1.5 rounded-full ${status === 'ready-for-review' ? 'animate-pulse bg-claude-active' : status === 'needs-input' ? 'animate-pulse bg-ui-amber' : 'bg-muted-foreground/50'}`} />}
    </span>}
  </span>;
}
