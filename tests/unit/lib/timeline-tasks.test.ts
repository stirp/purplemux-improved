import { describe, expect, it } from 'vitest';
import { parseJsonlContent } from '@/lib/session-parser';
import { parseCodexContent } from '@/lib/session-parser-codex';
import { collectTimelineTasks, parseTaskSnapshot } from '@/lib/timeline-tasks';
import type { ITimelineTaskProgress } from '@/types/timeline';
import { parseCodexExecPlans } from '@/lib/codex-exec-plan';
const claude = (todos: unknown) => JSON.stringify({ type: 'assistant', timestamp: '2026-09-25T00:00:00Z', message: {
  content: [{ type: 'tool_use', id: 'todo1', name: 'TodoWrite', input: { todos } }],
} });
const codex = (plan: unknown) => JSON.stringify({ type: 'response_item', payload: {
  type: 'function_call', call_id: 'plan1', name: 'update_plan', arguments: JSON.stringify({ plan }),
} });
describe('unified task checklist', () => {
  it('reads the literal plan from a completed Codex code-mode call', () => {
    const input = 'text(await tools.update_plan({plan:[{step:"First",status:"in_progress"},{step:"Second",status:"pending"}]}));';
    const entries = parseCodexContent(JSON.stringify({ type: 'response_item', payload: {
      type: 'custom_tool_call', name: 'exec', call_id: 'code-plan', status: 'completed', input,
    } }));
    expect(collectTimelineTasks(entries).map((task) => [task.subject, task.status])).toEqual([
      ['First', 'in_progress'], ['Second', 'pending'],
    ]);
  });
  it('does not interpret quoted examples, comments, functions, branches or dynamic arguments', () => {
    for (const input of [
      'text("tools.update_plan({plan:[]})");',
      '// tools.update_plan({plan:[]})',
      'function example() { tools.update_plan({plan:[]}); }',
      'if (false) tools.update_plan({plan:[]});',
      'tools.update_plan({plan:makePlan()});',
      'tools.update_plan({plan:',
    ]) expect(parseCodexExecPlans(input)).toEqual([]);
  });
  it('preserves ordered snapshots and supports single quotes and empty plans', () => {
    expect(parseCodexExecPlans("await tools.update_plan({plan:[{step:'Done',status:'completed'}]}); await tools.update_plan({plan:[]});"))
      .toEqual([[{ taskId: '1', subject: 'Done', status: 'completed' }], []]);
  });
  it('maps Claude TodoWrite into the task checklist', () => {
    const entries = parseJsonlContent(claude([{ content: 'Build UI', activeForm: 'Building UI', status: 'in_progress' }]));
    expect(collectTimelineTasks(entries)).toEqual([{ taskId: 'claude-todo:1', subject: 'Build UI', status: 'in_progress' }]);
  });
  it('replaces the previous list, including removed tasks and an empty list', () => {
    const entries = parseJsonlContent([
      claude([{ content: 'Build', status: 'pending' }, { content: 'Old', status: 'pending' }]),
      claude([{ content: 'Build', status: 'completed' }]),
    ].join('\n'));
    expect(collectTimelineTasks(entries)).toHaveLength(1);
    expect(collectTimelineTasks(entries)[0].status).toBe('completed');
    expect(collectTimelineTasks([...entries, ...parseJsonlContent(claude([]))])).toEqual([]);
  });
  it('handles Codex tool calls and matching events without duplicating tasks', () => {
    const plan = [{ step: 'Implement', status: 'completed' }, { step: 'Verify', status: 'in_progress' }];
    const entries = parseCodexContent([codex(plan), JSON.stringify({ type: 'event_msg', payload: { type: 'plan_update', plan } })].join('\n'));
    expect(collectTimelineTasks(entries).map((task) => [task.subject, task.status])).toEqual([['Implement', 'completed'], ['Verify', 'in_progress']]);
  });
  it('does not clear a valid plan on malformed input', () => {
    const entries = parseCodexContent([codex([{ step: 'Keep', status: 'pending' }]), codex([{ status: 'completed' }])].join('\n'));
    expect(collectTimelineTasks(entries)[0].subject).toBe('Keep');
    expect(parseTaskSnapshot(undefined)).toBeNull();
  });
  it('preserves native tasks alongside plan snapshots and allows updates in tail reads', () => {
    const update: ITimelineTaskProgress = { id: 'task', type: 'task-progress', timestamp: 0, action: 'update', taskId: '3', subject: 'Native task', status: 'in_progress' };
    const entries = [update, ...parseCodexContent(codex([]))];
    expect(collectTimelineTasks(entries)).toEqual([{ taskId: '3', subject: 'Native task', status: 'in_progress' }]);
  });
  it('does not apply a failed plan update', () => {
    const entries = parseCodexContent([codex([{ step: 'Failed', status: 'pending' }]), JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'plan1', output: 'Error: invalid plan' } })].join('\n'));
    const result = entries.find((entry) => entry.type === 'tool-result');
    if (result?.type === 'tool-result') result.isError = true;
    expect(result).toBeDefined();
    expect(collectTimelineTasks(entries)).toEqual([]);
  });
});
