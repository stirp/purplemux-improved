import { useState, useRef, memo } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircleQuestion, Check } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useTabStore from '@/hooks/use-tab-store';
import { formatQuestionAnswers } from '@/lib/async-question-answers';
import type { ITimelineAskUserQuestion } from '@/types/timeline';

interface IAskUserQuestionItemProps {
  entry: ITimelineAskUserQuestion;
  sessionName?: string;
  tabId?: string;
  agentSessionId?: string | null;
}

const sendSelection = async (session: string, optionIndex: number): Promise<boolean> => {
  try {
    const res = await fetch('/api/tmux/send-input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, input: String(optionIndex + 1) }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

const AskUserQuestionItem = ({ entry, sessionName, tabId, agentSessionId }: IAskUserQuestionItemProps) => {
  const t = useTranslations('timeline');
  const [localSelected, setLocalSelected] = useState<number | null>(null);
  const isAnswered = entry.status === 'success';
  const question = entry.questions[0];

  if (entry.answerMode === 'compose') return <AsyncQuestionItem key={`${agentSessionId}:${entry.toolUseId}`} entry={entry} tabId={tabId} agentSessionId={agentSessionId} />;

  if (!question) return null;

  const isSelectable = !isAnswered && localSelected === null && !!sessionName;

  const handleSelect = async (idx: number) => {
    if (!isSelectable) return;

    setLocalSelected(idx);
    const ok = await sendSelection(sessionName, idx);
    if (!ok) {
      setLocalSelected(null);
      toast.error(t('selectionFailed'));
    }
  };

  return (
    <div className="animate-in fade-in duration-150">
      <div className="rounded-lg border border-claude-active/20 bg-claude-active/5 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-claude-active">
          <MessageCircleQuestion size={14} />
          <span>{question.header}</span>
        </div>

        <p className="mb-3 text-sm">{question.question}</p>

        <div className="flex flex-col gap-1.5">
          {question.options.map((option, idx) => {
            const isSelected = isAnswered
              ? entry.answer === option.label
              : localSelected === idx;
            const isLocalPending = localSelected === idx && !isAnswered;
            const dimmed = (isAnswered || localSelected !== null) && !isSelected;

            return (
              <button
                key={idx}
                type="button"
                disabled={!isSelectable}
                onClick={() => handleSelect(idx)}
                className={cn(
                  'flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'border-claude-active/40 bg-claude-active/10'
                    : dimmed
                      ? 'border-border/30 opacity-50'
                      : 'border-border/50',
                  isSelectable && 'cursor-pointer hover:border-claude-active/30 hover:bg-claude-active/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-medium',
                    isSelected
                      ? 'bg-claude-active text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isLocalPending ? (
                    <Spinner size={10} />
                  ) : isSelected ? (
                    <Check size={12} />
                  ) : (
                    idx + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const AsyncQuestionItem = ({ entry, tabId, agentSessionId }: IAskUserQuestionItemProps) => {
  const t = useTranslations('timeline');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const workspaceId = useTabStore((state) => tabId ? state.tabs[tabId]?.workspaceId : undefined);
  const savedAnswers = entry.answers ?? submitted;
  const answered = entry.status === 'success' || savedAnswers !== null;
  const ready = entry.questions.every((_, index) => answers[index]?.trim());

  const submit = async () => {
    if (!ready || answered || sendingRef.current || !tabId || !workspaceId || !agentSessionId) return;
    sendingRef.current = true;
    setSending(true);
    const selected = entry.questions.map((_, index) => answers[index].trim());
    try {
      const response = await fetch(`/api/input-queue?${new URLSearchParams({ workspaceId, tabId })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send-immediate', id: entry.toolUseId, agentSessionId,
          text: formatQuestionAnswers(entry.questions, selected), attachments: [] }),
      });
      if (!response.ok) throw new Error('Answer submission failed');
      setSubmitted(selected);
    } catch {
      toast.error(t('selectionFailed'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      {entry.questions.map((question, index) => (
        <fieldset key={index} className="space-y-2" disabled={answered || sending}>
          <legend className="mb-2 text-sm">{question.question}</legend>
          {question.options.map((option) => {
            const selected = (savedAnswers?.[index] ?? answers[index]) === option.label;
            return (
              <label key={option.label} className={cn('flex items-center gap-2 rounded border p-2 text-sm',
                selected ? 'border-claude-active/40 bg-claude-active/10' : 'border-border',
                answered && !selected && 'opacity-50')}>
                <input type="radio" name={`${agentSessionId}-${entry.toolUseId}-${index}`} checked={selected}
                  onChange={() => setAnswers((prev) => ({ ...prev, [index]: option.label }))} />
                {option.label}
                {answered && selected && <Check size={14} className="ml-auto text-claude-active" />}
              </label>
            );
          })}
          {answered ? (
            <p className="whitespace-pre-wrap break-words text-sm">{savedAnswers?.[index]}</p>
          ) : (
            <input className="w-full rounded border border-border bg-background p-2 text-sm"
              aria-label={question.question} value={answers[index] ?? ''}
              onChange={(event) => setAnswers((prev) => ({ ...prev, [index]: event.target.value }))} />
          )}
        </fieldset>
      ))}
      {answered ? (
        <p className="flex items-center gap-1.5 text-xs text-claude-active"><Check size={14} />{t('answerSubmitted')}</p>
      ) : (
        <>
          <button type="button" disabled={!ready || !tabId || !workspaceId || !agentSessionId || sending}
            className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm disabled:opacity-50"
            onClick={submit}>
            {sending && <Spinner size={12} />}
            {t('submitAnswer')}
          </button>
          <p className="text-xs text-muted-foreground">{t('submitAnswerHint')}</p>
        </>
      )}
    </div>
  );
};

export default memo(AskUserQuestionItem);
