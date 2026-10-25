import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, RotateCcw, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const DEFAULT_ALMOST_READY_MS = 2_000;
const DEFAULT_TICK_INTERVAL_MS = 250;

interface IAgentBootProgressProps {
  icon: ReactNode;
  main: string;
  almostReady?: string;
  subtitle: string;
  failed?: string;
  failedHint?: string;
  restartLabel?: string;
  showTerminalLabel?: string;
  className?: string;
  almostReadyMs?: number;
  errorThresholdMs?: number;
  hasFailed?: boolean;
  onRestart?: () => void;
  onShowTerminal?: () => void;
}

const AgentBootProgress = ({
  icon,
  main,
  almostReady,
  subtitle,
  failed,
  failedHint,
  restartLabel,
  showTerminalLabel,
  className,
  almostReadyMs = DEFAULT_ALMOST_READY_MS,
  errorThresholdMs,
  hasFailed,
  onRestart,
  onShowTerminal,
}: IAgentBootProgressProps) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, DEFAULT_TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const isError = hasFailed ?? (typeof errorThresholdMs === 'number' && elapsedMs >= errorThresholdMs);
  const isAlmostReady = elapsedMs >= almostReadyMs;

  if (isError && failed && failedHint) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center',
          className,
        )}
        role="alert"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <div>
          <p className="text-base font-medium text-foreground">{failed}</p>
          <p className="mt-1 text-sm text-muted-foreground">{failedHint}</p>
        </div>
        {(onRestart || onShowTerminal) && (
          <div className="flex gap-2">
            {onRestart && restartLabel && (
              <Button variant="default" size="sm" onClick={onRestart}>
                <RotateCcw className="h-3.5 w-3.5" />
                {restartLabel}
              </Button>
            )}
            {onShowTerminal && showTerminalLabel && (
              <Button variant="outline" size="sm" onClick={onShowTerminal}>
                <TerminalSquare className="h-3.5 w-3.5" />
                {showTerminalLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-5 px-6',
        className,
      )}
      role="status"
      aria-busy="true"
    >
      {icon}
      <div className="text-center" aria-live="polite">
        <p className="text-base font-medium text-foreground">
          {isAlmostReady && almostReady ? almostReady : main}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      {onShowTerminal && showTerminalLabel && (
        <Button variant="outline" size="sm" onClick={onShowTerminal}>
          <TerminalSquare className="h-3.5 w-3.5" />
          {showTerminalLabel}
        </Button>
      )}
    </div>
  );
};

export default AgentBootProgress;
