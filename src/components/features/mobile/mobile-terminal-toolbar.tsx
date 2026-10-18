import { useState, useCallback, useRef, useEffect, type ChangeEvent } from 'react';
import { SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toCtrlChar } from '@/lib/terminal-keys';
import TerminalKeyBar from '@/components/features/workspace/terminal-key-bar';

interface IMobileTerminalToolbarProps {
  sendStdin: (data: string) => void;
  terminalConnected: boolean;
}

const LINE_HEIGHT = 20;
const PADDING_Y = 16;
const MAX_ROWS = 3;

const MobileTerminalToolbar = ({ sendStdin, terminalConnected }: IMobileTerminalToolbarProps) => {
  const t = useTranslations('mobile');
  const [value, setValue] = useState('');
  const [ctrlActive, setCtrlActive] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = LINE_HEIGHT * MAX_ROWS + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleSend = useCallback(() => {
    if (!terminalConnected) return;
    if (value) sendStdin(value);
    sendStdin('\r');
    setValue('');
  }, [value, sendStdin, terminalConnected]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      if (ctrlActive && newValue.length === value.length + 1) {
        const ctrl = toCtrlChar(newValue[newValue.length - 1]);
        if (ctrl) {
          sendStdin(ctrl);
          setCtrlActive(false);
          return;
        }
      }
      if (shiftActive && newValue.length === value.length + 1) {
        const typed = newValue[newValue.length - 1];
        const upper = typed.toUpperCase();
        if (upper !== typed) {
          setValue(value + upper);
          setShiftActive(false);
          return;
        }
      }
      setValue(newValue);
    },
    [ctrlActive, shiftActive, value, sendStdin],
  );

  return (
    <div className="shrink-0 border-t border-border bg-background">
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          placeholder={ctrlActive ? 'Ctrl + ...' : shiftActive ? 'Shift + ...' : t('commandPlaceholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground',
            ctrlActive || shiftActive
              ? 'border-claude-active bg-claude-active/10'
              : 'border-border bg-black/5 focus:border-ring dark:bg-white/5',
          )}
          style={{
            lineHeight: `${LINE_HEIGHT}px`,
            maxHeight: `${LINE_HEIGHT * MAX_ROWS + PADDING_Y}px`,
            overflowY: 'auto',
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground',
            value.trim() && 'text-claude-active',
          )}
          onClick={handleSend}
          aria-label={t('send')}
        >
          <SendHorizontal size={16} />
        </Button>
      </div>

      <TerminalKeyBar className="border-t-0 pt-0" sendStdin={sendStdin}
        ctrlActive={ctrlActive} shiftActive={shiftActive} setCtrlActive={setCtrlActive} setShiftActive={setShiftActive} />
    </div>
  );
};

export default MobileTerminalToolbar;
