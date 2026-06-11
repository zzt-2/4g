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
  it('resolves expression field using provider variables', () => {
    const field = baseField({
      id: 'computed',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'x + y' }],
        variables: [
          { identifier: 'x', sourceType: 'external' },
          { identifier: 'y', sourceType: 'external' },
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

  it('expression conditional branch selects correct branch', () => {
    const field = baseField({
      id: 'modeVal',
      configurable: false,
      expressionConfig: {
        expressions: [
          { condition: 'mode == 1', expression: '10' },
          { condition: 'mode == 2', expression: '20' },
          { condition: 'true', expression: '0' },
        ],
        variables: [{ identifier: 'mode', sourceType: 'external' }],
      },
    });
    const vars = new Map<string, number | string | boolean>([['mode', 2]]);
    const provider = createFakeVariableProvider(vars);

    const { values, issues } = resolveFieldValues([field], {}, provider);

    expect(values['modeVal']).toBe(20);
    expect(issues).toHaveLength(0);
  });

  it('expression eval failure zero-fills with error issue, does not block other fields', () => {
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

    expect(values['broken']).toBe(0);
    expect(values['good']).toBe(42);
    expect(issues.some((i) => i.fieldId === 'broken' && i.severity === 'error')).toBe(true);
    expect(issues.some((i) => i.fieldId === 'good')).toBe(false);
  });

  it('defaultValue fallback when no user input and no expression', () => {
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

  it('defaultValue string kept when not numeric', () => {
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

  it('zero fill warning when no value source', () => {
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

  it('non-configurable field ignores user input, falls through to expression', () => {
    const field = baseField({
      id: 'fixed',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'val * 2' }],
        variables: [{ identifier: 'val', sourceType: 'external' }],
      },
    });
    const vars = new Map<string, number | string | boolean>([['val', 5]]);
    const provider = createFakeVariableProvider(vars);

    const { values, issues } = resolveFieldValues(
      [field],
      { fixed: 999 },
      provider,
    );

    expect(values['fixed']).toBe(10);
    expect(issues).toHaveLength(0);
  });

  it('configurable field uses user value over expression', () => {
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
          { identifier: 'a', sourceType: 'external' },
          { identifier: 'b', sourceType: 'external' },
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
        variables: [{ identifier: 'x', sourceType: 'external' }],
      },
    });
    const providerVars = new Map<string, number | string | boolean>([['x', 10]]);
    const provider = createFakeVariableProvider(providerVars);
    const callerVars: VariableMap = new Map([['x', 99]]);

    const { values } = resolveFieldValues([field], {}, provider, callerVars);

    expect(values['override']).toBe(99);
  });

  it('resolves current_field variables from earlier field values', () => {
    const sourceField = baseField({
      id: 'src-field',
      configurable: true,
    });
    const exprField = baseField({
      id: 'computed',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'var1 + 1' }],
        variables: [
          { identifier: 'var1', sourceType: 'current_field', sourceId: 'src-field' },
        ],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [sourceField, exprField],
      { 'src-field': 5 },
      provider,
    );

    expect(values['computed']).toBe(6);
    expect(issues).toHaveLength(0);
  });

  it('resolves chained current_field expressions where later field depends on earlier expression result', () => {
    const sourceField = baseField({
      id: 'input',
      configurable: true,
    });
    const midField = baseField({
      id: 'mid',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'v * 2' }],
        variables: [
          { identifier: 'v', sourceType: 'current_field', sourceId: 'input' },
        ],
      },
    });
    const finalField = baseField({
      id: 'final',
      offset: 2,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'm + 10' }],
        variables: [
          { identifier: 'm', sourceType: 'current_field', sourceId: 'mid' },
        ],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [sourceField, midField, finalField],
      { input: 3 },
      provider,
    );

    expect(values['mid']).toBe(6);
    expect(values['final']).toBe(16);
    expect(issues).toHaveLength(0);
  });

  it('warns when current_field source has no value yet', () => {
    const exprField = baseField({
      id: 'computed',
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'var1' }],
        variables: [
          { identifier: 'var1', sourceType: 'current_field', sourceId: 'missing-source' },
        ],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues([exprField], {}, provider);

    expect(values['computed']).toBe(0);
    expect(issues.some((i) => i.code === 'send.resolve.variableSourceMissing')).toBe(true);
    expect(issues.some((i) => i.severity === 'error' && i.code === 'send.resolve.expressionEval')).toBe(true);
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
          { identifier: 'a', sourceType: 'external' },
          { identifier: 'b', sourceType: 'external' },
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

  it('resolves current_field sourceId from merged variables', () => {
    const field = baseField({
      id: 'expr',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'var1 + 1' }],
        variables: [
          { identifier: 'var1', sourceType: 'current_field', sourceId: 'sourceField' },
        ],
      },
    });
    const vars = new Map<string, number | string | boolean>([['sourceField', 9]]);

    const { value, issues } = evaluateFieldExpressions(field, vars);

    expect(value).toBe(10);
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
        variables: [{ identifier: 'nonexistent', sourceType: 'external' }],
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
  it('factor inverse — factor=0.1, user input 25.5, rawValue = 255', () => {
    const fields: readonly SendFieldEncodingDef[] = [
      baseField({ id: 'temp', dataType: 'uint16', factor: 0.1 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { temp: 25.5 };

    const { values, issues } = applyFactor(fields, fieldValues);

    expect(values['temp']).toBeCloseTo(255, 5);
    expect(issues).toHaveLength(0);
  });

  it('factor=1 passes through unchanged', () => {
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

describe('send frame-resolver: topological sort', () => {
  it('evaluates expression B before A when A depends on B', () => {
    const fieldA = baseField({
      id: 'fieldA',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'val + 5' }],
        variables: [
          { identifier: 'val', sourceType: 'current_field', sourceId: 'fieldB' },
        ],
      },
    });
    const fieldB = baseField({
      id: 'fieldB',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '10' }],
        variables: [],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    // Definition order: A before B, but A depends on B
    const { values, issues } = resolveFieldValues(
      [fieldA, fieldB],
      {},
      provider,
    );

    expect(values['fieldB']).toBe(10);
    expect(values['fieldA']).toBe(15);
    expect(issues).toHaveLength(0);
  });

  it('evaluates multi-level chain A→B→C in correct order', () => {
    const fieldA = baseField({
      id: 'fieldA',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'b + 1' }],
        variables: [
          { identifier: 'b', sourceType: 'current_field', sourceId: 'fieldB' },
        ],
      },
    });
    const fieldB = baseField({
      id: 'fieldB',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'c * 2' }],
        variables: [
          { identifier: 'c', sourceType: 'current_field', sourceId: 'fieldC' },
        ],
      },
    });
    const fieldC = baseField({
      id: 'fieldC',
      offset: 2,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '5' }],
        variables: [],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    // Definition order: A, B, C — all reversed dependency order
    const { values, issues } = resolveFieldValues(
      [fieldA, fieldB, fieldC],
      {},
      provider,
    );

    expect(values['fieldC']).toBe(5);
    expect(values['fieldB']).toBe(10);
    expect(values['fieldA']).toBe(11);
    expect(issues).toHaveLength(0);
  });

  it('preserves original order when no dependencies between expressions', () => {
    const fieldX = baseField({
      id: 'fieldX',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '3' }],
        variables: [],
      },
    });
    const fieldY = baseField({
      id: 'fieldY',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '7' }],
        variables: [],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [fieldX, fieldY],
      {},
      provider,
    );

    expect(values['fieldX']).toBe(3);
    expect(values['fieldY']).toBe(7);
    expect(issues).toHaveLength(0);
  });
});

describe('send frame-resolver: cycle detection', () => {
  it('detects circular dependency between two expression fields', () => {
    const fieldA = baseField({
      id: 'fieldA',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'v' }],
        variables: [
          { identifier: 'v', sourceType: 'current_field', sourceId: 'fieldB' },
        ],
      },
    });
    const fieldB = baseField({
      id: 'fieldB',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'v' }],
        variables: [
          { identifier: 'v', sourceType: 'current_field', sourceId: 'fieldA' },
        ],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [fieldA, fieldB],
      {},
      provider,
    );

    expect(
      issues.some(
        (i) =>
          i.code === 'send.resolve.expressionCycle' && i.severity === 'error',
      ),
    ).toBe(true);
    // Cycle fields still get a value (no infinite loop)
    expect(values['fieldA']).toBeDefined();
    expect(values['fieldB']).toBeDefined();
  });

  it('still evaluates non-cycle expression fields normally when cycle exists', () => {
    const fieldA = baseField({
      id: 'fieldA',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'v' }],
        variables: [
          { identifier: 'v', sourceType: 'current_field', sourceId: 'fieldB' },
        ],
      },
    });
    const fieldB = baseField({
      id: 'fieldB',
      offset: 1,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'v' }],
        variables: [
          { identifier: 'v', sourceType: 'current_field', sourceId: 'fieldA' },
        ],
      },
    });
    const fieldC = baseField({
      id: 'fieldC',
      offset: 2,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '42' }],
        variables: [],
      },
    });
    const provider = createFakeVariableProvider(new Map());

    const { values, issues } = resolveFieldValues(
      [fieldA, fieldB, fieldC],
      {},
      provider,
    );

    expect(values['fieldC']).toBe(42);
    expect(
      issues.some((i) => i.code === 'send.resolve.expressionCycle'),
    ).toBe(true);
  });
});

describe('send frame-resolver: self-referencing expression', () => {
  it('accumulates value using previous result from userFieldValues', () => {
    const speedField = baseField({
      id: 'speedField',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'speed + step' }],
        variables: [
          { identifier: 'speed', sourceType: 'current_field', sourceId: 'speedField' },
          { identifier: 'step', sourceType: 'current_field', sourceId: 'stepField' },
        ],
      },
    });
    const stepField = baseField({
      id: 'stepField',
      offset: 1,
      configurable: true,
    });
    const provider = createFakeVariableProvider(new Map());

    // step=1 from user input; speedField=100 from previous send (seeded via userFieldValues)
    const { values, issues } = resolveFieldValues(
      [speedField, stepField],
      { stepField: 1, speedField: 100 },
      provider,
    );

    expect(values['speedField']).toBe(101);
    expect(issues).toHaveLength(0);
  });

  it('seeds 0 and evaluates correctly when no previous value exists for self-referencing field', () => {
    const speedField = baseField({
      id: 'speedField',
      offset: 0,
      configurable: false,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'speed + step' }],
        variables: [
          { identifier: 'speed', sourceType: 'current_field', sourceId: 'speedField' },
          { identifier: 'step', sourceType: 'current_field', sourceId: 'stepField' },
        ],
      },
    });
    const stepField = baseField({
      id: 'stepField',
      offset: 1,
      configurable: true,
    });
    const provider = createFakeVariableProvider(new Map());

    // No previous speedField value — only step=5 from user input.
    // Self-referencing field is auto-seeded with 0, so expression: 0 + 5 = 5
    const { values, issues } = resolveFieldValues(
      [speedField, stepField],
      { stepField: 5 },
      provider,
    );

    expect(values['speedField']).toBe(5);
    expect(issues).toHaveLength(0);
  });

  it('accumulates value for configurable self-referencing field with userFieldValues', () => {
    // This matches the real speed simulation frame: configurable=true + self-referencing expression
    const speedField = baseField({
      id: 'speed',
      offset: 0,
      configurable: true,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'speed + step' }],
        variables: [
          { identifier: 'speed', sourceType: 'current_field', sourceId: 'speed' },
          { identifier: 'step', sourceType: 'current_field', sourceId: 'step' },
        ],
      },
    });
    const stepField = baseField({
      id: 'step',
      offset: 1,
      configurable: true,
    });
    const provider = createFakeVariableProvider(new Map());

    // First send: step=1, speed=0 (default). Expression: 0 + 1 = 1
    const r1 = resolveFieldValues([speedField, stepField], { step: 1, speed: 0 }, provider);
    expect(r1.values['speed']).toBe(1);
    expect(r1.issues).toHaveLength(0);

    // Second send: step=1, speed=1 (writeback from first). Expression: 1 + 1 = 2
    const r2 = resolveFieldValues([speedField, stepField], { step: 1, speed: r1.values['speed']! }, provider);
    expect(r2.values['speed']).toBe(2);

    // Third send: speed=2. Expression: 2 + 1 = 3
    const r3 = resolveFieldValues([speedField, stepField], { step: 1, speed: r2.values['speed']! }, provider);
    expect(r3.values['speed']).toBe(3);
  });
});
