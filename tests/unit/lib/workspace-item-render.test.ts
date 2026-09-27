import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import WorkspaceItem from '@/components/features/workspace/workspace-item';

describe('workspace settings component imports', () => {
  it.each([true, false, undefined])('renders the automatic expansion state %s', (childrenExpanded) => {
    const html = renderToString(createElement(WorkspaceItem, {
      workspace: { id: 'parent', name: 'Parent', directories: [] },
      isActive: false,
      isDeleting: false,
      showShortcut: false,
      childrenExpanded,
      tabs: [],
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    }));
    if (childrenExpanded === undefined) {
      expect(html).not.toContain('aria-expanded=');
      expect(html).toContain('lucide-folder');
    } else {
      expect(html).toContain(`aria-expanded="${childrenExpanded}"`);
      expect(html).toContain(childrenExpanded ? 'lucide-chevron-down' : 'lucide-chevron-right');
    }
  });

  it('renders the workspace and its settings button without undefined components', () => {
    const html = renderToString(createElement(WorkspaceItem, {
      workspace: { id: 'ws-render-test', name: 'Render test', directories: ['/tmp/project'] },
      isActive: true,
      isDeleting: false,
      showShortcut: false,
      tabs: [],
      onSelect: vi.fn(),
      onRename: vi.fn(),
      onDelete: vi.fn(),
    }));
    expect(html).toContain('Render test');
    expect(html).toContain('aria-label="settings: Render test"');
  });
});
