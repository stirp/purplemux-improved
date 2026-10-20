import { InputDeliveryError, InputQueue } from '@/lib/input-queue';
import { getStatusManager } from '@/lib/status-manager';
import { capturePaneContent, checkTerminalProcess, hasSession, pasteText, sendRawKeys } from '@/lib/tmux';
import { countImageRefs, waitForImageAttachments } from '@/lib/image-attach-detector';
import { createCodexInputReceipt } from '@/lib/codex-input-receipt';
import { isCodexTuiReadyContent } from '@/lib/codex-tui-ready-detector';
import { createLogger } from '@/lib/logger';
import { escapeInputAttachmentPath } from '@/lib/input-message-match';

const log = createLogger('input-queue');

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const globalQueue = globalThis as unknown as { __purplemuxInputQueue?: InputQueue };

export const getInputQueue = (): InputQueue => {
  if (globalQueue.__purplemuxInputQueue) return globalQueue.__purplemuxInputQueue;
  const queue = new InputQueue(
    (tabId) => getStatusManager().getAllForClient()[tabId],
    async (target, message, immediately, attemptedAt) => {
      const { sessionName, provider } = target;
      if (!await hasSession(sessionName)) throw new Error('Session not found');
      const paste = (text: string) => pasteText(sessionName, text);
      const capture = async () => (await capturePaneContent(sessionName)) ?? '';
      const receipt = provider === 'codex' && attemptedAt !== undefined
        ? createCodexInputReceipt(target, message, attemptedAt) : undefined;
      const context = { tabId: target.tabId, sessionId: target.agentSessionId, messageId: message.id };
      if (receipt) {
        const previous = await receipt();
        if (previous.received) return { completed: previous.completed };
        const process = await checkTerminalProcess(sessionName);
        if (process.isSafe || process.processName === 'unknown') throw new InputDeliveryError('terminalNotReady');
        if (!isCodexTuiReadyContent(await capture())) throw new InputDeliveryError('terminalNotReady');
      }
      log.info(context, 'writing input');
      let baselineRefs = provider === 'claude' && message.attachments.length
        ? countImageRefs(await capture()) : 0;
      for (const attachment of message.attachments) {
        await paste(escapeInputAttachmentPath(attachment.path));
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
      if (receipt) {
        const result = await receipt();
        if (result.received) return { completed: result.completed };
      }
      if (immediately && provider === 'claude') {
        // chat:sendNow works without extended terminal key reporting.
        await sendRawKeys(sessionName, 'C-x');
        await sendRawKeys(sessionName, 'C-s');
      } else {
        await sendRawKeys(sessionName, 'Enter');
      }
      log.info(context, 'terminal input written');
      if (receipt) {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          const result = await receipt();
          if (result.received) {
            log.info(context, 'input confirmed in transcript');
            return { completed: result.completed };
          }
          await delay(500);
        }
        log.warn(context, 'input confirmation timed out; message retained');
        throw new InputDeliveryError('deliveryUnconfirmed');
      }
    },
    (target, message, since) => createCodexInputReceipt(target, message, since)(),
  );
  globalQueue.__purplemuxInputQueue = queue;
  const timer = setInterval(() => { void queue.tick(); }, 500);
  timer.unref();
  return queue;
};
