// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodexSessions } from '@/hooks/use-codex-sessions';
import { invalidateSessionLists } from '@/lib/session-list-cache';
import SessionHistoryActions from '@/components/features/workspace/session-history-actions';
import useAgentStatus from '@/hooks/use-agent-status';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-tab-store', () => ({ default: { getState: () => ({ setStatusWsConnected: vi.fn() }) } }));
vi.mock('@/hooks/use-tab-metadata-store', () => ({ default: {} }));
vi.mock('@/hooks/use-rate-limits-store', () => ({ default: {} }));
vi.mock('@/hooks/use-git-status-store', () => ({ default: {} }));
vi.mock('@/hooks/use-layout', () => ({ useLayoutStore: {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

let root: Root;
let container: HTMLDivElement;
let removed: boolean;
let reads: number;
let releaseRead: (() => void) | undefined;
let readGate: Promise<void> | undefined;
let socket: { onmessage?: (event: { data: string }) => void };
let project: string;
let sequence = 0;

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  useAgentStatus();
  const { sessions } = useCodexSessions(project, enabled);
  const actions = { provider: 'codex' as const, sessionId: 'parent', onDeleted: async () => {},
    children: createElement('button', null, 'history') };
  return createElement('div', null,
    createElement('output', null, sessions.map((session) => session.sessionId).join(',')),
    createElement(SessionHistoryActions, actions),
  );
};
const render = async (enabled = true) => {
  await act(async () => root.render(createElement(Harness, { enabled })));
};

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', class {
    constructor() { socket = { close: vi.fn() } as typeof socket; return socket; }
  });
  project = `/project-${++sequence}`;
  removed = false;
  reads = 0;
  readGate = undefined;
  releaseRead = undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') {
      removed = true;
      return { ok: true, status: 204 };
    }
    reads++;
    if (readGate) await readGate;
    return { ok: true, json: async () => ({ sessions: removed ? [] : [{ sessionId: 'parent' }] }) };
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  releaseRead?.();
  await act(async () => root.unmount());
  container.remove();
  await invalidateSessionLists();
  vi.unstubAllGlobals();
});

describe('project session cache invalidation', () => {
  it('clears a closed list after real history deletion and refetches inside the 30 second window', async () => {
    await render();
    expect(container.querySelector('output')?.textContent).toBe('parent');
    await render(false);
    await act(async () => (container.querySelector('[aria-label="deleteHistory"]') as HTMLButtonElement).click());
    const confirm = Array.from(document.querySelectorAll('button')).find((node) => node.textContent === 'deletePermanently')!;
    await act(async () => confirm.click());
    expect(removed).toBe(true);
    readGate = new Promise((resolve) => { releaseRead = resolve; });
    await render();
    expect(container.querySelector('output')?.textContent).toBe('');
    await act(async () => { releaseRead!(); });
    expect(reads).toBe(2);
    expect(container.querySelector('output')?.textContent).toBe('');
  });

  it('clears active and inactive list caches when history arrives from another client or reconnect', async () => {
    await render();
    removed = true;
    readGate = new Promise((resolve) => { releaseRead = resolve; });
    await act(async () => socket.onmessage?.({ data: JSON.stringify({ type: 'session-history:sync', entries: [] }) }));
    expect(container.querySelector('output')?.textContent).toBe('');
    await act(async () => { releaseRead!(); });
    expect(container.querySelector('output')?.textContent).toBe('');
    expect(reads).toBe(2);
  });
});
