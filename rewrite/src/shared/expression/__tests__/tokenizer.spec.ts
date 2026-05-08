import { describe, expect, it } from 'vitest';
import { tokenize } from '../tokenizer';

describe('tokenizer', () => {
  describe('numbers', () => {
    it('tokenizes integers', () => {
      const r = tokenize('42');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens).toEqual([
        { type: 'NUMBER', value: 42, pos: 0 },
        { type: 'EOF', pos: 2 },
      ]);
    });

    it('tokenizes decimals', () => {
      const r = tokenize('0.299792458');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'NUMBER', value: 0.299792458, pos: 0 });
    });

    it('tokenizes large integers', () => {
      const r = tokenize('13743895344000');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'NUMBER', value: 13743895344000, pos: 0 });
    });

    it('tokenizes scientific notation', () => {
      const r = tokenize('1.5e10');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'NUMBER', value: 1.5e10, pos: 0 });
    });

    it('tokenizes scientific notation with negative exponent', () => {
      const r = tokenize('3E-4');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'NUMBER', value: 3e-4, pos: 0 });
    });
  });

  describe('strings', () => {
    it('tokenizes single-quoted strings', () => {
      const r = tokenize("'RS编码'");
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'STRING', value: 'RS编码', pos: 0 });
    });

    it('reports unterminated string', () => {
      const r = tokenize("'hello");
      expect(r.success).toBe(false);
      if (!r.success) expect(r.position).toBe(0);
    });
  });

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const r = tokenize('var1');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'IDENTIFIER', value: 'var1', pos: 0 });
    });

    it('tokenizes Chinese identifiers', () => {
      const r = tokenize('速度');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'IDENTIFIER', value: '速度', pos: 0 });
    });

    it('tokenizes underscore-prefixed identifiers', () => {
      const r = tokenize('_temp');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'IDENTIFIER', value: '_temp', pos: 0 });
    });
  });

  describe('boolean literals', () => {
    it('tokenizes true', () => {
      const r = tokenize('true');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'BOOLEAN', value: true, pos: 0 });
    });

    it('tokenizes false', () => {
      const r = tokenize('false');
      expect(r.success).toBe(true);
      if (!r.success) return;
      expect(r.tokens[0]).toEqual({ type: 'BOOLEAN', value: false, pos: 0 });
    });
  });

  describe('operators', () => {
    it('tokenizes arithmetic operators', () => {
      const r = tokenize('+ - * / %');
      expect(r.success).toBe(true);
      if (!r.success) return;
      const types = r.tokens.map(t => t.type);
      expect(types).toEqual(['PLUS', 'MINUS', 'STAR', 'SLASH', 'PERCENT', 'EOF']);
    });

    it('tokenizes comparison operators', () => {
      const r = tokenize('== != > < >= <=');
      expect(r.success).toBe(true);
      if (!r.success) return;
      const types = r.tokens.map(t => t.type);
      expect(types).toEqual(['EQ', 'NEQ', 'GT', 'LT', 'GTE', 'LTE', 'EOF']);
    });

    it('tokenizes logical operators', () => {
      const r = tokenize('&& || !');
      expect(r.success).toBe(true);
      if (!r.success) return;
      const types = r.tokens.map(t => t.type);
      expect(types).toEqual(['AND', 'OR', 'NOT', 'EOF']);
    });
  });

  describe('punctuation', () => {
    it('tokenizes parentheses and comma', () => {
      const r = tokenize('(a, b)');
      expect(r.success).toBe(true);
      if (!r.success) return;
      const types = r.tokens.map(t => t.type);
      expect(types).toEqual(['LPAREN', 'IDENTIFIER', 'COMMA', 'IDENTIFIER', 'RPAREN', 'EOF']);
    });
  });

  describe('complex expressions', () => {
    it('tokenizes mixed expression', () => {
      const r = tokenize('(var1 + var2) * 0.299792458 / 1000000');
      expect(r.success).toBe(true);
    });

    it('tokenizes Chinese expression with large numbers', () => {
      const r = tokenize('13743895344000 / 299792458 * 速度');
      expect(r.success).toBe(true);
    });

    it('tokenizes function call', () => {
      const r = tokenize('pow(x, 2)');
      expect(r.success).toBe(true);
    });
  });

  describe('errors', () => {
    it('reports unexpected character', () => {
      const r = tokenize('var @ 5');
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error).toContain('unexpected character');
        expect(r.position).toBe(4);
      }
    });
  });
});
