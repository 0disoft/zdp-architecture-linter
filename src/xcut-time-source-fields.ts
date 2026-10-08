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

/** Inspect assigned expressions without treating sibling display strings as timestamps. */
export function collectSourceTimestampFields(source: string, file: string): readonly SourceTimestampField[] {
  const tree = parseSync(file, source);
  if (tree.errors.length > 0) throw new SourceTimestampParseError();
  const result: SourceTimestampField[] = [];
  function record(key: Node, initializer: Expression | null | undefined): void {
    const name = key.type === 'Identifier' ? key.name
      : key.type === 'Literal' && typeof key.value === 'string' ? key.value : undefined;
    if (!name || !initializer || !TIMESTAMP_FIELD.test(name)) return;
    let expression = initializer;
    while (expression.type === 'ParenthesizedExpression' || expression.type === 'TSAsExpression' ||
      expression.type === 'TSSatisfiesExpression' || expression.type === 'TSNonNullExpression' ||
      expression.type === 'TSTypeAssertion') expression = expression.expression;
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
        const method = !callee.computed && callee.property.type === 'Identifier' ? callee.property.name
          : callee.computed && callee.property.type === 'Literal' ? callee.property.value
            : callee.computed && callee.property.type === 'TemplateLiteral' && callee.property.expressions.length === 0
              ? callee.property.quasis[0]?.value.cooked : undefined;
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
    Property(node) { if (node.kind === 'init' && !node.method && (!node.computed || node.key.type === 'Literal')) record(node.key, node.value as Expression); },
    PropertyDefinition(node) { if (!node.computed || node.key.type === 'Literal') record(node.key, node.value); },
    AssignmentExpression(node) {
      if (node.operator !== '=') return;
      if (node.left.type === 'Identifier') record(node.left, node.right);
      else if (node.left.type === 'MemberExpression' && (!node.left.computed || node.left.property.type === 'Literal')) record(node.left.property, node.right);
    }
  }).visit(tree.program);
  return result;
}
