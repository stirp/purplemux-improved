import { isClaudeTuiReadyContent } from '@/lib/claude-tui-ready-detector';
import { isCodexTuiReadyContent } from '@/lib/codex-tui-ready-detector';

type TProvider = 'claude' | 'codex';

export const isNativeCommandComposerReady = (provider: TProvider, content: string): boolean => {
  const lines = content.trimEnd().split('\n').slice(-16);
  const tail = lines.join('\n');
  // Slash completions and nested menus may retain the ordinary composer behind them.
  if (/(?:esc(?:ape)?\s+(?:to\s+)?(?:cancel|go back|close|interrupt|stop)|(?:enter|↵)\s+(?:to\s+)?(?:select|confirm)|[↑↓].*(?:select|navigate))/i.test(tail)) return false;
  const marker = provider === 'codex' ? /^\s*›/ : /^\s*❯/;
  const composer = [...lines].reverse().find((line) => marker.test(line));
  if (!composer || /^\s*[›❯]\s*(?:\/|\d+\.\s|\[[ x-]\])/.test(composer)) return false;
  return provider === 'codex' ? isCodexTuiReadyContent(content) : isClaudeTuiReadyContent(content);
};

export class NativeCommandCompletion {
  private interacted = false;
  private submitted = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private provider: TProvider, private readContent: () => string, private complete: () => void) {}

  input(data: string) {
    this.cancelPending();
    if (['\r', '\n', '\x1b', '\x03'].includes(data)) this.submitted = true;
  }

  parsed(content: string) {
    this.cancelPending();
    if (!isNativeCommandComposerReady(this.provider, content)) {
      this.interacted = true;
      return;
    }
    // Ignore the old idle screen until the native interaction has actually begun.
    if (!this.interacted && !this.submitted) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (isNativeCommandComposerReady(this.provider, this.readContent())) this.complete();
    }, 250);
  }

  cancelPending() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
