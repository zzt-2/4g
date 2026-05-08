// Internal types shared by expression modules — NOT part of public API.
// Do not import from outside expression/.

export type TokenType =
  | 'NUMBER' | 'STRING' | 'IDENTIFIER' | 'BOOLEAN'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT'
  | 'EQ' | 'NEQ' | 'GT' | 'LT' | 'GTE' | 'LTE'
  | 'AND' | 'OR' | 'NOT'
  | 'LPAREN' | 'RPAREN' | 'COMMA'
  | 'EOF';

export interface Token {
  readonly type: TokenType;
  readonly value?: string | number | boolean;
  readonly pos: number;
}

export type TokenizeResult =
  | { readonly success: true; readonly tokens: readonly Token[] }
  | { readonly success: false; readonly error: string; readonly position: number };

export type BinaryOp = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '>' | '<' | '>=' | '<=' | '&&' | '||';
export type UnaryOp = '-' | '!';

export type ASTNode =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'variable'; readonly name: string }
  | { readonly type: 'binary'; readonly op: BinaryOp; readonly left: ASTNode; readonly right: ASTNode }
  | { readonly type: 'unary'; readonly op: UnaryOp; readonly operand: ASTNode }
  | { readonly type: 'call'; readonly name: string; readonly args: readonly ASTNode[] };

export type ParseResult =
  | { readonly success: true; readonly ast: ASTNode }
  | { readonly success: false; readonly error: string; readonly position: number };
