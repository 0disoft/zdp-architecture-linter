import { parseSync, Visitor, type Expression, type Node } from 'oxc-parser';

export interface SourceTimestampField {
  readonly name: string;
  readonly value: unknown;
  readonly literal: boolean;
  readonly expression: string;
  readonly localFormatting: boolean;
  readonly line: number;
}

const TIMESTAMP_FIELD = /^(?:timestamp|created_?at|updated_?at|logged_?at|occurred_?at|available_?at|expires_?at|scheduled_?at|next_?run_?at|event_?time|log_?time)(?:_?utc)?$/i;

export class SourceTimestampParseError extends Error {
  constructor() { super('Timestamp source must be valid JavaScript or TypeScript.'); }
}

function staticName(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

function staticKey(node: Node): boolean {
  return node.type === 'Literal' || (node.type === 'TemplateLiteral' && node.expressions.length === 0);
}

function unwrap(expression: Expression): Expression {
  while (expression.type === 'ParenthesizedExpression' || expression.type === 'TSAsExpression' ||
    expression.type === 'TSSatisfiesExpression' || expression.type === 'TSNonNullExpression' ||
    expression.type === 'TSTypeAssertion' || expression.type === 'ChainExpression') expression = expression.expression;
  return expression;
}

function isStringExpression(expression: Expression): boolean {
  expression = unwrap(expression);
  if (expression.type === 'Literal') return typeof expression.value === 'string';
  if (expression.type === 'TemplateLiteral') return true;
  if (expression.type !== 'CallExpression') return false;
  const callee = expression.callee;
  return callee.type === 'MemberExpression' && (!callee.computed || staticKey(callee.property)) &&
    staticName(callee.property) === 'toISOString';
}

function stringIdentityReceiver(expression: Expression): Expression | undefined {
  if (expression.type !== 'CallExpression' || expression.arguments.length !== 0) return undefined;
  const callee = expression.callee;
  if (callee.type !== 'MemberExpression' || (callee.computed && !staticKey(callee.property)) ||
    staticName(callee.property) !== 'toString' || !isStringExpression(callee.object)) return undefined;
  return callee.object;
}

/** Inspect assigned expressions without treating sibling display strings as timestamps. */
export function collectSourceTimestampFields(source: string, file: string): readonly SourceTimestampField[] {
  const tree = parseSync(file, source);
  if (tree.errors.length > 0) throw new SourceTimestampParseError();
  const result: SourceTimestampField[] = [];
  const recorded = new Set<string>();
  function record(key: Node, initializer: Expression | null | undefined): void {
    const name = staticName(key);
    if (!name || !initializer || !TIMESTAMP_FIELD.test(name)) return;
    const identity = `${name}:${initializer.start}`;
    if (recorded.has(identity)) return;
    recorded.add(identity);
    let expression = unwrap(initializer);
    while (stringIdentityReceiver(expression)) expression = unwrap(stringIdentityReceiver(expression)!);
    const template = expression.type === 'TemplateLiteral' && expression.expressions.length === 0;
    const signedNumber = expression.type === 'UnaryExpression' && ['+', '-'].includes(expression.operator) &&
      expression.argument.type === 'Literal' && typeof expression.argument.value === 'number';
    const value = expression.type === 'Literal' ? expression.value
      : expression.type === 'TemplateLiteral' && template ? expression.quasis[0]?.value.cooked
        : signedNumber ? Number(source.slice(expression.start, expression.end).replace(/\s/g, '')) : undefined;
    let localFormatting = false;
    new Visitor({
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        const method = !callee.computed || staticKey(callee.property) ? staticName(callee.property) : undefined;
        if (method === 'toString' && stringIdentityReceiver(node)) return;
        if (typeof method === 'string' && ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toString'].includes(method))
          localFormatting = true;
      }
    }).visit({ ...tree.program, body: [{ type: 'ExpressionStatement', expression,
      start: expression.start, end: expression.end }] });
    result.push({ name, value, localFormatting, literal: expression.type === 'Literal' || template || signedNumber,
      expression: source.slice(expression.start, expression.end),
      line: source.slice(0, expression.start).split('\n').length });
  }
  new Visitor({
    VariableDeclarator(node) { record(node.id, node.init); },
    Property(node) {
      if (node.kind === 'init' && !node.method && (!node.computed || staticKey(node.key)))
        record(node.key, node.value.type === 'AssignmentPattern' ? node.value.right : node.value as Expression);
    },
    AssignmentPattern(node) { record(node.left, node.right); },
    PropertyDefinition(node) { if (!node.computed || staticKey(node.key)) record(node.key, node.value); },
    AssignmentExpression(node) {
      if (node.operator !== '=') return;
      if (node.left.type === 'Identifier') record(node.left, node.right);
      else if (node.left.type === 'MemberExpression' && (!node.left.computed || staticKey(node.left.property))) record(node.left.property, node.right);
    }
  }).visit(tree.program);
  return result;
}
