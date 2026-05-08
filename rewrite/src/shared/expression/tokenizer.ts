import type { Token, TokenizeResult } from './_internal';

function isIdentStart(ch: string): boolean {
  return ch === '_' || /\p{ID_Start}/u.test(ch);
}

function isIdentContinue(ch: string): boolean {
  return ch === '_' || ch === '$' || /\p{ID_Continue}/u.test(ch);
}

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    const ch = input[pos]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      pos++;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      const start = pos;
      while (pos < input.length && input[pos]! >= '0' && input[pos]! <= '9') pos++;
      if (pos < input.length && input[pos]! === '.') {
        pos++;
        while (pos < input.length && input[pos]! >= '0' && input[pos]! <= '9') pos++;
      }
      if (pos < input.length && (input[pos]! === 'e' || input[pos]! === 'E')) {
        pos++;
        if (pos < input.length && (input[pos]! === '+' || input[pos]! === '-')) pos++;
        while (pos < input.length && input[pos]! >= '0' && input[pos]! <= '9') pos++;
      }
      tokens.push({ type: 'NUMBER', value: Number(input.slice(start, pos)), pos: start });
      continue;
    }

    if (ch === "'") {
      const start = pos;
      pos++;
      let value = '';
      while (pos < input.length && input[pos]! !== "'") {
        value += input[pos]!;
        pos++;
      }
      if (pos >= input.length) {
        return { success: false, error: 'unterminated string', position: start };
      }
      pos++;
      tokens.push({ type: 'STRING', value, pos: start });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = pos;
      while (pos < input.length && isIdentContinue(input[pos]!)) pos++;
      const name = input.slice(start, pos);
      if (name === 'true') {
        tokens.push({ type: 'BOOLEAN', value: true, pos: start });
      } else if (name === 'false') {
        tokens.push({ type: 'BOOLEAN', value: false, pos: start });
      } else {
        tokens.push({ type: 'IDENTIFIER', value: name, pos: start });
      }
      continue;
    }

    if (pos + 1 < input.length) {
      const two = input[pos]! + input[pos + 1]!;
      let type: string | undefined;
      switch (two) {
        case '==': type = 'EQ'; break;
        case '!=': type = 'NEQ'; break;
        case '>=': type = 'GTE'; break;
        case '<=': type = 'LTE'; break;
        case '&&': type = 'AND'; break;
        case '||': type = 'OR'; break;
      }
      if (type) {
        tokens.push({ type: type as Token['type'], pos });
        pos += 2;
        continue;
      }
    }

    switch (ch) {
      case '+': tokens.push({ type: 'PLUS', pos }); pos++; continue;
      case '-': tokens.push({ type: 'MINUS', pos }); pos++; continue;
      case '*': tokens.push({ type: 'STAR', pos }); pos++; continue;
      case '/': tokens.push({ type: 'SLASH', pos }); pos++; continue;
      case '%': tokens.push({ type: 'PERCENT', pos }); pos++; continue;
      case '>': tokens.push({ type: 'GT', pos }); pos++; continue;
      case '<': tokens.push({ type: 'LT', pos }); pos++; continue;
      case '!': tokens.push({ type: 'NOT', pos }); pos++; continue;
      case '(': tokens.push({ type: 'LPAREN', pos }); pos++; continue;
      case ')': tokens.push({ type: 'RPAREN', pos }); pos++; continue;
      case ',': tokens.push({ type: 'COMMA', pos }); pos++; continue;
    }

    return { success: false, error: `unexpected character: '${ch}'`, position: pos };
  }

  tokens.push({ type: 'EOF', pos });
  return { success: true, tokens };
}
