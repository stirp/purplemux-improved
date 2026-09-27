import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTouchDrag } from '@/hooks/use-touch-drag';

class TestDragEvent extends Event {
  dataTransfer: unknown;
  clientX: number;
  clientY: number;
  constructor(type: string, options: DragEventInit) {
    super(type, options);
    this.dataTransfer = options.dataTransfer;
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
  }
}

const touch = (y: number) => ({ identifier: 1, clientX: 10, clientY: y }) as Touch;
const sendTouch = (doc: EventTarget, type: string, touches: Touch[]) => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'touches', { value: touches });
  doc.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('DragEvent', TestDragEvent);
  vi.stubGlobal('DataTransfer', class {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = () => {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { elementFromPoint: vi.fn(() => target) });
  const source = Object.assign(new EventTarget(), { ownerDocument: doc, isConnected: true });
  const events: string[] = [];
  for (const type of ['dragstart', 'dragend']) source.addEventListener(type, () => events.push(type));
  for (const type of ['dragenter', 'dragover', 'drop', 'dragleave']) {
    target.addEventListener(type, (event) => {
      events.push(type);
      if (type === 'dragover') event.preventDefault();
    });
  }
  const cleanup = startTouchDrag(source as unknown as HTMLElement, touch(50));
  return { doc, events, cleanup };
};

describe('touch drag', () => {
  it('leaves a normal swipe to native scrolling without dragging', () => {
    const { doc, events, cleanup } = setup();
    expect(sendTouch(doc, 'touchmove', [touch(70)]).defaultPrevented).toBe(false);
    vi.advanceTimersByTime(500);
    expect(events).toEqual([]);
    cleanup();
  });

  it('starts after a hold, prevents page scrolling, and drops through the existing handlers', () => {
    const { doc, events, cleanup } = setup();
    vi.advanceTimersByTime(350);
    expect(sendTouch(doc, 'touchmove', [touch(100)]).defaultPrevented).toBe(true);
    expect(doc.elementFromPoint).toHaveBeenCalledWith(10, 100);
    sendTouch(doc, 'touchend', []);
    expect(events).toEqual(['dragstart', 'dragenter', 'dragover', 'drop', 'dragleave', 'dragend']);
    const click = new Event('click', { cancelable: true });
    doc.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    cleanup();
  });

  it('cancels a drag without dropping when a second finger touches the screen', () => {
    const { doc, events, cleanup } = setup();
    vi.advanceTimersByTime(350);
    sendTouch(doc, 'touchmove', [touch(100)]);
    sendTouch(doc, 'touchstart', [touch(100), { ...touch(100), identifier: 2 } as Touch]);
    sendTouch(doc, 'touchend', []);
    expect(events).not.toContain('drop');
    expect(events.at(-1)).toBe('dragend');
    cleanup();
  });

  it('cleans up an active drag on unmount without committing a reorder', () => {
    const { doc, events, cleanup } = setup();
    vi.advanceTimersByTime(350);
    cleanup();
    expect(sendTouch(doc, 'touchmove', [touch(100)]).defaultPrevented).toBe(false);
    expect(events).toEqual(['dragstart', 'dragend']);
  });
});
