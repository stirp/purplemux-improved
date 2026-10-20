import type { IQueuedInput } from '@/lib/input-queue';
import type { ITimelineUserMessage } from '@/types/timeline';

const normalize = (text: string) => text.replace(/\r\n/g, '\n').trim();
export const escapeInputAttachmentPath = (path: string) => path.replace(/[ \t\\'"(){}[\]!#$&;`|*?<>~^%]/g, '\\$&');

export const inputAttachmentImageUrl = (path: string): string | undefined => {
  const suffix = path.replace(/\\/g, '/').split('/uploads/')[1];
  if (!suffix || !/\.(?:png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(suffix)) return undefined;
  return `/api/uploads/${suffix.split('/').map(encodeURIComponent).join('/')}`;
};

export const matchesInputMessage = (entry: ITimelineUserMessage, message: IQueuedInput, since: number | undefined): boolean => {
  if (since === undefined || !Number.isFinite(since) || entry.pending || entry.timestamp < since) return false;
  const text = normalize(entry.text);
  const unusedImages = (entry.images ?? []).map((url, index) => ({ url, hash: entry.imageHashes?.[index] }));
  const remaining = message.attachments.filter(({ path, imageHash }) => {
    const image = inputAttachmentImageUrl(path);
    const index = unusedImages.findIndex(({ url, hash }) => url === image || (!!imageHash && hash === imageHash));
    if (index === -1) return true;
    unusedImages.splice(index, 1);
    return false;
  });
  if (unusedImages.length) return false;
  const candidates = [text];
  const imageCount = entry.images?.filter((url) => url.startsWith('/api/uploads/')).length ?? 0;
  let withoutMarkers = text;
  for (let index = 1; index <= imageCount; index++) {
    const marker = `[Image #${index}]`;
    if (!withoutMarkers.startsWith(marker)) break;
    withoutMarkers = withoutMarkers.slice(marker.length).trimStart();
    if (index === imageCount) candidates.push(normalize(withoutMarkers));
  }
  if (!remaining.length) return candidates.includes(normalize(message.text));
  // Non-image files remain literal paths in the CLI's user message.
  return [false, true].some((escaped) => ['', ' '].some((separator) => {
    const paths = remaining.map(({ path }) => escaped ? escapeInputAttachmentPath(path) : path).join(separator);
    return candidates.includes(normalize(`${paths}${message.text ? ` ${message.text}` : ''}`));
  }));
};
