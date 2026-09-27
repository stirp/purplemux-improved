export const TERMINAL_WRITE_CHUNK_BYTES = 64 * 1024;
export type TTerminalWriteCallback = (error?: Error) => void;

interface ITerminalWriter {
  write(data: Uint8Array, callback: () => void): void;
  reset(): void;
}

/** Keep at most one bounded chunk inside xterm's asynchronous parser. */
export class TerminalWriteQueue {
  private queue: { data: Uint8Array; offset: number; callback?: TTerminalWriteCallback }[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing = false;
  private disposed = false;
  private generation = 0;
  private resetPending = false;

  constructor(private readonly terminal: ITerminalWriter) {}

  write(data: Uint8Array, callback?: TTerminalWriteCallback): void {
    if (this.disposed) {
      callback?.(new Error('Terminal writer is disposed'));
      return;
    }
    if (data.length === 0) {
      callback?.();
      return;
    }
    this.queue.push({ data, offset: 0, callback });
    this.schedule();
  }

  reset(): void {
    this.generation++;
    this.queue = [];
    this.resetPending = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    // An already submitted chunk must finish before resetting the display.
    if (!this.writing && !this.disposed) this.applyReset();
  }

  dispose(): void {
    this.disposed = true;
    const pending = this.queue;
    this.queue = [];
    clearTimeout(this.timer);
    this.timer = undefined;
    // Release transport flow control even if xterm never calls back after disposal.
    const error = new Error('Terminal writer is disposed');
    for (const entry of pending) entry.callback?.(error);
  }

  private applyReset(): void {
    if (!this.resetPending) return;
    this.terminal.reset();
    this.resetPending = false;
  }

  private schedule(): void {
    if (this.disposed || this.writing || this.timer !== undefined || this.queue.length === 0) return;
    // Yield beyond xterm's callback: it decrements its pending byte count afterwards.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 0);
  }

  private flush(): void {
    if (this.disposed || this.writing) return;
    const item = this.queue[0];
    if (!item) return;
    const generation = this.generation;
    const end = Math.min(item.offset + TERMINAL_WRITE_CHUNK_BYTES, item.data.length);
    const chunk = item.data.subarray(item.offset, end);
    item.offset = end;
    this.writing = true;
    try {
      this.terminal.write(chunk, () => {
        if (this.disposed) return;
        this.writing = false;
        if (generation === this.generation && item.offset === item.data.length) {
          this.queue.shift();
          item.callback?.();
        }
        this.applyReset();
        this.schedule();
      });
    } catch (cause) {
      this.writing = false;
      const failed = this.queue;
      this.queue = [];
      const error = cause instanceof Error ? cause : new Error(String(cause));
      console.error('[terminal] output parsing failed', error);
      // The transport closes/reconnects instead of acknowledging discarded output.
      for (const entry of failed) entry.callback?.(error);
    }
  }
}
