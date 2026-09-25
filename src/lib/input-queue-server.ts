import { InputQueue } from '@/lib/input-queue';
import { getStatusManager } from '@/lib/status-manager';
import { capturePaneContent, hasSession, sendRawKeys } from '@/lib/tmux';
import { countImageRefs, waitForImageAttachments } from '@/lib/image-attach-detector';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const escapePath = (path: string) => path.replace(/[ \t\\'"(){}[\]!#$&;`|*?<>~^%]/g, '\\$&');
const globalQueue = globalThis as unknown as { __purplemuxInputQueue?: InputQueue };

export const getInputQueue = (): InputQueue => {
  if (globalQueue.__purplemuxInputQueue) return globalQueue.__purplemuxInputQueue;
  const queue = new InputQueue(
    (tabId) => getStatusManager().getAllForClient()[tabId],
    async (target, message, immediately) => {
      const { sessionName, provider } = target;
      if (!await hasSession(sessionName)) throw new Error('Session not found');
      const paste = (text: string) => sendRawKeys(sessionName, `\x1b[200~${text}\x1b[201~`);
      const capture = async () => (await capturePaneContent(sessionName)) ?? '';
      let baselineRefs = provider === 'claude' && message.attachments.length
        ? countImageRefs(await capture()) : 0;
      for (const attachment of message.attachments) {
        await paste(escapePath(attachment.path));
        if (provider === 'claude') {
          const result = await waitForImageAttachments({ capture, expectedNewRefs: 1, baselineRefs });
          if (!result.confirmed) throw new Error('Attachment not confirmed');
          baselineRefs = result.finalCount;
        } else {
          await delay(400);
        }
      }
      if (message.text) await paste(`${message.attachments.length ? ' ' : ''}${message.text}`);
      await delay(250);
      if (immediately && provider === 'claude') {
        // chat:sendNow works without extended terminal key reporting.
        await sendRawKeys(sessionName, 'C-x');
        await sendRawKeys(sessionName, 'C-s');
      } else {
        await sendRawKeys(sessionName, 'Enter');
      }
    },
  );
  globalQueue.__purplemuxInputQueue = queue;
  const timer = setInterval(() => { void queue.tick(); }, 500);
  timer.unref();
  return queue;
};
