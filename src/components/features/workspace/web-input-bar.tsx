import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Ban, Clock3, Loader2, Paperclip, SendHorizontal, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import useWebInput, { clearInputDraft } from '@/hooks/use-web-input';
import useInputQueue from '@/hooks/use-input-queue';
import useIsMobileDevice from '@/hooks/use-is-mobile-device';
import useMessageHistory from '@/hooks/use-message-history';
import { registerPushTarget } from '@/hooks/use-web-push';
import InterruptDialog from '@/components/features/workspace/interrupt-dialog';
import MessageHistoryPicker from '@/components/features/workspace/message-history-picker';
import { isImageFile, uploadImage } from '@/lib/upload-image-client';
import { uploadFile } from '@/lib/upload-file-client';
import { loadAttachmentDraft, saveAttachmentDraft } from '@/lib/attachment-draft';
import type { TCliState } from '@/types/timeline';

const DEFAULT_MAX_ROWS = 5;
const LINE_HEIGHT = 20;
const PADDING_Y = 16;

interface IAttachment {
  id: string;
  path: string;
  filename: string;
  thumbnail: string;
}

const MAX_ATTACHMENTS = 20;

interface IWebInputBarProps {
  tabId?: string;
  wsId?: string;
  sessionName?: string;
  agentSessionId?: string | null;
  provider?: 'claude' | 'codex';
  cliState: TCliState;
  sendStdin: (data: string) => void;
  terminalWsConnected: boolean;
  visible: boolean;
  focusTerminal: () => void;
  focusInputRef: React.MutableRefObject<(() => void) | undefined>;
  setInputValueRef: React.MutableRefObject<((v: string) => void) | undefined>;
  maxRows?: number;
  onRestartSession?: () => void;
  onNativeCommands?: (text: string) => void;
  nativeCommandsActive?: boolean;
  onSend?: () => void;
  onOptimisticSend?: (text: string) => void;
  onAddPendingMessage?: (text: string, options?: { autoHide?: boolean; attachmentPlaceholder?: boolean }) => string;
  onRemovePendingMessage?: (id: string) => void;
  attachFilesRef?: React.MutableRefObject<((files: File[]) => Promise<boolean> | void) | undefined>;
}

const WebInputBar = ({
  tabId,
  wsId,
  agentSessionId,
  provider = 'claude',
  cliState,
  sendStdin,
  terminalWsConnected,
  visible,
  focusTerminal,
  focusInputRef,
  setInputValueRef,
  maxRows = DEFAULT_MAX_ROWS,
  onRestartSession,
  onNativeCommands,
  nativeCommandsActive = false,
  onSend,
  onOptimisticSend,
  attachFilesRef,
}: IWebInputBarProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const isCodex = provider === 'codex';
  const { entries, isLoading, isError, fetchHistory, addHistory, deleteHistory } =
    useMessageHistory({ wsId });
  const isMobileDevice = useIsMobileDevice();
  const submitDelayMs = 250;
  const handleMessageSent = useCallback(
    (message: string) => {
      addHistory(message);
      onOptimisticSend?.(message);
    },
    [addHistory, onOptimisticSend],
  );
  const { value, setValue, mode, canSend, send, interrupt, textareaRef, focusInput } = useWebInput(
    cliState,
    sendStdin,
    terminalWsConnected,
    {
      tabId,
      onRestartSession,
      onMessageSent: handleMessageSent,
      disabledMessage: isCodex ? t('codexInactiveMessage') : t('inputDisabledPlaceholder'),
      submitDelayMs,
    },
  );

  const queue = useInputQueue(wsId, tabId);
  const dispatchingRef = useRef(false);
  const [interruptDialogOpen, setInterruptDialogOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [attachments, updateAttachments] = useState<IAttachment[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<IAttachment[]>([]);

  const setAttachments = useCallback((value: IAttachment[] | ((prev: IAttachment[]) => IAttachment[])) => {
    const next = typeof value === 'function' ? value(attachmentsRef.current) : value;
    attachmentsRef.current = next;
    saveAttachmentDraft(tabId, next);
    updateAttachments(next);
  }, [tabId]);

  useEffect(() => {
    const restored = loadAttachmentDraft(tabId);
    attachmentsRef.current = restored;
    updateAttachments(restored);
  }, [tabId]);


  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.thumbnail));
    };
  }, []);


  useEffect(() => {
    focusInputRef.current = focusInput;
    setInputValueRef.current = setValue;
    return () => {
      focusInputRef.current = undefined;
      setInputValueRef.current = undefined;
    };
  }, [focusInput, focusInputRef, setValue, setInputValueRef]);

  useEffect(() => {
    if (!visible) {
      setValue('');
    }
  }, [visible, setValue]);


  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (!value) return;
    const maxHeight = LINE_HEIGHT * maxRows + PADDING_Y;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [textareaRef, maxRows, value]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const dispatch = async () => {
    if (!canSend || nativeCommandsActive || dispatchingRef.current || isUploading) return;
    const trimmed = value.trim();
    if (!trimmed && !attachments.length) return;
    if (!attachments.length && ['/new', '/clear'].includes(trimmed.toLowerCase())) {
      send();
      return;
    }
    dispatchingRef.current = true;
    setIsDispatching(true);
    const sentAttachments = [...attachments];
    const text = value;
    try {
      await queue.enqueue({
        id: nanoid(),
        text,
        attachments: sentAttachments.map(({ path, filename }) => ({ path, filename })),
      });
      if (textareaRef.current?.value === text) {
        setValue('');
        if (tabId) clearInputDraft(tabId);
      }
      setAttachments((current) => current.filter((item) => !sentAttachments.some((sent) => sent.id === item.id)));
      sentAttachments.forEach((item) => URL.revokeObjectURL(item.thumbnail));
      if (trimmed && !trimmed.startsWith('/')) addHistory(trimmed);
      if (agentSessionId) registerPushTarget(agentSessionId);
      onSend?.();
    } catch {
      toast.error(t('queueRequestFailed'));
    } finally {
      dispatchingRef.current = false;
      setIsDispatching(false);
    }
  };

  const submitQueuedNow = async () => {
    if (dispatchingRef.current) return;
    dispatchingRef.current = true;
    setIsDispatching(true);
    try {
      await queue.submitNow();
      onSend?.();
    } catch {
      toast.error(t('queueRequestFailed'));
    } finally {
      dispatchingRef.current = false;
      setIsDispatching(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      textareaRef.current?.blur();
      focusTerminal();
      return;
    }

    if (e.key === 'Enter' && !isMobileDevice) {
      if (e.shiftKey) return;
      e.preventDefault();
      dispatch();
      return;
    }
  };

  const openNativeCommands = (text: string) => {
    if (!onNativeCommands || !canSend || cliState === 'needs-input' || cliState === 'unknown' || attachments.length) return false;
    if (queue.messages.length || queue.sending || isDispatching) {
      toast.info(t('nativeCommandsQueuePending'));
      return false;
    }
    onNativeCommands(text);
    setValue('');
    if (tabId) clearInputDraft(tabId);
    return true;
  };

  const handleSendClick = () => {
    dispatch();
    if (isMobileDevice) {
      textareaRef.current?.blur();
    } else {
      textareaRef.current?.focus();
    }
  };

  const handleInterruptClick = () => {
    setInterruptDialogOpen(true);
  };

  const handleInterruptConfirm = () => {
    interrupt();
  };

  const handleFocusIn = () => setIsFocused(true);
  const handleFocusOut = () => setIsFocused(false);

  const handleHistorySelect = useCallback(
    (message: string) => {
      setValue(message);
    },
    [setValue],
  );

  const handleHistoryClose = useCallback(() => {
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [textareaRef]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) URL.revokeObjectURL(removed.thumbnail);
      return prev.filter((a) => a.id !== id);
    });
  }, [setAttachments]);

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const current = textarea.value;
    const focused = typeof document !== 'undefined' && document.activeElement === textarea;
    const start = focused ? textarea.selectionStart ?? current.length : current.length;
    const end = focused ? textarea.selectionEnd ?? current.length : current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const prefix = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const suffix = after.length === 0 || !/^\s/.test(after) ? ' ' : '';
    const inserted = `${prefix}${text}${suffix}`;
    const next = `${before}${inserted}${after}`;
    setValue(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  }, [setValue, textareaRef]);

  const uploadImagesAsChips = useCallback(async (images: File[]): Promise<void> => {
    if (images.length === 0) return;
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS - attachmentsRef.current.length);
    if (remainingSlots === 0) {
      toast.error(t('attachmentLimitReached', { max: MAX_ATTACHMENTS }));
      return;
    }
    const accepted = images.slice(0, remainingSlots);
    if (accepted.length < images.length) {
      toast.warning(t('attachmentLimitReached', { max: MAX_ATTACHMENTS }));
    }
    const results = await Promise.all(
      accepted.map(async (file) => ({ file, result: await uploadImage(file, { wsId, tabId }) })),
    );
    const next: IAttachment[] = results.map(({ file, result }) => ({
      id: nanoid(),
      path: result.path,
      filename: file.name || 'image',
      thumbnail: result.url || URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...next]);
  }, [wsId, tabId, t, setAttachments]);

  const uploadFilesAsPaths = useCallback(async (files: File[]): Promise<void> => {
    if (files.length === 0) return;
    const results = await Promise.all(files.map((file) => uploadFile(file, { wsId, tabId })));
    const text = results.map((r) => r.path).join(' ');
    if (text.length > 0) insertAtCursor(text);
  }, [wsId, tabId, insertAtCursor]);

  const uploadAndAttach = useCallback(async (files: File[]): Promise<boolean> => {
    if (files.length === 0) return false;
    const images = files.filter(isImageFile);
    const others = files.filter((f) => !isImageFile(f));
    if (images.length === 0 && others.length === 0) return false;
    setIsUploading(true);
    try {
      await Promise.all([uploadImagesAsChips(images), uploadFilesAsPaths(others)]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
    return true;
  }, [uploadImagesAsChips, uploadFilesAsPaths]);

  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (!attachFilesRef) return;
    attachFilesRef.current = uploadAndAttach;
    return () => {
      if (attachFilesRef.current === uploadAndAttach) attachFilesRef.current = undefined;
    };
  }, [attachFilesRef, uploadAndAttach]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadAndAttach(Array.from(files));
    e.target.value = '';
  }, [uploadAndAttach]);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.files;
    if (!items || items.length === 0) return;
    const files = Array.from(items);
    if (files.length === 0) return;
    e.preventDefault();
    await uploadAndAttach(files);
  }, [uploadAndAttach]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingOver) setIsDraggingOver(true);
  }, [isDraggingOver]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    await uploadAndAttach(Array.from(e.dataTransfer.files));
  }, [uploadAndAttach]);

  const isDisabled = mode === 'disabled' || nativeCommandsActive;
  const hasValue = value.trim().length > 0;
  const hasAttachments = attachments.length > 0;
  const canDispatch = canSend && !nativeCommandsActive && (hasValue || hasAttachments) && !isDispatching && !isUploading;

  return (
    <>
      <div
        className={cn(
          'relative grid',
          visible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute bottom-full left-0 right-0 transition-opacity duration-300',
            isDisabled && visible ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden={!isDisabled || !visible}
        >
          <div className="mx-auto w-full max-w-content px-3 pb-1">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 text-[11px] text-muted-foreground/70">
              <Loader2 size={10} className="mr-1.5 justify-self-end animate-spin" />
              <span>{t('connecting')}</span>
              <span />
            </div>
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="mx-auto w-full max-w-content px-3 pt-0 pb-0 animate-in fade-in duration-150">
          <div
            ref={containerRef}
            className={cn(
              'relative z-10 flex flex-col gap-2 rounded-lg border px-3 py-2 transition-colors duration-150',
              isFocused
                ? 'border-ring bg-background'
                : 'border-border bg-black/5 dark:bg-white/5',
              isDraggingOver && 'border-ring bg-accent/40',
            )}
            onFocusCapture={handleFocusIn}
            onBlurCapture={handleFocusOut}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {hasAttachments && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="group relative h-14 w-14 overflow-hidden rounded-md border border-border bg-background"
                    title={a.filename}
                  >
                    <img src={a.thumbnail} alt={a.filename} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity hover:bg-foreground group-hover:opacity-100 focus:opacity-100"
                      aria-label={tc('delete')}
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
            <div className="flex items-end">
              <MessageHistoryPicker
                entries={entries}
                isLoading={isLoading}
                isError={isError}
                disabled={isDisabled}
                onFetch={fetchHistory}
                onSelect={handleHistorySelect}
                onDelete={deleteHistory}
                onClose={handleHistoryClose}
              />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={handleAttachClick}
                disabled={isDisabled || isUploading}
                aria-label={t('attachAriaLabel')}
                title={t('attachAriaLabel')}
              >
                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              </Button>
            </div>

            <textarea
              ref={textareaRef}
              disabled={nativeCommandsActive}
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                if (!value && next === '/' && !(e.nativeEvent as InputEvent).isComposing && openNativeCommands(next)) return;
                setValue(next);
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={t(nativeCommandsActive ? 'nativeCommandsHint' : 'inputPlaceholder')}
              aria-label={isCodex ? t('codexInputAriaLabel') : t('inputAriaLabel')}
              className="flex-1 resize-none bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              rows={1}
              style={{
                lineHeight: `${LINE_HEIGHT}px`,
                maxHeight: `${LINE_HEIGHT * maxRows + PADDING_Y}px`,
                overflowY: 'auto',
              }}
            />

            {mode === 'interrupt' && !hasValue && !hasAttachments && !isDispatching ? (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 shrink-0 p-0 text-ui-red hover:text-ui-red/80',
                  !canSend && 'opacity-30',
                )}
                onClick={handleInterruptClick}
                disabled={!canSend}
                aria-label={t('interruptAriaLabel')}
              >
                <Square size={14} fill="currentColor" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground',
                  canDispatch && (isCodex ? 'text-foreground' : 'text-claude-active'),
                  !canDispatch && 'opacity-30',
                )}
                onClick={handleSendClick}
                disabled={!canDispatch}
                aria-label={t('queueSend')}
                title={t('queueSend')}
              >
                {isDispatching ? <Loader2 size={14} className="animate-spin" /> : isDisabled ? <Ban size={14} /> : <SendHorizontal size={16} />}
              </Button>
            )}
            </div>
            {onNativeCommands && /^\/[^\r\n]*$/.test(value) && (
              <Button variant="ghost" size="sm" className="self-start text-xs" onClick={() => openNativeCommands(value)}
                disabled={!canSend || cliState === 'needs-input' || cliState === 'unknown' || hasAttachments}>
                {t('nativeCommandsOpen')}
              </Button>
            )}
            {queue.messages.length > 0 && (
              <div className="border-t border-border pt-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                    <Clock3 size={12} />
                    {t('queuedCount', { count: queue.messages.length })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={submitQueuedNow}
                    disabled={!canSend || nativeCommandsActive || isDispatching || queue.sending || cliState === 'unknown' || queue.error === 'sessionChanged'}
                    title={t('submitQueuedNowHint')}
                  >
                    {queue.sending ? <Loader2 size={12} className="animate-spin" /> : <SendHorizontal size={12} />}
                    {t('submitQueuedNow')}
                  </Button>
                </div>
                <ul className="max-h-28 overflow-y-auto">
                  {queue.messages.map((message, index) => (
                    <li key={message.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate" title={message.text}>
                        {message.text || message.attachments.map((item) => item.filename).join(', ')}
                      </span>
                      <button
                        type="button"
                        className="p-1 hover:text-foreground disabled:opacity-30"
                        disabled={queue.sending && index === 0}
                        aria-label={t('cancelQueuedMessage')}
                        onClick={() => { void queue.remove(message.id).catch(() => toast.error(t('queueRequestFailed'))); }}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
                {queue.error && (
                  <p className="mt-1 text-xs text-ui-red" role="alert">
                    {t(queue.error === 'sessionChanged' ? 'queueSessionChanged' : 'queueSendFailed')}
                  </p>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <InterruptDialog
        open={interruptDialogOpen}
        onOpenChange={setInterruptDialogOpen}
        onConfirm={handleInterruptConfirm}
      />
    </>
  );
};

export default WebInputBar;
