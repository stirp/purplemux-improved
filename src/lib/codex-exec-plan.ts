import { parse, type Node } from 'acorn';
import { parseTaskSnapshot } from '@/lib/timeline-tasks';
import type { ITaskItem } from '@/types/timeline';

// Read literal plan arguments only. Never execute code from a session transcript.
const literalValue = (node: Node): unknown => {
  if (node.type === 'Literal') return (node as import('acorn').Literal).value;
  if (node.type === 'ArrayExpression') {
    return (node as import('acorn').ArrayExpression).elements.map((item) => item && literalValue(item));
  }
  if (node.type === 'ObjectExpression') {
    const result: Record<string, unknown> = Object.create(null);
    for (const property of (node as import('acorn').ObjectExpression).properties) {
      if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') return undefined;
      const key = property.key.type === 'Identifier' ? property.key.name : literalValue(property.key);
      if (typeof key !== 'string') return undefined;
      result[key] = literalValue(property.value);
    }
    return result;
  }
  return undefined;
};

export const parseCodexExecPlans = (input: string): ITaskItem[][] => {
  if (!input.includes('update_plan')) return [];
  const plans: ITaskItem[][] = [];
  try {
    const program = parse(input, { ecmaVersion: 'latest', sourceType: 'module' });
    const visit = (node: Node) => {
      if (node.type === 'AwaitExpression') {
        visit((node as import('acorn').AwaitExpression).argument);
      } else if (node.type === 'CallExpression') {
        const call = node as import('acorn').CallExpression;
        for (const argument of call.arguments) visit(argument);
        const callee = call.callee;
        if (callee.type !== 'MemberExpression' || callee.computed ||
          callee.object.type !== 'Identifier' || callee.object.name !== 'tools' ||
          callee.property.type !== 'Identifier' || callee.property.name !== 'update_plan') return;
        const args = call.arguments[0] && literalValue(call.arguments[0]);
        const tasks = parseTaskSnapshot(args && typeof args === 'object' ? (args as Record<string, unknown>).plan : undefined);
        if (tasks !== null) plans.push(tasks);
      }
    };
    // Avoid treating examples in strings, functions or conditional branches as executed plans.
    for (const statement of program.body) {
      if (statement.type === 'ExpressionStatement') visit(statement.expression);
    }
  } catch {
    return [];
  }
  return plans;
};
