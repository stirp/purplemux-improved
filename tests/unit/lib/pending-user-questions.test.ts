import { describe, expect, it } from 'vitest';
import { readPendingUserQuestions } from '@/lib/pending-user-questions';

const lines = (items: unknown[]) => items.map((item) => JSON.stringify(item));
const claudeQuestion = (id = 'q1') => ({ type: 'assistant', message: { content: [
  { type: 'tool_use', name: 'AskUserQuestion', id, input: { questions: [{ question: '选择方案？' }] } },
] } });
const codexQuestion = (name = 'request_user_input_async', id = 'q1') => ({
  type: 'response_item', payload: { type: 'function_call', name, call_id: id,
    arguments: JSON.stringify({ questions: [{ title: '选择方案？', question: '选择方案？' }] }) },
});
const output = (id = 'q1') => ({ type: 'response_item', payload: { type: 'function_call_output', call_id: id, output: '{}' } });
const user = (message: string) => ({ type: 'event_msg', payload: { type: 'user_message', message } });
const completedUser = (text: string) => ({ type: 'event_msg', payload: { type: 'item_completed', item: {
  type: 'UserMessage', content: [{ type: 'text', text }, { type: 'image', image_url: 'ignored' }],
} } });

describe('pending questions in runtime snapshots', () => {
  it('clears an async question answered through a completed UserMessage', () => {
    expect(readPendingUserQuestions(lines([codexQuestion(), output(), completedUser('选择方案？\n方案 A')]), 'codex')).toEqual([]);
  });

  it.each([false, true])('does not consume a dual-format answer twice (completed first: %s)', (completedFirst) => {
    const second = codexQuestion('request_user_input_async', 'q2');
    second.payload.arguments = JSON.stringify({ questions: [{ title: '发布时间？' }] });
    const answer = '选择方案？\n方案 A';
    const replies = [user(answer), completedUser(answer)];
    if (completedFirst) replies.reverse();
    expect(readPendingUserQuestions(lines([codexQuestion(), second, ...replies]), 'codex'))
      .toEqual([{ id: 'q2', question: '发布时间？' }]);
  });

  it('accepts the same answer again after a new question', () => {
    const answer = '选择方案？\n方案 A';
    expect(readPendingUserQuestions(lines([
      codexQuestion(), user(answer), completedUser(answer),
      codexQuestion('request_user_input_async', 'q2'), completedUser(answer),
    ]), 'codex')).toEqual([]);
  });

  it('does not apply a second representation of an answer to an older identical question', () => {
    const answer = '选择方案？\n方案 A';
    expect(readPendingUserQuestions(lines([
      codexQuestion(), codexQuestion('request_user_input_async', 'q2'), user(answer), completedUser(answer),
    ]), 'codex')).toEqual([{ id: 'q1', question: '选择方案？' }]);
  });

  it('joins completed text blocks and ignores malformed or non-user completion events', () => {
    const rows = [codexQuestion(),
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'text', text: '选择方案？\n方案 A' }] } } },
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [null, { type: 'image' }] } } },
    ];
    expect(readPendingUserQuestions(lines(rows), 'codex')).toHaveLength(1);
    expect(readPendingUserQuestions(lines([...rows, { type: 'event_msg', payload: { type: 'item_completed', item: {
      type: 'UserMessage', content: [{ type: 'text', text: '选择方案？' }, { type: 'text', text: '方案 A' }],
    } } }]), 'codex')).toEqual([]);
  });

  it('extracts Claude questions and removes successful or failed tool results', () => {
    expect(readPendingUserQuestions(lines([claudeQuestion()]), 'claude')).toEqual([{ id: 'q1', question: '选择方案？' }]);
    for (const is_error of [true, false]) {
      expect(readPendingUserQuestions(lines([claudeQuestion(), { type: 'user', message: { content: [
        { type: 'tool_result', tool_use_id: 'q1', is_error },
      ] } }]), 'claude')).toEqual([]);
    }
  });

  it('ignores malformed rows, sidechains and questions from an earlier Claude turn', () => {
    expect(readPendingUserQuestions(['{', ...lines([
      { ...claudeQuestion('child'), isSidechain: true }, claudeQuestion(),
      { type: 'user', message: { content: '开始下一轮' } },
    ])], 'claude')).toEqual([]);
  });

  it.each(['request_user_input', 'functions.request_user_input'])('tracks synchronous Codex %s until its result', (name) => {
    expect(readPendingUserQuestions(lines([codexQuestion(name)]), 'codex')).toHaveLength(1);
    expect(readPendingUserQuestions(lines([codexQuestion(name), output()]), 'codex')).toEqual([]);
  });

  it.each(['request_user_input_async', 'functions.request_user_input_async'])('keeps %s after tool return and turn completion until the human answers', (name) => {
    const pending = [codexQuestion(name), output(), { type: 'event_msg', payload: { type: 'task_complete' } }];
    expect(readPendingUserQuestions(lines(pending), 'codex')).toHaveLength(1);
    expect(readPendingUserQuestions(lines([...pending, user('选择方案？\n方案 A')]), 'codex')).toEqual([]);
  });

  it('answers only the matching async question and keeps the others', () => {
    const second = codexQuestion('request_user_input_async', 'q2');
    second.payload.arguments = JSON.stringify({ questions: [{ title: '发布时间？' }] });
    expect(readPendingUserQuestions(lines([codexQuestion(), second, user('选择方案？\n方案 A')]), 'codex'))
      .toEqual([{ id: 'q2', question: '发布时间？' }]);
  });

  it.each(['request_user_input', 'RequestUserInput'])('supports event format %s with stable fallback identity', (type) => {
    const rows = lines([{ timestamp: '2026-10-20T00:00:00Z', type: 'event_msg', payload: { type, question: '确认？' } }]);
    expect(readPendingUserQuestions(rows, 'codex')).toEqual(readPendingUserQuestions(rows, 'codex'));
    expect(readPendingUserQuestions(rows, 'codex')[0].question).toBe('确认？');
  });

  it('clears abandoned questions on a new user task or interruption', () => {
    expect(readPendingUserQuestions(lines([codexQuestion(), user('新任务')]), 'codex')).toEqual([]);
    expect(readPendingUserQuestions(lines([codexQuestion(), { type: 'event_msg', payload: { type: 'turn_aborted' } }]), 'codex')).toEqual([]);
  });
});
