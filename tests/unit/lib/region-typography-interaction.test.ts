// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import RegionTypographySettings from '@/components/features/settings/region-typography-settings';
import useConfigStore from '@/hooks/use-config-store';
import useCustomStyle from '@/hooks/use-custom-style';

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), translate: (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('sonner', () => ({ toast: mocks }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useConfigStore.getState().hydrate({});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const edit = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('region typography interactions', () => {
  it('keeps invalid color text and removes the misleading picker until corrected', async () => {
    await act(async () => root.render(createElement(RegionTypographySettings)));
    const input = container.querySelector<HTMLInputElement>('#typography-color-sidebar')!;
    expect(container.querySelectorAll('[type="color"]')).toHaveLength(5);
    await edit(input, 'red');
    expect(input.value).toBe('red');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelectorAll('[type="color"]')).toHaveLength(4);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    const apply = [...container.querySelectorAll('button')].find((button) => button.textContent === 'apply')!;
    expect(apply.disabled).toBe(true);
    await edit(input, '#123456');
    expect(container.querySelectorAll('[type="color"]')).toHaveLength(5);
    expect(container.querySelector<HTMLInputElement>('[type="color"]')!.value).toBe('#123456');
    expect(apply.disabled).toBe(false);
  });

  it('restoring then recreating the same region does not make the form dirty', async () => {
    useConfigStore.getState().hydrate({ regionTypography: { sidebar: { color: '#123456' }, tabs: { color: '#abcdef' } } });
    await act(async () => root.render(createElement(RegionTypographySettings)));
    const reset = [...container.querySelectorAll('button')].find((button) => button.textContent === 'reset')!;
    await act(async () => reset.click());
    await edit(container.querySelector('#typography-color-sidebar')!, '#123456');
    const apply = [...container.querySelectorAll('button')].find((button) => button.textContent === 'apply')!;
    expect(apply.disabled).toBe(true);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await act(async () => apply.click());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retains the draft and shows the server error when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Server rejected the color' }) })));
    await act(async () => root.render(createElement(RegionTypographySettings)));
    const input = container.querySelector<HTMLInputElement>('#typography-color-sidebar')!;
    await edit(input, '#123456');
    const apply = [...container.querySelectorAll('button')].find((button) => button.textContent === 'apply')!;
    await act(async () => apply.click());
    expect(mocks.error).toHaveBeenCalledWith('failed', { description: 'Server rejected the color' });
    expect(input.value).toBe('#123456');
    expect(apply.disabled).toBe(false);
    expect(useConfigStore.getState().regionTypography).toEqual({});
  });

  it('keeps a single style through strict mode, repeated updates, resets and unmounts', async () => {
    const Style = ({ css }: { css: string }) => { useCustomStyle('test-region-typography', css); return null; };
    for (const css of ['body{color:red}', 'body{color:blue}', 'body{color:green}']) {
      await act(async () => root.render(createElement(StrictMode, null, createElement(Style, { css }))));
      const styles = document.querySelectorAll('#test-region-typography');
      expect(styles).toHaveLength(1);
      expect(styles[0].textContent).toBe(css);
    }
    await act(async () => root.render(createElement(Style, { css: '' })));
    expect(document.querySelector('#test-region-typography')).toBeNull();
    await act(async () => root.render(createElement(Style, { css: 'body{color:red}' })));
    await act(async () => root.render(null));
    expect(document.querySelector('#test-region-typography')).toBeNull();
  });

  it('keeps region variables before user CSS even after reset and reapplication', async () => {
    const Styles = ({ css }: { css: string }) => {
      useCustomStyle('test-region', css, 'test-custom');
      useCustomStyle('test-custom', ':root{--region-tabs-font-size:18px}');
      return null;
    };
    for (const css of [':root{--region-tabs-font-size:20px}', '', ':root{--region-tabs-font-size:22px}']) {
      await act(async () => root.render(createElement(Styles, { css })));
      if (css) {
        const styles = [...document.head.querySelectorAll('style')].filter((style) => ['test-region', 'test-custom'].includes(style.id));
        expect(styles.map((style) => style.id)).toEqual(['test-region', 'test-custom']);
      }
    }
  });
});
