import { cn } from '@/lib/utils';
import { CTRL_TOGGLE, SHIFT_TOGGLE, TERMINAL_KEYS, type IKeyDef } from '@/lib/terminal-keys';

const NERD_FONT_STYLE = { fontFamily: 'MesloLGLDZ, monospace' } as const;

interface ITerminalKeyBarProps {
  inline?: boolean;
  sendStdin: (data: string) => void;
  ctrlActive: boolean;
  shiftActive: boolean;
  setCtrlActive: (active: boolean) => void;
  setShiftActive: (active: boolean) => void;
}

const TerminalKeyBar = ({ inline = false, sendStdin, ctrlActive, shiftActive, setCtrlActive, setShiftActive }: ITerminalKeyBarProps) => {
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
        'flex items-center gap-1 overflow-x-auto',
        inline ? 'min-w-0 max-w-[75%] py-1' : 'shrink-0 border-t border-border bg-background px-3 py-2',
      )}
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {TERMINAL_KEYS.map((key) => (
        <button
          key={key.label}
          type="button"
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
  );
};

export default TerminalKeyBar;
