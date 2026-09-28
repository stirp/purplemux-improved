import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { useSWR } = vi.hoisted(() => ({ useSWR: vi.fn() }));
vi.mock('swr', () => ({ default: useSWR }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import WorkspaceDeliveryButton from '@/components/features/workspace/workspace-delivery-button';

describe('workspace delivery entry', () => {
  it.each([
    ['modified', 'ws-current', false, true],
    ['staged', 'ws-current', false, true],
    ['untracked', 'ws-current', false, true],
    ['conflicts', 'ws-current', false, true],
    ['ahead', 'ws-current', false, true],
    ['behind', 'ws-current', false, true],
    ['ignored', 'ws-current', false, false],
    ['modified', 'ws-other', false, false],
    ['modified', 'ws-current', true, false],
    ['clean', 'ws-current', false, false],
  ])('handles %s in %s (missing=%s)', (field, workspaceId, missing, visible) => {
    useSWR.mockReturnValue({
      data: { repositories: [{ id: 'repo', worktrees: [{
        directory: '/repo', head: 'head', branch: 'feature', missing,
        workspaces: [{ id: workspaceId }],
        status: { modified: 0, staged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0, [field as string]: 1 },
      }] }] },
      mutate: vi.fn(),
    });
    const html = renderToString(createElement(WorkspaceDeliveryButton, { workspaceId: 'ws-current' }));
    expect(html.includes('aria-label="deliveryTitle"')).toBe(visible);
  });

  it('does not show an entry before status is available', () => {
    useSWR.mockReturnValue({ data: undefined, mutate: vi.fn() });
    const html = renderToString(createElement(WorkspaceDeliveryButton, { workspaceId: 'ws-current' }));
    expect(html).not.toContain('<button');
  });
});
