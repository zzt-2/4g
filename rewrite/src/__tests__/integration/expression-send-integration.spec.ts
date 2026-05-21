/**
 * T010: Expression engine -> send integration
 *
 * Tests the send frame resolver with expressions: compileConditional +
 * evaluateConditional in send context, factor inverse transform,
 * defaultValue fallback, conditional branch selection, and the full
 * resolveFieldValues pipeline.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveFieldValues,
  evaluateFieldExpressions,
  applyFactor,
  frameToBuildInput,
} from '@/features/send/core/frame-resolver';
import type { SendFieldEncodingDef, SendFieldValue } from '@/features/send/core/types';
import type { SendVariableProvider } from '@/features/send/adapters/ports';
import type { FrameAsset, FrameFieldDefinition } from '@/features/frame';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fieldCounter = 0;
function fid(): string {
  return `field-${++fieldCounter}`;
}

function makeEncodingField(
  overrides: Partial<SendFieldEncodingDef> & { id?: string },
): SendFieldEncodingDef {
  const id = overrides.id ?? fid();
  return {
    id,
    dataType: overrides.dataType ?? 'uint8',
    length: overrides.length ?? 1,
    bigEndian: overrides.bigEndian ?? false,
    isASCII: overrides.isASCII ?? false,
    offset: overrides.offset ?? 0,
    factor: overrides.factor ?? 1,
    ...overrides,
  };
}

function makeNoopProvider(vars?: Map<string, number | string | boolean>): SendVariableProvider {
  return {
    getVariables: () => vars ?? new Map(),
  };
}

function makeFrameField(overrides: Partial<FrameFieldDefinition> & { id?: string }): FrameFieldDefinition {
  const id = overrides.id ?? fid();
  return {
    id,
    name: overrides.name ?? id,
    dataType: overrides.dataType ?? 'uint8',
    length: overrides.length ?? 1,
    inputType: overrides.inputType ?? 'input',
    configurable: overrides.configurable ?? false,
    options: overrides.options ?? [],
    dataParticipationType: overrides.dataParticipationType ?? 'direct',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T010: Expression engine -> send integration', () => {
  // ---- compileConditional + evaluateConditional in send context ----

  it('evaluates expression field via evaluateFieldExpressions', () => {
    const field = makeEncodingField({
      id: 'expr-field',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'x + 10' }],
        variables: [{ identifier: 'x', sourceType: 'current_field' }],
      },
    });

    const vars = new Map<string, number | string | boolean>([['x', 5]]);
    const result = evaluateFieldExpressions(field, vars);

    expect(result.value).toBe(15);
    expect(result.issues).toHaveLength(0);
  });

  // ---- Factor inverse transform ----

  it('divides by factor when factor != 1', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({ id: 'f1', factor: 0.1 }),
      makeEncodingField({ id: 'f2', factor: 1 }),
      makeEncodingField({ id: 'f3', factor: 0.5 }),
    ];

    const fieldValues: Record<string, SendFieldValue> = {
      f1: 10,
      f2: 20,
      f3: 5,
    };

    const result = applyFactor(fields, fieldValues);

    // 10 / 0.1 = 100
    expect(result.values.f1).toBe(100);
    // factor=1 -> pass through
    expect(result.values.f2).toBe(20);
    // 5 / 0.5 = 10
    expect(result.values.f3).toBe(10);
    expect(result.issues).toHaveLength(0);
  });

  it('reports error when factor is 0', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({ id: 'f-zero', factor: 0 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { 'f-zero': 42 };

    const result = applyFactor(fields, fieldValues);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.resolve.zeroFactor');
    // Value stays unchanged when factor=0
    expect(result.values['f-zero']).toBe(42);
  });

  it('passes through bytes type unchanged regardless of factor', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({ id: 'f-bytes', dataType: 'bytes', factor: 0.1 }),
    ];
    const fieldValues: Record<string, SendFieldValue> = { 'f-bytes': 255 };

    const result = applyFactor(fields, fieldValues);
    // bytes type ignores factor
    expect(result.values['f-bytes']).toBe(255);
    expect(result.issues).toHaveLength(0);
  });

  // ---- defaultValue fallback ----

  it('uses defaultValue when no expression config and no user value', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({
        id: 'f-default',
        configurable: false,
        defaultValue: '42',
      }),
    ];

    const provider = makeNoopProvider();
    const result = resolveFieldValues(fields, {}, provider);

    expect(result.values['f-default']).toBe(42);
    expect(result.issues).toHaveLength(0);
  });

  it('uses string defaultValue when not numeric', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({
        id: 'f-str',
        defaultValue: 'hello',
      }),
    ];

    const provider = makeNoopProvider();
    const result = resolveFieldValues(fields, {}, provider);

    expect(result.values['f-str']).toBe('hello');
  });

  it('zero-fills with warning when no value source exists', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({
        id: 'f-empty',
        configurable: false,
        // no defaultValue, no expressionConfig
      }),
    ];

    const provider = makeNoopProvider();
    const result = resolveFieldValues(fields, {}, provider);

    expect(result.values['f-empty']).toBe(0);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.resolve.zeroFill');
    expect(result.issues[0]!.severity).toBe('warning');
  });

  // ---- Conditional expression branch selection ----

  it('selects the first matching branch in conditional expression', () => {
    const field = makeEncodingField({
      id: 'f-cond',
      expressionConfig: {
        expressions: [
          { condition: 'x > 5', expression: 'x * 2' },
          { condition: 'true', expression: 'x + 1' },
        ],
        variables: [{ identifier: 'x', sourceType: 'current_field' }],
      },
    });

    // x=10 -> first branch matches -> 10 * 2 = 20
    const varsMatch = new Map<string, number | string | boolean>([['x', 10]]);
    const resultMatch = evaluateFieldExpressions(field, varsMatch);
    expect(resultMatch.value).toBe(20);
    expect(resultMatch.issues).toHaveLength(0);

    // x=3 -> first branch fails, second matches -> 3 + 1 = 4
    const varsFallback = new Map<string, number | string | boolean>([['x', 3]]);
    const resultFallback = evaluateFieldExpressions(field, varsFallback);
    expect(resultFallback.value).toBe(4);
    expect(resultFallback.issues).toHaveLength(0);
  });

  // ---- Full resolveFieldValues pipeline ----

  it('resolves fields with correct priority order: user > expression > default', () => {
    const fields: SendFieldEncodingDef[] = [
      // Priority 1: configurable with user value
      makeEncodingField({
        id: 'f-user',
        configurable: true,
        defaultValue: '100',
      }),
      // Priority 2: expression config
      makeEncodingField({
        id: 'f-expr',
        expressionConfig: {
          expressions: [{ condition: 'true', expression: 'x + 50' }],
          variables: [{ identifier: 'x', sourceType: 'current_field' }],
        },
      }),
      // Priority 3: default value
      makeEncodingField({
        id: 'f-default',
        defaultValue: '200',
      }),
      // No source -> zero fill
      makeEncodingField({
        id: 'f-zero',
      }),
    ];

    const userValues: Record<string, SendFieldValue> = {
      'f-user': 42,
    };

    const provider = makeNoopProvider(new Map([['x', 10]]));
    const result = resolveFieldValues(fields, userValues, provider);

    // User value wins
    expect(result.values['f-user']).toBe(42);
    // Expression: 10 + 50 = 60
    expect(result.values['f-expr']).toBe(60);
    // Default value
    expect(result.values['f-default']).toBe(200);
    // Zero-filled
    expect(result.values['f-zero']).toBe(0);

    // Only the zero-fill should produce a warning
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.fieldId).toBe('f-zero');
  });

  // ---- Variable provider merging ----

  it('merges provider variables with caller-supplied variables', () => {
    const field = makeEncodingField({
      id: 'f-merge',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'a + b' }],
        variables: [
          { identifier: 'a', sourceType: 'current_field' },
          { identifier: 'b', sourceType: 'current_field' },
        ],
      },
    });

    const providerVars = new Map<string, number | string | boolean>([['a', 10]]);
    const callerVars = new Map<string, number | string | boolean>([['b', 20]]);
    const provider = makeNoopProvider(providerVars);

    const result = resolveFieldValues([field], {}, provider, callerVars);
    expect(result.values['f-merge']).toBe(30);
  });

  // ---- frameToBuildInput conversion ----

  it('converts FrameAsset to SendFieldEncodingDef preserving expression config', () => {
    const frame: FrameAsset = {
      id: 'frm-convert',
      name: 'Test Frame',
      direction: 'send',
      fields: [
        makeFrameField({
          id: 'f1',
          name: 'field1',
          dataType: 'uint16',
          length: 2,
          factor: 0.1,
          expressionConfig: {
            expressions: [{ condition: 'true', expression: 'val * 3' }],
            variables: [{ identifier: 'val', sourceType: 'current_field' }],
          },
        }),
        makeFrameField({
          id: 'f2',
          name: 'field2',
          dataType: 'uint8',
          length: 1,
          defaultValue: '7',
        }),
      ],
    };

    const { fields, totalByteLength } = frameToBuildInput(frame);

    expect(totalByteLength).toBe(3); // 2 + 1
    expect(fields).toHaveLength(2);

    // First field
    expect(fields[0]!.id).toBe('f1');
    expect(fields[0]!.dataType).toBe('uint16');
    expect(fields[0]!.length).toBe(2);
    expect(fields[0]!.offset).toBe(0);
    expect(fields[0]!.factor).toBe(0.1);
    expect(fields[0]!.expressionConfig).toBeDefined();
    expect(fields[0]!.expressionConfig!.expressions).toHaveLength(1);

    // Second field
    expect(fields[1]!.id).toBe('f2');
    expect(fields[1]!.dataType).toBe('uint8');
    expect(fields[1]!.length).toBe(1);
    expect(fields[1]!.offset).toBe(2);
    expect(fields[1]!.defaultValue).toBe('7');
  });

  // ---- Expression compile failure in send ----

  it('reports error when expression has invalid syntax', () => {
    const field = makeEncodingField({
      id: 'f-bad-syntax',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '+++' }],
        variables: [],
      },
    });

    const vars = new Map<string, number | string | boolean>();
    const result = evaluateFieldExpressions(field, vars);

    expect(result.value).toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.resolve.expressionCompile');
    expect(result.issues[0]!.severity).toBe('error');
  });

  // ---- Expression eval failure in send (missing variable) ----

  it('reports error when expression references undefined variable', () => {
    const field = makeEncodingField({
      id: 'f-missing-var',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'unknown_var + 1' }],
        variables: [{ identifier: 'unknown_var', sourceType: 'current_field' }],
      },
    });

    const vars = new Map<string, number | string | boolean>();
    const result = evaluateFieldExpressions(field, vars);

    expect(result.value).toBeNull();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe('send.resolve.expressionEval');
    expect(result.issues[0]!.severity).toBe('error');
  });

  // ---- Configurable field priority over expression ----

  it('uses user value for configurable field even when expression config exists', () => {
    const fields: SendFieldEncodingDef[] = [
      makeEncodingField({
        id: 'f-override',
        configurable: true,
        expressionConfig: {
          expressions: [{ condition: 'true', expression: '999' }],
          variables: [],
        },
      }),
    ];

    const userValues: Record<string, SendFieldValue> = { 'f-override': 7 };
    const provider = makeNoopProvider();
    const result = resolveFieldValues(fields, userValues, provider);

    // User value takes priority over expression
    expect(result.values['f-override']).toBe(7);
    expect(result.issues).toHaveLength(0);
  });
});
