import { afterEach, describe, expect, it, vi } from 'vitest';
import { getViewportSnapshot, subscribeViewport } from '@/hooks/use-visual-viewport';

afterEach(() => vi.unstubAllGlobals());

describe('visual viewport', () => {
  it('tracks keyboard opening, viewport panning and keyboard dismissal', () => {
    const viewport = Object.assign(new EventTarget(), { height: 900, offsetTop: 0, scale: 1 });
    vi.stubGlobal('window', { visualViewport: viewport });
    const snapshots: string[] = [];
    const unsubscribe = subscribeViewport(() => snapshots.push(getViewportSnapshot()));
    expect(getViewportSnapshot()).toBe('900:0');
    viewport.height = 360;
    viewport.dispatchEvent(new Event('resize'));
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event('scroll'));
    viewport.height = 900;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('resize'));
    expect(snapshots).toEqual(['360:0', '360:120', '900:0']);
    unsubscribe();
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    expect(snapshots).toHaveLength(3);
  });

  it('preserves the CSS fallback when VisualViewport is unavailable', () => {
    vi.stubGlobal('window', {});
    expect(getViewportSnapshot()).toBe('');
    expect(() => subscribeViewport(vi.fn())()).not.toThrow();
  });

  it('does not resize the application to a pinch-zoomed viewport', () => {
    vi.stubGlobal('window', { visualViewport: { height: 300, offsetTop: 80, scale: 2 } });
    expect(getViewportSnapshot()).toBe('');
  });
});
