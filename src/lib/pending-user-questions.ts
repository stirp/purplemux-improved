import { resolveAsyncQuestionAnswers } from '@/lib/async-question-answers';
import type { IPendingUserQuestion } from '@/types/status';
import type { ITimelineAskUserQuestion } from '@/types/timeline';

const parse = (value: unknown): Record<string, unknown> | null => {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
};

export const readPendingUserQuestions = (lines: string[], provider: 'claude' | 'codex'): IPendingUserQuestion[] => {
  const pending = new Map<string, ITimelineAskUserQuestion>();
  let lastUserMessage: { text: string; source: 'user_message' | 'item_completed' } | null = null;
  const add = (id: unknown, raw: unknown, async: boolean, timestamp: number) => {
    if (typeof id !== 'string' || !id || !Array.isArray(raw)) return;
    const questions = raw.flatMap((item: unknown) => {
      const data = parse(item);
      const question = data?.question ?? data?.title;
      return typeof question === 'string' && question.trim()
        ? [{ question, header: '', options: [], multiSelect: false }] : [];
    });
    if (!questions.length) return;
    if (!pending.has(id)) lastUserMessage = null;
    pending.set(id, { id, toolUseId: id, type: 'ask-user-question', timestamp, questions,
      status: 'pending', ...(async ? { answerMode: 'compose' as const } : {}) });
  };
  const answer = (text: string, source: 'user_message' | 'item_completed') => {
    if (!text) return;
    // Codex can record one user submission in both event formats.
    if (lastUserMessage?.text === text && lastUserMessage.source !== source) return;
    lastUserMessage = { text, source };
    const entries = [...pending.values()];
    const resolved = resolveAsyncQuestionAnswers([...entries, { id: 'answer', type: 'user-message', timestamp: 0, text }]);
    const answered = resolved.filter((entry) => entry.type === 'ask-user-question' && entry.status === 'success');
    if (answered.length) answered.forEach((entry) => pending.delete(entry.id));
    else pending.clear();
  };

  for (const line of lines) {
    const item = parse(line);
    if (!item || item.isSidechain) continue;
    const timestamp = typeof item.timestamp === 'string' ? Date.parse(item.timestamp) : 0;
    if (provider === 'claude') {
      const content = parse(item.message)?.content;
      if (item.type === 'assistant' && Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_use' && block.name === 'AskUserQuestion') {
            add(block.id, block.input?.questions, false, timestamp);
          }
        }
      } else if (item.type === 'user') {
        if (Array.isArray(content) && content.some((block) => block?.type === 'tool_result')) {
          for (const block of content) if (block?.type === 'tool_result') pending.delete(block.tool_use_id);
        } else pending.clear();
      }
      continue;
    }

    const payload = parse(item.payload);
    if (!payload) continue;
    if (item.type === 'response_item') {
      const name = typeof payload.name === 'string' ? payload.name.replace(/^functions\./, '') : '';
      if (payload.type === 'function_call' && (name === 'request_user_input' || name === 'request_user_input_async')) {
        add(payload.call_id, parse(payload.arguments)?.questions, name === 'request_user_input_async', timestamp);
      } else if (payload.type === 'function_call_output') {
        const id = String(payload.call_id);
        if (pending.get(id)?.answerMode !== 'compose') pending.delete(id);
      } else if (payload.type === 'message' && payload.role === 'user' && Array.isArray(payload.content)) {
        const text = payload.content.map((block) => block?.text ?? '').join('\n');
        // Codex also emits event_msg.user_message; process that canonical record only.
        if (text.startsWith('[Request interrupted by user')) pending.clear();
      }
    } else if (item.type === 'event_msg') {
      if (payload.type === 'request_user_input' || payload.type === 'RequestUserInput') {
        add(payload.call_id ?? `event:${item.timestamp}:${payload.question}`, payload.questions ?? [{ question: payload.question }], false, timestamp);
      } else if (payload.type === 'user_message' && typeof payload.message === 'string') {
        answer(payload.message, 'user_message');
      } else if (payload.type === 'item_completed') {
        const completed = parse(payload.item);
        if (completed?.type === 'UserMessage' && Array.isArray(completed.content)) {
          const text = completed.content.flatMap((part: unknown) => {
            const block = parse(part);
            return block?.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
          }).join('\n');
          answer(text, 'item_completed');
        }
      } else if (payload.type === 'turn_aborted' || payload.type === 'TurnAborted') {
        pending.clear();
      }
    }
  }
  return [...pending.values()].map((entry) => ({ id: entry.toolUseId, question: entry.questions.map((q) => q.question).join('\n') }));
};
