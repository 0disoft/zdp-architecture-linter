export function stripCommentsAndStringLiterals(source: string): string {
  let result = '';
  let index = 0;
  let state:
    | 'code'
    | 'singleQuotedString'
    | 'doubleQuotedString'
    | 'templateString'
    | 'lineComment'
    | 'blockComment' = 'code';
  let templateExpressionDepth = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        result += '  ';
        index += 2;
        state = 'lineComment';
        continue;
      }

      if (char === '/' && next === '*') {
        result += '  ';
        index += 2;
        state = 'blockComment';
        continue;
      }

      if (char === '/' && canStartRegexLiteral(source, index)) {
        const regexEnd = readRegexLiteralEnd(source, index);

        if (regexEnd !== null) {
          result += maskSourceSlice(source.slice(index, regexEnd));
          index = regexEnd;
          state = 'code';
          continue;
        }
      }

      if (char === "'") {
        result += ' ';
        index += 1;
        state = 'singleQuotedString';
        continue;
      }

      if (char === '"') {
        result += ' ';
        index += 1;
        state = 'doubleQuotedString';
        continue;
      }

      if (char === '`') {
        result += ' ';
        index += 1;
        state = 'templateString';
        continue;
      }

      if (templateExpressionDepth > 0 && char === '{') {
        result += char;
        index += 1;
        templateExpressionDepth += 1;
        continue;
      }

      if (templateExpressionDepth > 0 && char === '}') {
        result += ' ';
        index += 1;
        templateExpressionDepth -= 1;

        if (templateExpressionDepth === 0) {
          state = 'templateString';
        }

        continue;
      }

      result += char;
      index += 1;
      continue;
    }

    if (state === 'templateString') {
      if (char === '\\') {
        result += next === '\n' ? ' \n' : '  ';
        index += next === undefined ? 1 : 2;
        continue;
      }

      if (char === '`') {
        result += ' ';
        index += 1;
        state = 'code';
        continue;
      }

      if (char === '$' && next === '{') {
        result += '  ';
        index += 2;
        state = 'code';
        templateExpressionDepth += 1;
        continue;
      }

      result += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    if (state === 'lineComment') {
      if (char === '\n') {
        result += '\n';
        index += 1;
        state = 'code';
        continue;
      }

      result += ' ';
      index += 1;
      continue;
    }

    if (state === 'blockComment') {
      if (char === '*' && next === '/') {
        result += '  ';
        index += 2;
        state = 'code';
        continue;
      }

      result += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    const closingQuote =
      state === 'singleQuotedString'
        ? "'"
        : '"';

    if (char === '\\') {
      result += next === '\n' ? ' \n' : '  ';
      index += next === undefined ? 1 : 2;
      continue;
    }

    if (char === closingQuote) {
      result += ' ';
      index += 1;
      state = 'code';
      continue;
    }

    result += char === '\n' ? '\n' : ' ';
    index += 1;
  }

  return result;
}

function canStartRegexLiteral(source: string, startIndex: number): boolean {
  let index = startIndex - 1;

  while (index >= 0 && /\s/.test(source[index] ?? '')) {
    index -= 1;
  }

  if (index < 0) {
    return true;
  }

  const previous = source[index];
  if (previous !== undefined && '([{=,:;!&|?+-*~^<>'.includes(previous)) {
    return true;
  }

  if (!isIdentifierPart(previous)) {
    return false;
  }

  let wordStart = index;
  while (wordStart > 0 && isIdentifierPart(source[wordStart - 1])) {
    wordStart -= 1;
  }

  return [
    'await',
    'case',
    'delete',
    'in',
    'instanceof',
    'return',
    'throw',
    'typeof',
    'void',
    'yield'
  ].includes(source.slice(wordStart, index + 1));
}

function readRegexLiteralEnd(source: string, startIndex: number): number | null {
  let index = startIndex + 1;
  let inCharacterClass = false;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '\n' || char === '\r') {
      return null;
    }

    if (char === '\\') {
      index += next === undefined ? 1 : 2;
      continue;
    }

    if (inCharacterClass) {
      if (char === ']') {
        inCharacterClass = false;
      }

      index += 1;
      continue;
    }

    if (char === '[') {
      inCharacterClass = true;
      index += 1;
      continue;
    }

    if (char === '/') {
      index += 1;

      while (isIdentifierPart(source[index])) {
        index += 1;
      }

      return index;
    }

    index += 1;
  }

  return null;
}

function maskSourceSlice(source: string): string {
  return source.replace(/[^\n]/g, ' ');
}

export function extractTestCallNames(source: string): readonly string[] {
  const names: string[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '/' && next === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }

    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index + 2);
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      index = skipStringLiteral(source, index);
      continue;
    }

    if (!isIdentifierStart(char)) {
      index += 1;
      continue;
    }

    const identifier = readIdentifier(source, index);
    if (identifier.value !== 'test' && identifier.value !== 'it') {
      index = identifier.end;
      continue;
    }

    const call = readTestCallName(source, identifier.end);
    if (call === null) {
      index = identifier.end;
      continue;
    }

    names.push(call.name);
    index = call.end;
  }

  return names;
}

function readTestCallName(
  source: string,
  startIndex: number
): { readonly name: string; readonly end: number } | null {
  let index = skipWhitespace(source, startIndex);

  if (source[index] === '.') {
    index = skipWhitespace(source, index + 1);
    const modifier = readIdentifier(source, index);
    if (
      modifier.value !== 'only' &&
      modifier.value !== 'skip' &&
      modifier.value !== 'todo'
    ) {
      return null;
    }

    index = skipWhitespace(source, modifier.end);
  }

  if (source[index] !== '(') {
    return null;
  }

  index = skipWhitespace(source, index + 1);
  const literal = readStringLiteral(source, index);
  if (literal === null) {
    return null;
  }

  return literal;
}

function readStringLiteral(
  source: string,
  startIndex: number
): { readonly name: string; readonly end: number } | null {
  const quote = source[startIndex];
  if (quote !== "'" && quote !== '"' && quote !== '`') {
    return null;
  }

  let value = '';
  let index = startIndex + 1;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (char === '\\') {
      if (next !== undefined) {
        value += next;
      }

      index += next === undefined ? 1 : 2;
      continue;
    }

    if (char === quote) {
      return {
        name: value,
        end: index + 1
      };
    }

    value += char;
    index += 1;
  }

  return null;
}

function skipStringLiteral(source: string, startIndex: number): number {
  const literal = readStringLiteral(source, startIndex);
  return literal?.end ?? source.length;
}

function skipLineComment(source: string, startIndex: number): number {
  let index = startIndex;

  while (index < source.length && source[index] !== '\n') {
    index += 1;
  }

  return index;
}

function skipBlockComment(source: string, startIndex: number): number {
  let index = startIndex;

  while (index < source.length) {
    if (source[index] === '*' && source[index + 1] === '/') {
      return index + 2;
    }

    index += 1;
  }

  return source.length;
}

function skipWhitespace(source: string, startIndex: number): number {
  let index = startIndex;

  while (index < source.length && /\s/.test(source[index] ?? '')) {
    index += 1;
  }

  return index;
}

function readIdentifier(
  source: string,
  startIndex: number
): { readonly value: string; readonly end: number } {
  let index = startIndex;

  while (index < source.length && isIdentifierPart(source[index])) {
    index += 1;
  }

  return {
    value: source.slice(startIndex, index),
    end: index
  };
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}
