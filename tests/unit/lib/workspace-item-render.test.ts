import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import WorkspaceItem from '@/components/features/workspace/workspace-item';

describe('workspace settings component imports', () => {
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
