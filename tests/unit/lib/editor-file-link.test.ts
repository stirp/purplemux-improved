import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import { EditorCwdContext } from '@/components/features/timeline/editor-file-link';
import DiffFileList from '@/components/features/workspace/diff-file-list';

const settings = vi.hoisted(() => ({ mobile: false, device: false, editorPreset: 'vscode-remote' }));
vi.mock('@/hooks/use-config-store', () => ({
  default: (selector: (state: unknown) => unknown) => selector({ editorPreset: settings.editorPreset, editorUrl: 'dev-box' }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => settings.mobile }));
vi.mock('@/hooks/use-is-mobile-device', () => ({ default: () => settings.device }));
vi.mock('@git-diff-view/react', () => ({
  DiffView: () => null,
  DiffModeEnum: { Unified: 1, Split: 2 },
  getLang: () => 'text',
}));

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => Object.assign(settings, { mobile: false, device: false, editorPreset: 'vscode-remote' }));

describe('assistant markdown editor links', () => {
  it.each(['mobile', 'device', 'disabled-editor'])('uses browser links for %s', (mode) => {
    settings.mobile = mode === 'mobile';
    settings.device = mode === 'device';
    if (mode === 'disabled-editor') settings.editorPreset = 'off';
    vi.stubGlobal('window', { location: { hostname: 'remote.example.com' } });
    const html = renderToStaticMarkup(createElement(EditorCwdContext.Provider, { value: '/repo/subdir' },
      createElement(AssistantMessageItem, { entry: {
        id: 'message', type: 'assistant-message', timestamp: 0,
        markdown: '[relative](../app.ts:12:3) [file](file:///repo/%E4%B8%AD%20%23.md) [web](https://example.com)',
      } }),
    ));
    expect(html).toContain('href="/api/session-files/repo/app.ts?view=1#L12" target="_blank"');
    expect(html).toContain('href="/api/session-files/repo/%E4%B8%AD%20%23.md?view=1"');
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain('href="vscode:');
  });

  it('renders remote file links with session paths and retains ordinary web links', () => {
    vi.stubGlobal('window', { location: { hostname: 'remote.example.com' } });
    const html = renderToStaticMarkup(createElement(EditorCwdContext.Provider, { value: '/repo/subdir' },
      createElement(AssistantMessageItem, { entry: {
        id: 'message', type: 'assistant-message', timestamp: 0,
        markdown: '[relative](../app.ts:12:3) [absolute](/repo/a.ts#L5) [file](file:///repo/a%20b.ts) [web](https://example.com/a.ts) [unsafe](javascript:alert%281%29)',
      } }),
    ));
    expect(html).toContain('href="vscode://vscode-remote/ssh-remote+dev-box/repo/app.ts:12:3"');
    expect(html).toContain('href="vscode://vscode-remote/ssh-remote+dev-box/repo/a.ts:5"');
    expect(html).toContain('href="vscode://vscode-remote/ssh-remote+dev-box/repo/a%20b.ts:1"');
    expect(html).toContain('href="https://example.com/a.ts"');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('node="');
  });
});

describe('Changes editor buttons', () => {
  it('offers a separate editor action for changed files but not deleted files', () => {
    vi.stubGlobal('window', { location: { hostname: 'remote.example.com' } });
    const html = renderToStaticMarkup(createElement(DiffFileList, {
      repoRoot: '/repo', sessionName: 'session', viewMode: 'unified',
      diff: 'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new\n'
        + 'diff --git a/deleted.ts b/deleted.ts\ndeleted file mode 100644\n--- a/deleted.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n',
    }));
    expect(html).toContain('aria-label="openEditor: src/app.ts"');
    expect(html).not.toContain('aria-label="openEditor: deleted.ts"');
    expect(html.match(/aria-label="openEditor:/g)).toHaveLength(1);
  });
});
