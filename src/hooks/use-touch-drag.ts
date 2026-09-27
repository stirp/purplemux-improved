import { useCallback, useEffect, useRef, type TouchEvent as ReactTouchEvent } from 'react';
import { flushSync } from 'react-dom';

// 터치 길게 누르기를 기존 HTML drag/drop 처리에 연결한다.
export const startTouchDrag = (source: HTMLElement, initial: Pick<Touch, 'identifier' | 'clientX' | 'clientY'>): (() => void) => {
  const doc = source.ownerDocument;
  let active = false;
  let target: Element | null = null;
  let accepted = false;
  let transfer: DataTransfer;
  let point = initial;
  let clickTimer: ReturnType<typeof setTimeout> | undefined;

  const dispatch = (node: Element, type: string) => {
    let allowed = true;
    flushSync(() => {
      allowed = node.dispatchEvent(new DragEvent(type, {
        bubbles: true, cancelable: true, dataTransfer: transfer,
        clientX: point.clientX, clientY: point.clientY,
      }));
    });
    return !allowed;
  };
  const suppress = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const removeClickGuard = () => {
    clearTimeout(clickTimer);
    doc.removeEventListener('click', suppress, true);
  };
  const suppressNativeDrag = (event: Event) => {
    if (active && event.isTrusted) suppress(event);
  };
  const cleanListeners = () => {
    clearTimeout(timer);
    doc.removeEventListener('touchmove', move, true);
    doc.removeEventListener('touchend', end, true);
    doc.removeEventListener('touchcancel', cancel, true);
    doc.removeEventListener('touchstart', extraTouch, true);
    doc.removeEventListener('contextmenu', suppress, true);
    doc.removeEventListener('dragstart', suppressNativeDrag, true);
  };
  const finish = (drop: boolean) => {
    cleanListeners();
    if (!active) return;
    if (drop && target && accepted) dispatch(target, 'drop');
    if (target) dispatch(target, 'dragleave');
    dispatch(source, 'dragend');
    active = false;
    doc.addEventListener('click', suppress, true);
    clickTimer = setTimeout(removeClickGuard, 400);
  };
  const cancel = () => finish(false);
  const extraTouch = (event: TouchEvent) => { if (event.touches.length !== 1) cancel(); };
  const move = (event: TouchEvent) => {
    const touch = Array.from(event.touches).find((item) => item.identifier === initial.identifier);
    if (!touch || event.touches.length !== 1) { cancel(); return; }
    point = touch;
    if (!active) {
      if (Math.hypot(point.clientX - initial.clientX, point.clientY - initial.clientY) > 8) cancel();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const next = doc.elementFromPoint(point.clientX, point.clientY);
    if (next !== target) {
      if (target) dispatch(target, 'dragleave');
      target = next;
      if (target) dispatch(target, 'dragenter');
    }
    accepted = target ? dispatch(target, 'dragover') : false;
  };
  const end = (event: TouchEvent) => {
    if (active) {
      event.preventDefault();
      event.stopPropagation();
    }
    finish(true);
  };
  const timer = setTimeout(() => {
    if (!source.isConnected) { cancel(); return; }
    transfer = new DataTransfer();
    active = true;
    doc.addEventListener('contextmenu', suppress, true);
    doc.addEventListener('dragstart', suppressNativeDrag, true);
    if (dispatch(source, 'dragstart')) cancel();
  }, 350);

  doc.addEventListener('touchmove', move, { passive: false, capture: true });
  doc.addEventListener('touchend', end, { passive: false, capture: true });
  doc.addEventListener('touchcancel', cancel, true);
  doc.addEventListener('touchstart', extraTouch, true);
  return () => { cancel(); removeClickGuard(); };
};

export default function useTouchDrag() {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return useCallback((event: ReactTouchEvent<HTMLElement>) => {
    cleanup.current?.();
    if (event.touches.length !== 1) return;
    const target = event.target as HTMLElement;
    const source = target.closest<HTMLElement>('[draggable="true"]');
    if (!source || !event.currentTarget.contains(source)) return;
    const control = target.closest('input, textarea, button, a, [contenteditable="true"]');
    if (control && control !== source) return;
    // ContextMenuTrigger의 별도 길게 누르기 타이머와 충돌하지 않도록 한다.
    event.stopPropagation();
    cleanup.current = startTouchDrag(source, event.touches[0]);
  }, []);
}
