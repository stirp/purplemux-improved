// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useHeaderSpace from '@/hooks/use-header-space';

let root: Root;
let host: HTMLDivElement;
let contentWidth: number;
let resourcesWidth: number;
let actionsWidth: number;
const observers = new Set<{ callback: () => void; elements: Set<Element> }>();

const Fixture = ({ ready = true }: { ready?: boolean }) => {
  const { containerRef, headerRef, hasHeaderSpace } = useHeaderSpace();
  if (!ready) return null;
  const toolbar = createElement('div', { ref: headerRef },
    createElement('div', { 'data-width': 'resources' }),
    createElement('div', { 'data-width': 'actions' }));
  return createElement('div', { ref: containerRef, 'data-merged': hasHeaderSpace },
    !hasHeaderSpace && toolbar,
    createElement('div', { 'data-tabs': true }, hasHeaderSpace && toolbar));
};

const resize = async () => {
  await act(async () => [...observers].forEach((observer) => observer.callback()));
};
const isMerged = () => host.firstElementChild?.getAttribute('data-merged') === 'true';

beforeEach(() => {
  contentWidth = 400;
  resourcesWidth = 240;
  actionsWidth = 140;
  document.documentElement.style.fontSize = '16px';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    elements = new Set<Element>();
    constructor(public callback: () => void) { observers.add(this); }
    observe(element: Element) { this.elements.add(element); }
    disconnect() { observers.delete(this); }
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => contentWidth);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { width: this.dataset.width === 'resources' ? resourcesWidth : actionsWidth } as DOMRect;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(observers.size).toBe(0);
  host.remove();
  document.documentElement.style.fontSize = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('falls back for 400/480px sidebars in an 800px window and merges when content grows', async () => {
  await act(async () => root.render(createElement(Fixture)));
  expect(isMerged()).toBe(false);
  contentWidth = 320;
  await resize();
  expect(isMerged()).toBe(false);
  contentWidth = 800;
  await resize();
  expect(isMerged()).toBe(true);
  contentWidth = 400;
  await resize();
  expect(isMerged()).toBe(false);
});

it('keeps a stable boundary while moving the toolbar between layouts', async () => {
  contentWidth = 611;
  await act(async () => root.render(createElement(Fixture)));
  expect(isMerged()).toBe(false);
  contentWidth = 612;
  await resize();
  expect(isMerged()).toBe(true);
  for (let i = 0; i < 3; i++) await resize();
  expect(isMerged()).toBe(true);
  expect(observers.size).toBe(1);
  expect([...observers][0].elements.size).toBe(3);
});

it('reevaluates resource settings and wider Git indicators without a window resize', async () => {
  contentWidth = 600;
  await act(async () => root.render(createElement(Fixture)));
  expect(isMerged()).toBe(false);
  resourcesWidth = 0;
  await resize();
  expect(isMerged()).toBe(true);
  resourcesWidth = 240;
  await resize();
  expect(isMerged()).toBe(false);
  contentWidth = 650;
  await resize();
  expect(isMerged()).toBe(true);
  actionsWidth = 200;
  await resize();
  expect(isMerged()).toBe(false);
});

it('measures content mounted after loading and disconnects stale observers', async () => {
  await act(async () => root.render(createElement(Fixture, { ready: false })));
  expect(observers.size).toBe(0);
  contentWidth = 800;
  await act(async () => root.render(createElement(Fixture)));
  expect(isMerged()).toBe(true);
  await act(async () => root.render(createElement(Fixture, { ready: false })));
  expect(observers.size).toBe(0);
  contentWidth = 400;
  await act(async () => root.render(createElement(Fixture)));
  expect(isMerged()).toBe(false);
});
