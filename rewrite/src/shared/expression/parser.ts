import type { Token, ASTNode, BinaryOp, ParseResult } from './_internal';

export function parse(tokens: readonly Token[]): ParseResult {
  let pos = 0;
  const last = tokens[tokens.length - 1]!;

  const peek = (): Token => tokens[pos] ?? last;
  const advance = (): Token => tokens[pos++] ?? last;

  function expect(type: string): Token | null {
    if (peek().type !== type) return null;
    return advance();
  }

  function parseExpr(): ParseResult { return parseOr(); }

  function parseOr(): ParseResult {
    let left = parseAnd();
    if (!left.success) return left;
    while (peek().type === 'OR') {
      advance();
      const right = parseAnd();
      if (!right.success) return right;
      left = { success: true, ast: { type: 'binary', op: '||', left: left.ast, right: right.ast } };
    }
    return left;
  }

  function parseAnd(): ParseResult {
    let left = parseComp();
    if (!left.success) return left;
    while (peek().type === 'AND') {
      advance();
      const right = parseComp();
      if (!right.success) return right;
      left = { success: true, ast: { type: 'binary', op: '&&', left: left.ast, right: right.ast } };
    }
    return left;
  }

  function parseComp(): ParseResult {
    const left = parseAdd();
    if (!left.success) return left;
    const opMap: Record<string, BinaryOp> = {
      EQ: '==', NEQ: '!=', GT: '>', LT: '<', GTE: '>=', LTE: '<=',
    };
    const op = opMap[peek().type];
    if (!op) return left;
    advance();
    const right = parseAdd();
    if (!right.success) return right;
    return { success: true, ast: { type: 'binary', op, left: left.ast, right: right.ast } };
  }

  function parseAdd(): ParseResult {
    let left = parseMul();
    if (!left.success) return left;
    while (peek().type === 'PLUS' || peek().type === 'MINUS') {
      const op: BinaryOp = advance().type === 'PLUS' ? '+' : '-';
      const right = parseMul();
      if (!right.success) return right;
      left = { success: true, ast: { type: 'binary', op, left: left.ast, right: right.ast } };
    }
    return left;
  }

  function parseMul(): ParseResult {
    let left = parseUnary();
    if (!left.success) return left;
    const opMap: Record<string, BinaryOp> = { STAR: '*', SLASH: '/', PERCENT: '%' };
    while (opMap[peek().type]) {
      const op = opMap[advance().type]!;
      const right = parseUnary();
      if (!right.success) return right;
      left = { success: true, ast: { type: 'binary', op, left: left.ast, right: right.ast } };
    }
    return left;
  }

  function parseUnary(): ParseResult {
    if (peek().type === 'MINUS') {
      advance();
      const operand = parseUnary();
      if (!operand.success) return operand;
      return { success: true, ast: { type: 'unary', op: '-', operand: operand.ast } };
    }
    if (peek().type === 'NOT') {
      advance();
      const operand = parseUnary();
      if (!operand.success) return operand;
      return { success: true, ast: { type: 'unary', op: '!', operand: operand.ast } };
    }
    return parsePrimary();
  }

  function parsePrimary(): ParseResult {
    const tok = peek();

    if (tok.type === 'NUMBER') {
      advance();
      return { success: true, ast: { type: 'number', value: tok.value as number } };
    }
    if (tok.type === 'STRING') {
      advance();
      return { success: true, ast: { type: 'string', value: tok.value as string } };
    }
    if (tok.type === 'BOOLEAN') {
      advance();
      return { success: true, ast: { type: 'boolean', value: tok.value as boolean } };
    }
    if (tok.type === 'IDENTIFIER') {
      advance();
      const name = tok.value as string;
      if (peek().type === 'LPAREN') {
        advance();
        const args: ASTNode[] = [];
        if (peek().type !== 'RPAREN') {
          const first = parseExpr();
          if (!first.success) return first;
          args.push(first.ast);
          while (peek().type === 'COMMA') {
            advance();
            const next = parseExpr();
            if (!next.success) return next;
            args.push(next.ast);
          }
        }
        if (!expect('RPAREN')) {
          return { success: false, error: 'expected )', position: peek().pos };
        }
        return { success: true, ast: { type: 'call', name, args } };
      }
      return { success: true, ast: { type: 'variable', name } };
    }
    if (tok.type === 'LPAREN') {
      advance();
      const inner = parseExpr();
      if (!inner.success) return inner;
      if (!expect('RPAREN')) {
        return { success: false, error: 'expected )', position: peek().pos };
      }
      return inner;
    }

    return { success: false, error: `unexpected token: ${tok.type}`, position: tok.pos };
  }

  const result = parseExpr();
  if (!result.success) return result;
  if (peek().type !== 'EOF') {
    return { success: false, error: 'unexpected token after expression', position: peek().pos };
  }
  return result;
}
