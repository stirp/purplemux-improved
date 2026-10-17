import { useCallback } from 'react';

export const containTouchScroll = (root: HTMLElement) => {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view || view.CSS?.supports?.('overscroll-behavior', 'contain')) return;

  let previous: Touch | undefined;
  const reset = () => { previous = undefined; };
  const start = (event: TouchEvent) => {
    previous = event.touches.length === 1 && event.target instanceof Node && root.contains(event.target)
      ? event.touches[0] : undefined;
  };
  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!previous || event.touches.length !== 1 || touch.identifier !== previous.identifier) {
      reset();
      return;
    }
    const dx = touch.clientX - previous.clientX;
    const dy = touch.clientY - previous.clientY;
    previous = touch;
    if (event.defaultPrevented || !event.cancelable || !dy || Math.abs(dx) >= Math.abs(dy)
      || (view.visualViewport && view.visualViewport.scale !== 1)) return;

    let node = event.target instanceof Element ? event.target : null;
    if (!node || !root.contains(node)) return;
    while (node) {
      const { overflowY } = view.getComputedStyle(node);
      if (/^(auto|scroll)$/.test(overflowY) && node.scrollHeight > node.clientHeight) {
        const remaining = node.scrollHeight - node.clientHeight - node.scrollTop;
        if ((dy > 0 && node.scrollTop > 0) || (dy < 0 && remaining > 1)) return;
      }
      if (node === root) break;
      node = node.parentElement;
    }
    // iOS 15 ignores overscroll-behavior; cancel only gestures with no scrollable destination.
    event.preventDefault();
  };

  // React drag handlers stop capture propagation at the app root before it reaches the sidebar.
  doc.addEventListener('touchstart', start, { passive: true, capture: true });
  root.addEventListener('touchmove', move, { passive: false });
  doc.addEventListener('touchend', reset, true);
  doc.addEventListener('touchcancel', reset, true);
  return () => {
    doc.removeEventListener('touchstart', start, true);
    root.removeEventListener('touchmove', move);
    doc.removeEventListener('touchend', reset, true);
    doc.removeEventListener('touchcancel', reset, true);
  };
};

const useContainedTouchScroll = () => useCallback((node: HTMLElement | null) => {
  if (node) return containTouchScroll(node);
}, []);

export default useContainedTouchScroll;
