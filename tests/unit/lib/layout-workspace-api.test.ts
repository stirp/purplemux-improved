import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ layout: vi.fn(), workspace: vi.fn(), active: vi.fn() }));
vi.mock('@/lib/layout-store', () => ({ getLayout: mocks.layout, patchLayout: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: mocks.workspace, getActiveWorkspaceId: mocks.active }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import handler from '@/pages/api/layout';

const call = async (workspace?: string) => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'GET', query: workspace ? { workspace } : {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

beforeEach(() => vi.resetAllMocks());

describe('layout workspace validation', () => {
  it('does not recreate layout or terminals for a deleted workspace', async () => {
    mocks.workspace.mockResolvedValue(null);
    expect((await call('ws-deleted')).status).toHaveBeenCalledWith(404);
    expect(mocks.layout).not.toHaveBeenCalled();
  });

  it('rejects a stale active workspace without creating a layout', async () => {
    mocks.active.mockResolvedValue('ws-deleted');
    mocks.workspace.mockResolvedValue(null);
    expect((await call()).status).toHaveBeenCalledWith(404);
    expect(mocks.layout).not.toHaveBeenCalled();
  });

  it('restores the layout for an existing workspace with its default directory', async () => {
    mocks.workspace.mockResolvedValue({ id: 'ws-one', directories: ['/repo'] });
    mocks.layout.mockResolvedValue({ root: {} });
    expect((await call('ws-one')).status).toHaveBeenCalledWith(200);
    expect(mocks.layout).toHaveBeenCalledWith('ws-one', '/repo');
  });
});
