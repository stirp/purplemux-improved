import type { IncomingMessage, ServerResponse } from 'http';

type TRequestHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

export const createDevRequestHandler = (
  handle: TRequestHandler,
  reportError: (error: unknown) => void,
) => async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const onError = (error: unknown) => {
    const disconnected = req.socket.destroyed || res.destroyed;
    if (disconnected && (error as NodeJS.ErrnoException | null)?.code === 'ECONNRESET') return;

    reportError(error);
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 500;
    res.end('Internal Server Error');
  };

  req.on('error', onError);
  res.on('error', onError);
  res.once('close', () => {
    // Next.js 16 replaces request listeners when restoring a cloned POST body.
    // Node emits the request's reset error after the response close event.
    if (!req.listeners('error').includes(onError)) req.on('error', onError);
  });

  try {
    await handle(req, res);
  } catch (error) {
    onError(error);
  }
};
