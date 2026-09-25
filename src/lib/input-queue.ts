import type { TCliState } from '@/types/timeline';

export interface IQueuedInput {
  id: string;
  text: string;
  attachments: { path: string; filename: string }[];
}

export interface IInputTarget {
  tabId: string;
  workspaceId: string;
  sessionName: string;
  provider: 'claude' | 'codex';
  agentSessionId?: string | null;
}

interface IQueueStatus {
  cliState: TCliState;
  eventSeq?: number;
  agentSessionId?: string | null;
  workspaceId: string;
  agentProviderId?: string;
}

interface IQueueEntry {
  target: IInputTarget;
  messages: IQueuedInput[];
  sending: boolean;
  error: string | null;
  waiting?: { seq: number; sawBusy: boolean };
}

const isIdle = (state: TCliState) => state === 'idle' || state === 'ready-for-review';

export class InputQueue {
  private entries = new Map<string, IQueueEntry>();

  constructor(
    private readonly status: (tabId: string) => IQueueStatus | undefined,
    private readonly deliver: (target: IInputTarget, message: IQueuedInput, immediately: boolean) => Promise<void>,
  ) {}

  snapshot(tabId: string) {
    const entry = this.entries.get(tabId);
    return {
      messages: entry?.messages ?? [],
      sending: entry?.sending ?? false,
      error: entry?.error ?? null,
    };
  }

  enqueue(target: IInputTarget, message: IQueuedInput) {
    let entry = this.entries.get(target.tabId);
    if (!entry) {
      entry = { target, messages: [], sending: false, error: null };
      this.entries.set(target.tabId, entry);
    }
    if (entry.messages.some((item) => item.id === message.id)) return;
    if (entry.messages.length >= 50) throw new Error('Queue is full');
    entry.messages.push(message);
  }

  remove(tabId: string, id: string) {
    const entry = this.entries.get(tabId);
    if (!entry || (entry.sending && entry.messages[0]?.id === id)) return;
    entry.messages = entry.messages.filter((item) => item.id !== id);
    if (!entry.messages.length && !entry.sending) this.entries.delete(tabId);
  }

  async flush(tabId: string, immediately = false) {
    const entry = this.entries.get(tabId);
    if (!entry || entry.sending) return;
    const status = this.status(tabId);
    if (!status || status.workspaceId !== entry.target.workspaceId) {
      this.entries.delete(tabId);
      return;
    }
    if ((entry.target.agentSessionId && status.agentSessionId && entry.target.agentSessionId !== status.agentSessionId)
      || (status.agentProviderId && status.agentProviderId !== entry.target.provider)) {
      entry.error = 'sessionChanged';
      return;
    }
    if (!entry.target.agentSessionId && status.agentSessionId) entry.target.agentSessionId = status.agentSessionId;
    if (entry.waiting) {
      if (status.cliState === 'busy') entry.waiting.sawBusy = true;
      if (isIdle(status.cliState) && (entry.waiting.sawBusy || (status.eventSeq ?? 0) > entry.waiting.seq)) {
        entry.waiting = undefined;
      }
    }
    if (!entry.messages.length) {
      if (!entry.waiting) this.entries.delete(tabId);
      return;
    }
    if (status.cliState === 'inactive' || status.cliState === 'unknown') return;
    if (!immediately && (entry.error || entry.waiting || !isIdle(status.cliState))) return;

    entry.sending = true;
    entry.error = null;
    const message = entry.messages[0];
    try {
      await this.deliver(entry.target, message, immediately && status.cliState === 'busy');
      entry.messages = entry.messages.filter((item) => item.id !== message.id);
      entry.waiting = { seq: status.eventSeq ?? 0, sawBusy: status.cliState === 'busy' };
    } catch {
      // A partial terminal write cannot safely be retried automatically.
      entry.error = 'sendFailed';
    } finally {
      entry.sending = false;
    }
  }

  async tick() {
    await Promise.all([...this.entries.keys()].map((tabId) => this.flush(tabId)));
  }
}
