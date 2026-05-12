import { describe, expect, it } from 'vitest';
import {
  resolveFieldValues,
  evaluateFieldExpressions,
  applyFactor,
} from '../core/frame-resolver';
import type {
  SendFieldEncodingDef,
  SendFieldValue,
} from '../core/types';
import type { SendVariableProvider } from '../adapters/ports';
import type { VariableMap } from '@/shared/expression/types';

// --- Fake helpers ---

function createFakeVariableProvider(
  vars: Map<string, number | string | boolean>,
): SendVariableProvider {
  return { getVariables: () => vars };
}

function baseField(
  overrides: Partial<SendFieldEncodingDef> = {},
): SendFieldEncodingDef {
  return {
    id: 'field1',
    dataType: 'uint8',
    length: 1,
    bigEndian: true,
    isASCII: false,
    offset: 0,
    factor: 1,
    configurable: false,
    ...overrides,
  };
}

// --- Tests ---

describe('send frame-resolver: resolveFieldValues', () => {
  it('SC2: resolves expression field using variables', () => {
    const field = baseField({
      id: 'computed',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'x + y' }],
        variables: [
          { name: 'x', source: 'external' },
          { name: 'y', source: 'external' },
        ],
      },
    });
    const vars = new Map<string, number | string | boolean>([
      ['x', 10],
      ['y', 20],
    ]);
    const provider = createFakeVariableProvider(vars);

    const { values, issues } = resolveFieldValues(
      [field],
      {},
      provider,
    );

    expect(values['computed']).toBe(30);
    expect(issues).toHaveLength(0);
  });

  it('SC3: expression conditional branch selects correct branch', () => {
    const field = baseField({
      id: 'modeVal',
      configurable: false,
      expressionConfig: {
        expressions: [
          { condition: 'mode == 1', expression: '10' },
          { condition: 'mode == 2', expression: '20' },
          { condition: 'true', expression: '0' },
        ],
        variables: [{ name: 'mode', source: 'external' }],
      },
    });
    const vars = new Map<string, number | string | boolean>([['mode', 2]]);
    const provider = createFakeVariableProvider(vars);

    const { values, issues } = resolveFieldValues([field], {}, provider);

    expect(values['modeVal']).toBe(20);
    expect(issues).toHaveLength(0);
  });

  it('SC4: expression eval failure zero-fills with error issue, does not block other fields', () => {
    const badField = baseField({
      id: 'broken',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'unknownVar' }],
        variables: [],
      },
    });
    const goodField = baseField({
      id: 'good',
      offset: 1,
      configurable: false,
      defaultValue: '42',
    });
    const vars = new Map<string, number | string | boolean>();
    const provider = createFakeVariableProvider(vars);

    const { values, issues } = resolveFieldValues(
      [badField, goodField],
      {},
      provider,
    );

    // broken field should zero-fill
    expect(values['broken']).toBe(0);
    // good field should resolve normally
    expect(values['good']).toBe(42);
    // error issue for broken field
    expect(issues.some((i) => i.fieldId === 'broken' && i.severity === 'error')).toBe(true);
    // no issue for good field
    expect(issues.some((i) => i.fieldId === 'good')).toBe(false);
  });

  it('SC7: defaultValue fallback when no user input and no expression', () => {
    const field = baseField({
      id: 'withDefault',
      configurable: false,
      defaultValue: '100',
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues([field], {}, provider);

    expect(values['withDefault']).toBe(100);
    expect(issues).toHaveLength(0);
  });

  it('SC7: defaultValue string kept when not numeric', () => {
    const field = baseField({
      id: 'strDefault',
      configurable: false,
      defaultValue: 'HELLO',
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues([field], {}, provider);

    expect(values['strDefault']).toBe('HELLO');
    expect(issues).toHaveLength(0);
  });

  it('SC8: zero fill warning when no value source', () => {
    const field = baseField({
      id: 'noVal',
      configurable: false,
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues([field], {}, provider);

    expect(values['noVal']).toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.code).toBe('send.resolve.zeroFill');
    expect(issues[0]!.fieldId).toBe('noVal');
  });

  it('SC14: non-configurable field ignores user input, falls through to expression', () => {
    const field = baseField({
      id: 'fixed',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'val * 2' }],
        variables: [{ name: 'val', source: 'external' }],
      },
    });
    const vars = new Map<string, number | string | boolean>([['val', 5]]);
    const provider = createFakeVariableProvider(vars);

    // User provides a value for a non-configurable field — should be ignored
    const { values, issues } = resolveFieldValues(
      [field],
      { fixed: 999 },
      provider,
    );

    // Expression result, not user value
    expect(values['fixed']).toBe(10);
    expect(issues).toHaveLength(0);
  });

  it('SC14: configurable field uses user value over expression', () => {
    const field = baseField({
      id: 'editable',
      configurable: true,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '42' }],
        variables: [],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [field],
      { editable: 99 },
      provider,
    );

    expect(values['editable']).toBe(99);
    expect(issues).toHaveLength(0);
  });

  it('merges provider variables with caller-supplied variables', () => {
    const field = baseField({
      id: 'merged',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'a + b' }],
        variables: [
          { name: 'a', source: 'external' },
          { name: 'b', source: 'external' },
        ],
      },
    });
    const providerVars = new Map<string, number | string | boolean>([['a', 10]]);
    const provider = createFakeVariableProvider(providerVars);
    const callerVars: VariableMap = new Map([['b', 20]]);

    const { values, issues } = resolveFieldValues(
      [field],
      {},
      provider,
      callerVars,
    );

    expect(values['merged']).toBe(30);
    expect(issues).toHaveLength(0);
  });

  it('caller variables override provider variables', () => {
    const field = baseField({
      id: 'override',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'x' }],
        variables: [{ name: 'x', source: 'external' }],
      },
    });
    const providerVars = new Map<string, number | string | boolean>([['x', 10]]);
    const provider = createFakeVariableProvider(providerVars);
    const callerVars: VariableMap = new Map([['x', 99]]);

    const { values } = resolveFieldValues([field], {}, provider, callerVars);

    expect(values['override']).toBe(99);
  });
});

describe('send frame-resolver: evaluateFieldExpressions', () => {
  it('returns null when field has no expressionConfig', () => {
    const field = baseField({ id: 'noExpr' });
    const vars = new Map<string, number | string | boolean>();

    const { value, issues } = evaluateFieldExpressions(field, vars);

    expect(value).toBeNull();
    expect(issues).toHaveLength(0);
  });

  it('returns compiled value on success', () => {
    const field = baseField({
      id: 'expr',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'a + b' }],
        variables: [
          { name: 'a', source: 'external' },
          { name: 'b', source: 'external' },
        ],
      },
    });
    const vars = new Map<string, number | string | boolean>([
      ['a', 3],
      ['b', 4],
    ]);

    const { value, issues } = evaluateFieldExpressions(field, vars);

    expect(value).toBe(7);
    expect(issues).toHaveLength(0);
  });

  it('returns null with error issue on compile failure', () => {
    const field = baseField({
      id: 'badExpr',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '1 +' }],
        variables: [],
      },
    });
    const vars = new Map<string, number | string | boolean>();

    const { value, issues } = evaluateFieldExpressions(field, vars);

    expect(value).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toBe('send.resolve.expressionCompile');
  });

  it('returns null with error issue on eval failure (undefined variable)', () => {
    const field = baseField({
      id: 'missingVar',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'nonexistent' }],
        variables: [{ name: 'nonexistent', source: 'external' }],
      },
    });
    const vars = new Map<string, number | string | boolean>();

    const { value, issues } = evaluateFieldExpressions(field, vars);

    expect(value).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.code).toBe('send.resolve.expressionEval');
  });
});

describe('send frame-resolver: applyFactor', () => {
  it('SC5: factor inverse — factor=0.1, user input 25.5, rawValue = 255', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'temp', dataType: 'uint16', factor: 0.1 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { temp: 25.5 };

    const { values, issues } = applyFactor(fields, fieldValues);

    expect(values['temp']).toBeCloseTo(255, 5);
    expect(issues).toHaveLength(0);
  });

  it('SC6: factor=1 passes through unchanged', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'raw', factor: 1 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { raw: 42 };

    const { values, issues } = applyFactor(fields, fieldValues);

    expect(values['raw']).toBe(42);
    expect(issues).toHaveLength(0);
  });

  it('bytes type passes through unchanged regardless of factor', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'rawBytes', dataType: 'bytes', length: 2, factor: 0.5 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = {
      rawBytes: '0xDEAD',
    };

    const { values, issues } = applyFactor(fields, fieldValues);

    expect(values['rawBytes']).toBe('0xDEAD');
    expect(issues).toHaveLength(0);
  });

  it('handles string numeric values', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'strNum', factor: 2 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { strNum: '100' };

    const { values } = applyFactor(fields, fieldValues);

    expect(values['strNum']).toBe(50);
  });

  it('handles missing field value gracefully (zero)', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'missing' }),
    ];
    const fieldValues: Record<string, SendFieldValue> = {};

    const { values } = applyFactor(fields, fieldValues);

    expect(values['missing']).toBe(0);
  });
});
