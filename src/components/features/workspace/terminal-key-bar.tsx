import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CTRL_TOGGLE, SHIFT_TOGGLE, TERMINAL_KEYS, type IKeyDef } from '@/lib/terminal-keys';
import useTerminalKeys from '@/hooks/use-terminal-keys';
import TerminalKeySettings from '@/components/features/workspace/terminal-key-settings';

const NERD_FONT_STYLE = { fontFamily: 'MesloLGLDZ, monospace' } as const;

interface ITerminalKeyBarProps {
  inline?: boolean;
  className?: string;
  sendStdin: (data: string) => void;
  ctrlActive: boolean;
  shiftActive: boolean;
  setCtrlActive: (active: boolean) => void;
  setShiftActive: (active: boolean) => void;
}

const TerminalKeyBar = ({ inline = false, className, sendStdin, ctrlActive, shiftActive, setCtrlActive, setShiftActive }: ITerminalKeyBarProps) => {
  const { keys } = useTerminalKeys();
  const ctrlVisible = keys.some((key) => key.id === 'ctrl' && key.visible);
  const shiftVisible = keys.some((key) => key.id === 'shift' && key.visible);
  useEffect(() => {
    if (!ctrlVisible && ctrlActive) setCtrlActive(false);
    if (!shiftVisible && shiftActive) setShiftActive(false);
  }, [ctrlVisible, shiftVisible, ctrlActive, shiftActive, setCtrlActive, setShiftActive]);

  const handleKey = (key: IKeyDef) => {
    if (key.value === CTRL_TOGGLE) {
      setCtrlActive(!ctrlActive);
      return;
    }
    if (key.value === SHIFT_TOGGLE) {
      setShiftActive(!shiftActive);
      return;
    }
    sendStdin(key.value);
    if (ctrlActive) setCtrlActive(false);
    if (shiftActive) setShiftActive(false);
  };

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1',
        inline ? 'min-w-0 max-w-[75%] py-1' : 'shrink-0 border-t border-border bg-background px-3 py-2',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
        {keys.filter((key) => key.visible).map(({ id }) => TERMINAL_KEYS.find((key) => key.id === id)!).map((key) => (
          <button
            key={key.id}
            type="button"
            aria-label={key.name ?? key.label}
            aria-pressed={key.value === CTRL_TOGGLE ? ctrlActive : key.value === SHIFT_TOGGLE ? shiftActive : undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => handleKey(key)}
            className={cn(
              'shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              inline && 'min-h-8 min-w-8',
              (key.value === CTRL_TOGGLE && ctrlActive) || (key.value === SHIFT_TOGGLE && shiftActive)
                ? 'border-claude-active bg-claude-active/20 text-claude-active'
                : 'border-border bg-muted/50 text-muted-foreground active:bg-muted',
            )}
          >
            <span
              className={cn('inline-block', key.rotate && 'rotate-90')}
              style={key.nerd ? NERD_FONT_STYLE : undefined}
            >
              {key.label}
            </span>
          </button>
        ))}
      </div>
      <TerminalKeySettings />
    </div>
  );
};

export default TerminalKeyBar;
