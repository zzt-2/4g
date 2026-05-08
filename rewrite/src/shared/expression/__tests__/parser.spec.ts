import { describe, expect, it } from 'vitest';
import { tokenize } from '../tokenizer';
import { parse } from '../parser';

function parseExpr(text: string) {
  const tokens = tokenize(text);
  if (!tokens.success) return tokens;
  return parse(tokens.tokens);
}

describe('parser', () => {
  describe('literals', () => {
    it('parses number literal', () => {
      const r = parseExpr('42');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({ type: 'number', value: 42 });
    });

    it('parses string literal', () => {
      const r = parseExpr("'hello'");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({ type: 'string', value: 'hello' });
    });

    it('parses boolean true', () => {
      const r = parseExpr('true');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('variables', () => {
    it('parses variable reference', () => {
      const r = parseExpr('var1');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({ type: 'variable', name: 'var1' });
    });

    it('parses Chinese variable', () => {
      const r = parseExpr('速度');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({ type: 'variable', name: '速度' });
    });
  });

  describe('binary operations', () => {
    it('parses addition', () => {
      const r = parseExpr('1 + 2');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'binary', op: '+',
        left: { type: 'number', value: 1 },
        right: { type: 'number', value: 2 },
      });
    });

    it('respects operator precedence: * before +', () => {
      const r = parseExpr('1 + 2 * 3');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'binary', op: '+',
        left: { type: 'number', value: 1 },
        right: {
          type: 'binary', op: '*',
          left: { type: 'number', value: 2 },
          right: { type: 'number', value: 3 },
        },
      });
    });

    it('handles left-to-right associativity', () => {
      const r = parseExpr('10 - 3 - 2');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'binary', op: '-',
        left: {
          type: 'binary', op: '-',
          left: { type: 'number', value: 10 },
          right: { type: 'number', value: 3 },
        },
        right: { type: 'number', value: 2 },
      });
    });
  });

  describe('comparisons', () => {
    it('parses equality', () => {
      const r = parseExpr('速率 == 0');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('binary');
      if (r.ast.type !== 'binary') return;
      expect(r.ast.op).toBe('==');
    });

    it('parses inequality', () => {
      const r = parseExpr('a != b');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('binary');
      if (r.ast.type !== 'binary') return;
      expect(r.ast.op).toBe('!=');
    });
  });

  describe('logical operators', () => {
    it('parses AND', () => {
      const r = parseExpr('a > 0 && b < 100');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('binary');
      if (r.ast.type !== 'binary') return;
      expect(r.ast.op).toBe('&&');
    });

    it('parses OR', () => {
      const r = parseExpr('a == 1 || b == 2');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('binary');
      if (r.ast.type !== 'binary') return;
      expect(r.ast.op).toBe('||');
    });
  });

  describe('unary operators', () => {
    it('parses unary minus on number', () => {
      const r = parseExpr('-5');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'unary', op: '-',
        operand: { type: 'number', value: 5 },
      });
    });

    it('parses unary minus on variable', () => {
      const r = parseExpr('-速度');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'unary', op: '-',
        operand: { type: 'variable', name: '速度' },
      });
    });

    it('parses unary minus in parentheses', () => {
      const r = parseExpr('(-速度)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'unary', op: '-',
        operand: { type: 'variable', name: '速度' },
      });
    });

    it('parses unary minus with addition', () => {
      const r = parseExpr('-5 + 速度');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('binary');
      if (r.ast.type !== 'binary') return;
      expect(r.ast.op).toBe('+');
      expect(r.ast.left).toEqual({ type: 'unary', op: '-', operand: { type: 'number', value: 5 } });
    });

    it('parses logical NOT', () => {
      const r = parseExpr('!a');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'unary', op: '!',
        operand: { type: 'variable', name: 'a' },
      });
    });
  });

  describe('function calls', () => {
    it('parses function with one argument', () => {
      const r = parseExpr('abs(x)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'call', name: 'abs',
        args: [{ type: 'variable', name: 'x' }],
      });
    });

    it('parses function with two arguments', () => {
      const r = parseExpr('pow(x, 2)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'call', name: 'pow',
        args: [{ type: 'variable', name: 'x' }, { type: 'number', value: 2 }],
      });
    });

    it('parses nested function calls', () => {
      const r = parseExpr('pow(sqrt(x), 2)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast.type).toBe('call');
      if (r.ast.type !== 'call') return;
      expect(r.ast.name).toBe('pow');
      expect(r.ast.args[0].type).toBe('call');
    });
  });

  describe('parenthesized expressions', () => {
    it('parses parenthesized expression', () => {
      const r = parseExpr('(1 + 2) * 3');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.ast).toEqual({
        type: 'binary', op: '*',
        left: {
          type: 'binary', op: '+',
          left: { type: 'number', value: 1 },
          right: { type: 'number', value: 2 },
        },
        right: { type: 'number', value: 3 },
      });
    });
  });

  describe('real expression samples', () => {
    it('parses: (距离 * 1000 - 帧数 * 帧距) / 采样时钟对应距离', () => {
      const r = parseExpr('(距离 * 1000 - 帧数 * 帧距) / 采样时钟对应距离');
      expect(r.success).toBe(true);
    });

    it('parses: 13743895344000 / 299792458 * 速度', () => {
      const r = parseExpr('13743895344000 / 299792458 * 速度');
      expect(r.success).toBe(true);
    });

    it('parses: 模式 == \'RS编码\'', () => {
      const r = parseExpr("模式 == 'RS编码'");
      expect(r.success).toBe(true);
    });
  });

  describe('errors', () => {
    it('reports error for incomplete expression', () => {
      const r = parseExpr('var1 +');
      expect(r.success).toBe(false);
      if (!r.success) expect(r.position).toBeDefined();
    });

    it('reports error for missing closing paren', () => {
      const r = parseExpr('(1 + 2');
      expect(r.success).toBe(false);
    });

    it('reports error for unexpected token', () => {
      const r = parseExpr(', + 1');
      expect(r.success).toBe(false);
    });
  });
});
