// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useContainedTouchScroll, { containTouchScroll } from '@/hooks/use-contained-touch-scroll';
import useTouchDrag from '@/hooks/use-touch-drag';

const point = (clientY: number, clientX = 20, identifier = 1) => ({ clientY, clientX, identifier }) as Touch;
const send = (target: Element, type: string, touches: Touch[]) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: touches });
  target.dispatchEvent(event);
  return event.defaultPrevented;
};
const size = (node: HTMLElement, height: number, content: number) => {
  Object.defineProperties(node, {
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, value: content },
  });
};

let root: HTMLDivElement;
let list: HTMLDivElement;
let item: HTMLButtonElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  vi.stubGlobal('CSS', { supports: () => false });
  root = document.createElement('div');
  list = document.createElement('div');
  item = document.createElement('button');
  list.style.overflowY = 'auto';
  list.append(item);
  root.append(list);
  document.body.append(root);
  size(list, 200, 600);
  cleanup = containTouchScroll(root);
});

afterEach(() => {
  cleanup?.();
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const DragSidebar = () => {
  const ref = useContainedTouchScroll();
  const onTouchStartCapture = useTouchDrag();
  return createElement('aside', { ref },
    createElement('div', { style: { overflowY: 'auto' } },
      createElement('div', { onTouchStartCapture },
        createElement('button', { draggable: true, 'data-touch-context-menu': true }, 'Workspace'))));
};

describe('legacy sidebar touch containment', () => {
  it.each([[0, 120, true], [150, 120, false], [150, 80, false], [400, 80, true]])(
    'coexists with React drag capture at scrollTop=%s and finger y=%s', async (top, y, blocked) => {
      vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
      cleanup?.();
      const reactRoot = createRoot(root);
      try {
        await act(async () => reactRoot.render(createElement(DragSidebar)));
        const scroller = root.querySelector('aside > div') as HTMLElement;
        const row = root.querySelector('button')!;
        size(scroller, 200, 600);
        scroller.scrollTop = top;
        const nativeStart = vi.fn();
        row.addEventListener('touchstart', nativeStart);
        send(row, 'touchstart', [point(100)]);
        expect(nativeStart).not.toHaveBeenCalled();
        expect(send(row, 'touchmove', [point(y)])).toBe(blocked);
        expect(scroller.scrollTop).toBe(top);
      } finally {
        await act(async () => reactRoot.unmount());
      }
    },
  );

  it('preserves the real drag hook long-press menu and clears capture state after unmount', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    cleanup?.();
    const reactRoot = createRoot(root);
    let row: HTMLButtonElement | undefined;
    try {
      await act(async () => reactRoot.render(createElement(DragSidebar)));
      row = root.querySelector('button')!;
      const menu = vi.fn();
      row.addEventListener('contextmenu', menu);
      send(row, 'touchstart', [point(100)]);
      await act(async () => vi.advanceTimersByTime(650));
      expect(menu).toHaveBeenCalledOnce();
      expect(send(row, 'touchmove', [point(120)])).toBe(true);
      send(row, 'touchend', []);
    } finally {
      await act(async () => reactRoot.unmount());
    }
    root.append(row!);
    send(row!, 'touchstart', [point(100)]);
    expect(send(row!, 'touchmove', [point(120)])).toBe(false);
  });

  it.each([
    [0, 120, true], [0, 80, false],
    [150, 120, false], [150, 80, false],
    [400, 80, true], [400, 120, false],
    [-5, 120, true], [405, 80, true],
  ])('handles scrollTop=%s and finger y=%s without reversing native scrolling', (top, y, blocked) => {
    list.scrollTop = top;
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(y)])).toBe(blocked);
    expect(list.scrollTop).toBe(top);
  });

  it('blocks both directions for short lists and fixed sidebar chrome', () => {
    size(list, 200, 200);
    for (const target of [item, root]) {
      send(target, 'touchstart', [point(100)]);
      expect(send(target, 'touchmove', [point(120)])).toBe(true);
      expect(send(target, 'touchmove', [point(80)])).toBe(true);
    }
  });

  it('allows reversing away from a boundary during the same gesture', () => {
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(true);
    expect(send(item, 'touchmove', [point(110)])).toBe(false);
  });

  it('allows a nested scroll area, then its scrollable parent', () => {
    const nested = document.createElement('div');
    nested.style.overflowY = 'scroll';
    list.append(nested);
    nested.append(item);
    size(nested, 100, 300);
    nested.scrollTop = 50;
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(false);
    nested.scrollTop = 0;
    list.scrollTop = 100;
    expect(send(item, 'touchmove', [point(140)])).toBe(false);
    list.scrollTop = 0;
    expect(send(item, 'touchmove', [point(160)])).toBe(true);
  });

  it('does not treat overflow-hidden content as a native scroll destination', () => {
    list.style.overflowY = 'hidden';
    list.scrollTop = 50;
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(true);
  });

  it('preserves horizontal gestures and zoomed viewport panning', () => {
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(101, 80)])).toBe(false);
    vi.stubGlobal('visualViewport', { scale: 2 });
    expect(send(item, 'touchmove', [point(140, 80)])).toBe(false);
  });

  it('abandons multi-touch sequences until the next touchstart', () => {
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120), point(120, 40, 2)])).toBe(false);
    expect(send(item, 'touchmove', [point(140)])).toBe(false);
  });

  it.each(['touchend', 'touchcancel'])('clears tracking on %s', (type) => {
    send(item, 'touchstart', [point(100)]);
    send(item, type, []);
    expect(send(item, 'touchmove', [point(120)])).toBe(false);
  });

  it('preserves click, long-press propagation, outside events and cleanup', () => {
    const listener = vi.fn();
    item.addEventListener('click', listener);
    root.addEventListener('touchmove', listener);
    expect(send(item, 'touchstart', [point(100)])).toBe(false);
    item.click();
    expect(send(item, 'touchmove', [point(120)])).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(send(document.body, 'touchmove', [point(140)])).toBe(false);
    cleanup?.();
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(false);
  });

  it('uses native CSS on browsers supporting overscroll containment', () => {
    cleanup?.();
    vi.stubGlobal('CSS', { supports: () => true });
    cleanup = containTouchScroll(root);
    send(item, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(false);
  });

  it('does not track gestures starting outside the sidebar or in a portal', () => {
    send(item, 'touchstart', [point(100)]);
    send(document.body, 'touchstart', [point(100)]);
    expect(send(item, 'touchmove', [point(120)])).toBe(false);
  });

  it.each(['touchend', 'touchcancel'])('clears tracking before React stops %s propagation', async (type) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    cleanup?.();
    const Component = () => createElement('aside', { ref: useContainedTouchScroll(),
      [type === 'touchend' ? 'onTouchEndCapture' : 'onTouchCancelCapture']:
        (event: Event) => event.stopPropagation(),
    }, createElement('button'));
    const reactRoot = createRoot(root);
    try {
      await act(async () => reactRoot.render(createElement(Component)));
      const row = root.querySelector('button')!;
      send(row, 'touchstart', [point(100)]);
      send(row, type, []);
      expect(send(row, 'touchmove', [point(120)])).toBe(false);
    } finally {
      await act(async () => reactRoot.unmount());
    }
  });

  it('attaches and cleans up through the React ref lifecycle', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const Component = () => createElement('div', { ref: useContainedTouchScroll() });
    const reactRoot = createRoot(root);
    cleanup?.();
    await act(async () => reactRoot.render(createElement(Component)));
    const element = root.firstElementChild!;
    send(element, 'touchstart', [point(100)]);
    expect(send(element, 'touchmove', [point(120)])).toBe(true);
    await act(async () => reactRoot.unmount());
    send(element, 'touchstart', [point(100)]);
    expect(send(element, 'touchmove', [point(120)])).toBe(false);
  });
});
