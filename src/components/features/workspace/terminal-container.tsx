import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface ITerminalContainerProps {
  className?: string;
  minHeight?: number;
  inert?: boolean;
}

const TerminalContainer = forwardRef<HTMLDivElement, ITerminalContainerProps>(
  ({ className, minHeight, inert }, ref) => (
    <div inert={inert} aria-hidden={inert || undefined} className={cn('min-w-0 h-full w-full overflow-hidden p-2 flex flex-col justify-end', className)}>
      <div
        ref={ref}
        className="min-w-0 h-full w-full overflow-hidden"
        style={minHeight ? { minHeight } : undefined}
      />
    </div>
  ),
);

TerminalContainer.displayName = 'TerminalContainer';

export default TerminalContainer;
