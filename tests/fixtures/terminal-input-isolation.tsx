import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import useTerminal from '@/hooks/use-terminal';
import useNativeCommands from '@/hooks/use-native-commands';
import TerminalContainer from '@/components/features/workspace/terminal-container';
import '@xterm/xterm/css/xterm.css';

const Harness = () => {
  const [expanded, setExpanded] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const [focusAttempts, setFocusAttempts] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const terminal = useRef<Pick<ReturnType<typeof useTerminal>, 'getBufferText' | 'focusAtBottom'> | null>(null);
  const native = useNativeCommands({
    scopeKey: 'isolated-browser-test', provider: 'codex',
    getBufferText: () => terminal.current?.getBufferText() ?? '',
    sendStdin: (text) => setSent((values) => [...values, text]),
    focusTerminal: () => terminal.current?.focusAtBottom(),
    focusInput: () => input.current?.focus(),
    revealTerminal: () => setExpanded(true),
  });
  const visible = expanded || native.active;
  const { terminalRef, isReady, write, getBufferText, focusAtBottom, focus } = useTerminal({ inputEnabled: visible, fontSize: 14,
    onInput: (text) => setSent((values) => [...values, text]),
    onWriteParsed: native.onParsed,
  });
  useEffect(() => { terminal.current = { getBufferText, focusAtBottom }; }, [getBufferText, focusAtBottom]);
  useEffect(() => {
    if (!isReady) return;
    write(new TextEncoder().encode('Background output continues\r\n› '));
  }, [isReady, write]);

  return <main>
    <h1>Terminal input isolation</h1>
    <button onClick={() => setMobile((value) => !value)}>Mode: {mobile ? 'mobile' : 'desktop'}</button>
    <button onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse' : 'Expand'}</button>
    <button onClick={() => {
      input.current?.focus();
      setTimeout(() => { focus(); setFocusAttempts((count) => count + 1); }, 100);
    }}>Simulate delayed terminal focus</button>
    <button onClick={() => native.open('$')}>Open native menu</button>
    <button onClick={() => { native.close(); setExpanded(false); }}>Return to Chat</button>
    <button onClick={() => write(new TextEncoder().encode('\r\nNEW OUTPUT'))}>Background output</button>
    <label>Web input<textarea ref={input} value={draft} disabled={native.active}
      onChange={(event) => setDraft(event.target.value)} /></label>
    <section style={mobile && !visible ? { position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }
      : { height: visible ? 220 : 0, overflow: 'hidden' }}>
      <TerminalContainer ref={terminalRef} minHeight={256} inert={!visible} />
    </section>
    <label>Next control<input aria-label="Next control" /></label>
    <pre id="received">{JSON.stringify(sent)}</pre>
    <output id="state">{JSON.stringify({ visible, mobile, ready: isReady, focusAttempts })}</output>
  </main>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
