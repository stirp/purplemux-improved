import { describe, expect, it } from 'vitest';
import { formatQuestionAnswers, resolveAsyncQuestionAnswers } from '@/lib/async-question-answers';
import type { ITimelineAskUserQuestion, ITimelineUserMessage } from '@/types/timeline';

const question = (id = 'q1'): ITimelineAskUserQuestion => ({
  id, toolUseId: id, type: 'ask-user-question', timestamp: 1, status: 'pending', answerMode: 'compose',
  questions: [{ question: '选择方式？', header: '', multiSelect: false, options: [{ label: '立即', description: '' }] },
    { question: '补充说明', header: '', multiSelect: false, options: [] }],
});
const reply = (text: string, pending = false): ITimelineUserMessage => ({
  id: 'reply', type: 'user-message', timestamp: 2, text, pending,
});

describe('asynchronous question answers', () => {
  it('restores selected and multiline free-text answers from session history', () => {
    const q = question();
    const text = formatQuestionAnswers(q.questions, ['立即', '第一行\n第二行']);
    const restored = resolveAsyncQuestionAnswers([q, reply(text)]);
    expect(restored[0]).toMatchObject({ status: 'success', answers: ['立即', '第一行\n第二行'] });
    expect(q.status).toBe('pending');
  });
  it('does not treat an unrelated message or unconfirmed draft as an answer', () => {
    const q = question();
    expect(resolveAsyncQuestionAnswers([q, reply('继续'), reply(formatQuestionAnswers(q.questions, ['立即', '说明']), true)])[0]).toBe(q);
  });
  it('does not accept an incomplete set of answers', () => {
    const q = question();
    expect(resolveAsyncQuestionAnswers([q, reply('选择方式？\n立即')])[0]).toBe(q);
  });
  it('matches only the latest outstanding question with the same wording', () => {
    const q1 = question();
    const q2 = question('q2');
    const restored = resolveAsyncQuestionAnswers([q1, q2, reply(formatQuestionAnswers(q2.questions, ['立即', '说明']))]);
    expect(restored[0]).toBe(q1);
    expect(restored[1]).toMatchObject({ status: 'success' });
  });
  it('does not apply an earlier answer to a later question', () => {
    const q = question();
    expect(resolveAsyncQuestionAnswers([reply(formatQuestionAnswers(q.questions, ['立即', '说明'])), q])[1]).toBe(q);
  });
});
