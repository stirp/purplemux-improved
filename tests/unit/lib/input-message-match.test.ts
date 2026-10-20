import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { parseJsonlContent } from '@/lib/session-parser';
import { matchesInputMessage } from '@/lib/input-message-match';
import { parseCodexContent } from '@/lib/session-parser-codex';
import { UPLOADS_DIR } from '@/lib/uploads-store';
import path from 'path';

describe('Codex native image markers', () => {
  it.each([
    ['describe this', '[Image #1] describe this', 1],
    ['', '[Image #1]', 1],
    ['compare', '[Image #1]\n[Image #2] compare', 2],
    ['[Image #1] is a literal label', '[Image #1] [Image #1] is a literal label', 1],
  ] as const)('matches verified attachments and original text: %s', (text, nativeText, count) => {
    const attachments = Array.from({ length: count }, (_, i) => ({ path: path.join(UPLOADS_DIR, 'ws', 'tab', `${i}.png`), filename: `${i}.png` }));
    const [entry] = parseCodexContent(JSON.stringify({ timestamp: new Date(2000).toISOString(), type: 'event_msg',
      payload: { type: 'user_message', message: nativeText, images: [], local_images: attachments.map(({ path }) => path) } }));
    if (entry.type !== 'user-message') throw new Error('Expected user message');
    expect(matchesInputMessage(entry, { id: 'q', text, attachments }, 1000)).toBe(true);
    expect(matchesInputMessage(entry, { id: 'q', text, attachments: attachments.map((item) => ({ ...item, path: item.path.replace('0.png', 'other.png') })) }, 1000)).toBe(false);
    expect(entry.text).toBe(nativeText);
  });

  it('does not strip markers from plain input, wrong numbering, or the middle of text', () => {
    const image = { path: path.join(UPLOADS_DIR, 'ws', 'tab', 'image.png'), filename: 'image.png' };
    const entry = { id: 'native', type: 'user-message' as const, timestamp: 2000, text: '[Image #1] hello' };
    expect(matchesInputMessage(entry, { id: 'q', text: 'hello', attachments: [] }, 1000)).toBe(false);
    expect(matchesInputMessage(entry, { id: 'q', text: entry.text, attachments: [] }, 1000)).toBe(true);
    for (const text of ['[Image #2] hello', 'hello [Image #1]']) {
      expect(matchesInputMessage({ ...entry, text, images: ['/api/uploads/ws/tab/image.png'] }, { id: 'q', text: 'hello', attachments: [image] }, 1000)).toBe(false);
    }
  });
});

describe('Claude image input receipts', () => {
  it('matches actual base64 parser output by decoded image identity and rejects different images', () => {
    const data = Buffer.from('uploaded image bytes');
    const [entry] = parseJsonlContent(JSON.stringify({
      type: 'user', uuid: 'native', timestamp: new Date(2000).toISOString(),
      message: { role: 'user', content: [{ type: 'text', text: 'picture' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: data.toString('base64') } }] },
    }));
    if (entry.type !== 'user-message') throw new Error('Expected native user message');
    const image = { path: '/home/test/.purplemux/uploads/ws/tab/image.png', filename: 'image.png',
      imageHash: createHash('sha256').update(data).digest('hex') };
    const message = { id: 'q', text: 'picture', attachments: [image] };
    expect(entry.images?.[0]).toMatch(/^data:image\/png;base64,/);
    expect(matchesInputMessage(entry, message, 1000)).toBe(true);
    expect(matchesInputMessage(entry, { ...message, attachments: [{ ...image, imageHash: 'different' }] }, 1000)).toBe(false);
    expect(matchesInputMessage(entry, { ...message, attachments: [image, image] }, 1000)).toBe(false);
  });
});
