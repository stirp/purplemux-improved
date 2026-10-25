import type { TCliState } from '@/types/timeline';

export interface IQueuedInput {
  id: string;
  text: string;
  attachments: { path: string; filename: string; imageHash?: string }[];
  createdAt?: number;
}

export interface IInputAttempt {
  id: string;
  at: number;
}

export class InputDeliveryError extends Error {
  constructor(public readonly code: 'deliveryUnconfirmed' | 'terminalNotReady' | 'terminalHasDraft' | 'sessionChanged') {
    super(code);
  }
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
  attempt?: { id: string; at: number };
  nextReceiptCheckAt?: number;
}

const isIdle = (state: TCliState) => state === 'idle' || state === 'ready-for-review';

export class InputQueue {
  private entries = new Map<string, IQueueEntry>();
  private canceled = new Map<string, Set<string>>();
  private attempts = new Map<string, Map<string, number>>();

  constructor(
    private readonly status: (tabId: string) => IQueueStatus | undefined,
    private readonly deliver: (target: IInputTarget, message: IQueuedInput, immediately: boolean, attemptedAt?: number) => Promise<void | { completed: boolean }>,
    private readonly checkReceipt?: (target: IInputTarget, message: IQueuedInput, since: number) => Promise<{ received: boolean; completed: boolean }>,
  ) {}

  snapshot(tabId: string) {
    const entry = this.entries.get(tabId);
    return {
      messages: entry?.messages ?? [],
      sending: entry?.sending ?? false,
      error: entry?.error ?? null,
      canceledIds: [...(this.canceled.get(tabId) ?? [])],
      attempts: [...(this.attempts.get(tabId) ?? [])].map(([id, at]) => ({ id, at })),
    };
  }

  hasPendingInput(tabId: string): boolean {
    const entry = this.entries.get(tabId);
    return Boolean(entry && (entry.messages.length || entry.sending || entry.waiting || entry.error));
  }

  enqueue(target: IInputTarget, message: IQueuedInput) {
    if (this.canceled.get(target.tabId)?.has(message.id)) return;
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
    if (!entry.messages.some((item) => item.id === id)) return;
    const canceled = this.canceled.get(tabId) ?? new Set<string>();
    canceled.add(id);
    this.canceled.set(tabId, canceled);
    entry.messages = entry.messages.filter((item) => item.id !== id);
    if (entry.attempt?.id === id) {
      entry.attempt = undefined;
      // Canceling a partial send does not clear the terminal's editable draft.
      if (entry.error) entry.error = 'sendFailed';
    }
    if (!entry.messages.length && !entry.sending) this.entries.delete(tabId);
  }

  async sendImmediately(target: IInputTarget, message: IQueuedInput) {
    const status = this.status(target.tabId);
    if (!status || status.workspaceId !== target.workspaceId
      || status.agentSessionId !== target.agentSessionId
      || (status.agentProviderId && status.agentProviderId !== target.provider)
      || status.cliState === 'inactive' || status.cliState === 'unknown') {
      throw new Error('Session changed or unavailable');
    }
    let entry = this.entries.get(target.tabId);
    if (entry?.sending) throw new Error('Input is already being sent');
    if (!entry) {
      entry = { target, messages: [], sending: false, error: null };
      this.entries.set(target.tabId, entry);
    }
    entry.sending = true;
    try {
      await this.deliver(target, message, status.cliState === 'busy');
      entry.waiting = { seq: status.eventSeq ?? 0, sawBusy: status.cliState === 'busy' };
    } catch (error) {
      entry.error = 'sendFailed';
      throw error;
    } finally {
      entry.sending = false;
    }
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
    if (!immediately && entry.error === 'deliveryUnconfirmed' && entry.attempt && this.checkReceipt
      && Date.now() >= (entry.nextReceiptCheckAt ?? 0)) {
      entry.sending = true;
      entry.nextReceiptCheckAt = Date.now() + 5000;
      try {
        const result = await this.checkReceipt(entry.target, entry.messages[0], entry.attempt.at);
        if (result.received) {
          entry.messages.shift();
          entry.error = null;
          entry.waiting = result.completed ? undefined : { seq: status.eventSeq ?? 0, sawBusy: status.cliState === 'busy' };
        }
      } catch (error) {
        if (error instanceof InputDeliveryError) entry.error = error.code;
      } finally {
        entry.sending = false;
      }
      return;
    }
    if (status.cliState === 'inactive' || status.cliState === 'unknown') return;
    if (!immediately && (entry.error || entry.waiting || !isIdle(status.cliState))) return;

    entry.sending = true;
    entry.error = null;
    const message = entry.messages[0];
    try {
      if (entry.attempt?.id !== message.id) entry.attempt = { id: message.id, at: Date.now() };
      const attempts = this.attempts.get(tabId) ?? new Map<string, number>();
      attempts.set(message.id, entry.attempt.at);
      this.attempts.set(tabId, attempts);
      const result = await this.deliver(entry.target, message, immediately && status.cliState === 'busy',
        entry.target.provider === 'codex' ? entry.attempt.at : undefined);
      entry.messages = entry.messages.filter((item) => item.id !== message.id);
      entry.waiting = result?.completed ? undefined : { seq: status.eventSeq ?? 0, sawBusy: status.cliState === 'busy' };
    } catch (error) {
      // A partial terminal write cannot safely be retried automatically.
      entry.error = error instanceof InputDeliveryError ? error.code : 'sendFailed';
      entry.nextReceiptCheckAt = Date.now() + 5000;
    } finally {
      entry.sending = false;
    }
  }

  async tick() {
    for (const tabId of this.attempts.keys()) {
      if (!this.status(tabId)) this.attempts.delete(tabId);
    }
    for (const tabId of this.canceled.keys()) {
      if (!this.status(tabId)) this.canceled.delete(tabId);
    }
    await Promise.all([...this.entries.keys()].map((tabId) => this.flush(tabId)));
  }
}
