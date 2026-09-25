import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAttachmentDraft, saveAttachmentDraft } from '@/lib/attachment-draft';

afterEach(() => vi.unstubAllGlobals());
describe('attachment drafts', () => {
  it('restores uploaded thumbnails per tab and clears sent or removed attachments', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
    const attachment = { id: '1', path: '/uploads/image.png', filename: 'image.png', thumbnail: '/api/uploads/ws/tab/image.png' };
    saveAttachmentDraft('tab1', [attachment]);
    expect(loadAttachmentDraft('tab1')).toEqual([attachment]);
    expect(loadAttachmentDraft('tab2')).toEqual([]);
    saveAttachmentDraft('tab1', []);
    expect(loadAttachmentDraft('tab1')).toEqual([]);
    saveAttachmentDraft('tab1', [{ ...attachment, thumbnail: 'blob:expired' }]);
    expect(loadAttachmentDraft('tab1')).toEqual([]);
  });
  it('handles corrupt or inaccessible browser storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad' });
    expect(loadAttachmentDraft('tab')).toEqual([]);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error(); } });
    expect(loadAttachmentDraft('tab')).toEqual([]);
    expect(() => saveAttachmentDraft('tab', [])).not.toThrow();
  });
});
