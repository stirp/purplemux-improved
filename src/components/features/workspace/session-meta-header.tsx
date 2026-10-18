import { ChevronDown } from 'lucide-react';
import { MetaCompact } from '@/components/features/workspace/session-meta-content';
import SessionWorkStatusSelect from '@/components/features/workspace/session-work-status-select';
import type { ISessionMetaData } from '@/hooks/use-session-meta';
import type { TSessionHistoryProvider } from '@/types/session-history';
import { cn } from '@/lib/utils';

interface ISessionMetaHeaderProps {
  meta: ISessionMetaData;
  branch: string | null;
  provider: TSessionHistoryProvider;
  tabId?: string;
  sessionId: string | null;
  statusDisabled?: boolean;
  expanded: boolean;
  onExpand: () => void;
}

const SessionMetaHeader = ({ meta, branch, provider, tabId, sessionId, statusDisabled, expanded, onExpand }: ISessionMetaHeaderProps) => (
  <div className="flex shrink-0 items-center gap-2 border-b px-4 py-1.5">
    <div
      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
      role="button"
      aria-expanded={expanded}
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
    >
      <div className="@container min-w-0 flex-1">
        <MetaCompact
          title={meta.title}
          totalCost={meta.totalCost}
          branch={branch}
          usedPercentage={meta.usedPercentage}
          currentContextTokens={meta.currentContextTokens}
          contextWindowSize={meta.contextWindowSize}
        />
      </div>
      <ChevronDown size={14} className={cn('shrink-0 text-muted-foreground transition-transform duration-150', expanded && 'rotate-180')} />
    </div>
    <SessionWorkStatusSelect provider={provider} tabId={tabId ?? ''} sessionId={sessionId} disabled={statusDisabled || !tabId} />
  </div>
);

export default SessionMetaHeader;
