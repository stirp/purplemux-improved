import { useSyncExternalStore, type CSSProperties } from 'react';

export const subscribeViewport = (onChange: () => void) => {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
};

export const getViewportSnapshot = () => {
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale !== 1) return '';
  return `${viewport.height}:${viewport.offsetTop}`;
};

const getServerSnapshot = () => '';

const useVisualViewport = (enabled: boolean): CSSProperties | undefined => {
  const snapshot = useSyncExternalStore(subscribeViewport, getViewportSnapshot, getServerSnapshot);
  if (!enabled || !snapshot) return undefined;
  const [height, top] = snapshot.split(':').map(Number);
  return { position: 'fixed', left: 0, right: 0, top, height };
};

export default useVisualViewport;
