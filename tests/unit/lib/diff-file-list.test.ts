// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DiffFileList from '@/components/features/workspace/diff-file-list';
import { openEditorTarget } from '@/lib/open-editor';

const settings = vi.hoisted(() => ({ mobile: false }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => settings.mobile }));
vi.mock('@/hooks/use-config-store', () => ({
  default: (selector: (state: unknown) => unknown) => selector({ editorPreset: 'vscode-remote', editorUrl: 'dev-box' }),
}));
vi.mock('@/lib/open-editor', () => ({ openEditorTarget: vi.fn() }));
vi.mock('@git-diff-view/react', () => ({
  DiffView: () => null, DiffModeEnum: { Unified: 1, Split: 2 }, getLang: () => 'text',
}));

const first = 'diff --git a/one/image.png b/one/image.png\nnew file mode 100644\nBinary files /dev/null and b/one/image.png differ\n';
const second = 'diff --git a/two/image.png b/two/image.png\nBinary files a/two/image.png and b/two/image.png differ\n';
const deleted = 'diff --git a/deleted.png b/deleted.png\ndeleted file mode 100644\nBinary files a/deleted.png and /dev/null differ\n';
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  settings.mobile = false;
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn());
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = async (diff = first + second + deleted, props: { repoRoot?: string; oldRef?: string; newRef?: string } = {}) => {
  await act(async () => root.render(createElement(DiffFileList, {
    diff, repoRoot: '/repo', sessionName: 'session', viewMode: 'split', ...props,
  })));
};

const toggles = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')];
const expanded = () => toggles().map((button) => button.getAttribute('aria-expanded'));

describe('binary diff file cards', () => {
  it.each([false, true])('keeps U+FEFF paths distinct for expansion and editor targets (mobile=%s)', async (mobile) => {
    settings.mobile = mobile;
    const withFeff = String.raw`diff --git "a/assets/\357\273\277image.png" "b/assets/\357\273\277image.png"
Binary files "a/assets/\357\273\277image.png" and "b/assets/\357\273\277image.png" differ
`;
    const withoutFeff = 'diff --git a/assets/image.png b/assets/image.png\nBinary files a/assets/image.png and b/assets/image.png differ\n';
    await render(withFeff + withoutFeff);
    await act(async () => toggles()[0].click());
    expect(expanded()).toEqual(['true', 'false']);
    expect(toggles().map((button) => button.textContent)).toEqual(['assets/\uFEFFimage.png', 'assets/image.png']);
    const editorButtons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    await act(async () => editorButtons[0].click());
    await act(async () => editorButtons[1].click());
    expect(vi.mocked(openEditorTarget).mock.calls).toEqual([
      ['vscode://vscode-remote/ssh-remote+dev-box/repo/assets/%EF%BB%BFimage.png:1'],
      ['vscode://vscode-remote/ssh-remote+dev-box/repo/assets/image.png:1'],
    ]);
    await render(withoutFeff + withFeff);
    expect(expanded()).toEqual(['false', 'true']);
    await act(async () => toggles()[1].click());
    expect(expanded()).toEqual(['false', 'false']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps file expansion independent after refresh and reordering (mobile=%s)', async (mobile) => {
    settings.mobile = mobile;
    await render();
    expect(toggles().map((button) => button.textContent)).toEqual(['one/image.pngNEW', 'two/image.png', 'deleted.pngDEL']);
    expect(expanded()).toEqual(['false', 'false', 'false']);
    await act(async () => toggles()[0].click());
    expect(expanded()).toEqual(['true', 'false', 'false']);
    expect(container.textContent?.match(/Binary file/g)).toHaveLength(1);
    await render();
    expect(expanded()).toEqual(['true', 'false', 'false']);
    await render(second + deleted + first);
    expect(expanded()).toEqual(['false', 'false', 'true']);
    await act(async () => toggles()[0].click());
    expect(expanded()).toEqual(['true', 'false', 'true']);
    await act(async () => toggles()[2].click());
    expect(expanded()).toEqual(['true', 'false', 'false']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ repoRoot: '/other' }, { oldRef: 'previous' }, { newRef: 'next' }])('isolates expansion across comparison context %j', async (props) => {
    await render();
    await act(async () => toggles()[0].click());
    await render(undefined, props);
    expect(expanded()).toEqual(['false', 'false', 'false']);
  });

  it('opens the restored binary path separately from expansion and hides the action for deletions', async () => {
    await render();
    const editorButtons = [...container.querySelectorAll<HTMLButtonElement>('button[aria-label]')];
    expect(editorButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'openEditor: one/image.png', 'openEditor: two/image.png',
    ]);
    await act(async () => editorButtons[1].click());
    expect(openEditorTarget).toHaveBeenCalledWith('vscode://vscode-remote/ssh-remote+dev-box/repo/two/image.png:1');
    expect(expanded()).toEqual(['false', 'false', 'false']);
    expect(fetch).not.toHaveBeenCalled();
  });
});
