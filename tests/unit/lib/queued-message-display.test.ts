// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import UserMessageItem from '@/components/features/timeline/user-message-item';
import type { ITimelineUserMessage } from '@/types/timeline';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

it('keeps the optimistic message and explicit status visible until receipt confirmation', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const container = document.createElement('div');
  const root = createRoot(container);
  const message = { id: 'q', text: 'visible immediately', attachments: [] };
  const entry: ITimelineUserMessage = { id: 'input-q', type: 'user-message', text: message.text, timestamp: Date.now(),
    pending: true, queueMessage: message, deliveryState: 'sending' };
  try {
    await act(async () => root.render(createElement(UserMessageItem, { entry })));
    expect(container.textContent).toContain(message.text);
    expect(container.querySelector('[role="status"]')?.textContent).toBe('inputSending');
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(new Date(entry.timestamp).toISOString());
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(container.querySelector('.opacity-50')).toBeNull();
    await act(async () => root.render(createElement(UserMessageItem, { entry: { ...entry, deliveryState: 'unconfirmed' } })));
    expect(container.querySelector('[role="status"]')?.textContent).toBe('inputUnconfirmed');
    await act(async () => root.render(createElement(UserMessageItem, { entry: { ...entry, pending: false } })));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')?.textContent).toBe(message.text);
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe(new Date(entry.timestamp).toISOString());
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
