/**
 * T009: Expression engine -> receive integration
 *
 * Tests the full receive processor pipeline with real expression
 * compilation and evaluation, including dependency ordering,
 * circular detection, partial failure isolation, and end-to-end
 * processReceiveBatch with expression cache.
 */
import { describe, it, expect } from 'vitest';
import { compileFrameExpressions, evaluateFrameExpressions } from '@/features/receive/core/expression-pass';
import { processReceiveBatch } from '@/features/receive/core/processor';
import type {
  ExpressionCompileCache,
  ExpressionEvalInput,
  ReceiveProcessInput,
} from '@/features/receive/core/types';
import type { FrameAsset, FrameFieldDefinition } from '@/features/frame';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let fieldCounter = 0;
function fid(): string {
  return `field-${++fieldCounter}`;
}

let frameCounter = 0;
function frameId(): string {
  return `frame-${++frameCounter}`;
}

function makeField(overrides: Partial<FrameFieldDefinition> & { id?: string }): FrameFieldDefinition {
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

function makeFrame(overrides: Partial<FrameAsset> & { id?: string }): FrameAsset {
  const id = overrides.id ?? frameId();
  return {
    id,
    name: overrides.name ?? id,
    direction: overrides.direction ?? 'receive',
    fields: overrides.fields ?? [makeField({})],
    identifierRules: overrides.identifierRules ?? [
      { startIndex: 0, endIndex: 0, operator: 'eq', value: '0xBB', logicOperator: 'and' },
    ],
    ...overrides,
  };
}

function makeProcessInput(
  bytes: number[],
  frames: FrameAsset[],
  expressionCache?: ExpressionCompileCache,
): ReceiveProcessInput {
  return {
    batch: {
      id: 'batch-1',
      bytes,
      receivedAt: '2026-05-19T00:00:00Z',
      source: {
        sourceId: 'src-1',
        connectionId: 'conn-1',
        kind: 'serial',
        label: 'COM1',
      },
    },
    reference: {
      frames,
      referenceVersion: 1,
      refreshedAt: '2026-05-19T00:00:00Z',
    },
    processedAt: '2026-05-19T00:00:00Z',
    ...(expressionCache !== undefined ? { expressionCache } : {}),
  };
}

// First byte is the identifier byte (0xBB at offset 0, endIndex 0)
const ID_BYTE = 0xBB;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T009: Expression engine -> receive integration', () => {
  // ---- compileFrameExpressions: dependency ordering ----

  it('resolves dependency ordering with Kahn algorithm (fieldC depends on fieldB depends on fieldA)', () => {
    const fieldA = makeField({
      id: 'fA',
      name: 'fieldA',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '10' }],
        variables: [],
      },
    });
    const fieldB = makeField({
      id: 'fB',
      name: 'fieldB',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vA + 5' }],
        variables: [
          { identifier: 'vA', sourceType: 'frame_field', frameId: 'frm-1', fieldId: 'fA' },
        ],
      },
    });
    const fieldC = makeField({
      id: 'fC',
      name: 'fieldC',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vB * 2' }],
        variables: [
          { identifier: 'vB', sourceType: 'frame_field', frameId: 'frm-1', fieldId: 'fB' },
        ],
      },
    });

    const frame = makeFrame({
      id: 'frm-1',
      fields: [fieldA, fieldB, fieldC],
    });

    const cache = compileFrameExpressions([frame]);
    const result = cache.get('frm-1');

    expect(result).toBeDefined();
    expect(result!.success).toBe(true);
    expect(result!.compiled!.evalOrder).toEqual(['fA', 'fB', 'fC']);

    // Evaluate with empty raw values (fieldA expression is constant 10)
    const evalInput: ExpressionEvalInput = {
      compiled: result!.compiled!,
      frameId: 'frm-1',
      currentFrameRawValues: new Map(),
      readModel: new Map(),
      globalParams: new Map(),
    };

    const evalResult = evaluateFrameExpressions(evalInput);
    expect(evalResult.errors.size).toBe(0);
    // fieldA = 10, fieldB = 10 + 5 = 15, fieldC = 15 * 2 = 30
    expect(evalResult.values.get('fA')).toBe(10);
    expect(evalResult.values.get('fB')).toBe(15);
    expect(evalResult.values.get('fC')).toBe(30);
  });

  // ---- compileFrameExpressions: circular dependency detection ----

  it('detects circular dependency between fields', () => {
    const fieldA = makeField({
      id: 'fA',
      name: 'fieldA',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vB + 1' }],
        variables: [
          { identifier: 'vB', sourceType: 'frame_field', frameId: 'frm-circ', fieldId: 'fB' },
        ],
      },
    });
    const fieldB = makeField({
      id: 'fB',
      name: 'fieldB',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vA + 1' }],
        variables: [
          { identifier: 'vA', sourceType: 'frame_field', frameId: 'frm-circ', fieldId: 'fA' },
        ],
      },
    });

    const frame = makeFrame({
      id: 'frm-circ',
      fields: [fieldA, fieldB],
    });

    const cache = compileFrameExpressions([frame]);
    const result = cache.get('frm-circ');

    expect(result).toBeDefined();
    expect(result!.success).toBe(false);
    expect(result!.error).toContain('circular');
  });

  // ---- compileFrameExpressions: partial failure isolation ----
  // compileSingleFrame returns { success: false } if ANY field fails compile,
  // but eval-level partial failure still isolates per field.
  // We test eval-level partial failure with evaluateFrameExpressions.

  it('isolates individual field expression failures at eval time', () => {
    const fieldGood1 = makeField({
      id: 'fGood1',
      name: 'goodField1',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '42' }],
        variables: [],
      },
    });
    const fieldBad = makeField({
      id: 'fBad',
      name: 'badField',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'missing_var + 1' }],
        variables: [
          { identifier: 'missing_var', sourceType: 'frame_field', frameId: 'frm-partial', fieldId: 'nonexistent' },
        ],
      },
    });
    const fieldGood2 = makeField({
      id: 'fGood2',
      name: 'goodField2',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: '99' }],
        variables: [],
      },
    });

    const frame = makeFrame({
      id: 'frm-partial',
      fields: [fieldGood1, fieldBad, fieldGood2],
    });

    const cache = compileFrameExpressions([frame]);
    const result = cache.get('frm-partial');

    // All three compile fine (syntax is valid), but eval for fBad will fail
    expect(result).toBeDefined();
    expect(result!.success).toBe(true);

    const evalInput: ExpressionEvalInput = {
      compiled: result!.compiled!,
      frameId: 'frm-partial',
      currentFrameRawValues: new Map(),
      readModel: new Map(),
      globalParams: new Map(),
    };

    const evalResult = evaluateFrameExpressions(evalInput);

    // Good fields should evaluate correctly
    expect(evalResult.values.get('fGood1')).toBe(42);
    expect(evalResult.values.get('fGood2')).toBe(99);

    // Bad field should have an error (variable resolved to nothing -> eval throws)
    expect(evalResult.errors.has('fBad')).toBe(true);
  });

  // ---- globalParams as empty Map ----

  it('fails gracefully when globalParams is empty and expression uses global_stat', () => {
    const field = makeField({
      id: 'fGlobal',
      name: 'globalField',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'myGlobal + 10' }],
        variables: [
          { identifier: 'myGlobal', sourceType: 'global_stat' },
        ],
      },
    });

    const frame = makeFrame({
      id: 'frm-global',
      fields: [field],
    });

    const cache = compileFrameExpressions([frame]);
    const result = cache.get('frm-global');
    expect(result!.success).toBe(true);

    // Evaluate with empty globalParams -> variable not found -> eval error
    const evalInput: ExpressionEvalInput = {
      compiled: result!.compiled!,
      frameId: 'frm-global',
      currentFrameRawValues: new Map(),
      readModel: new Map(),
      globalParams: new Map(),
    };

    const evalResult = evaluateFrameExpressions(evalInput);
    expect(evalResult.errors.has('fGlobal')).toBe(true);
    expect(evalResult.errors.get('fGlobal')).toContain('undefined variable');
  });

  // ---- Full processReceiveBatch pipeline with expressions ----

  it('runs full processReceiveBatch with expression cache applied to matched frame', () => {
    // Frame layout (3 bytes total):
    //   offset 0: identifier byte (uint8, value 0xBB) - matched by identifierRules
    //   offset 1: raw value field (uint8)
    //   offset 2: expression field (uint8) that doubles the raw value
    const headerField = makeField({
      id: 'header',
      name: 'header',
      dataType: 'uint8',
      length: 1,
    });
    const rawField = makeField({
      id: 'raw-val',
      name: 'rawValue',
      dataType: 'uint8',
      length: 1,
    });
    const exprField = makeField({
      id: 'expr-val',
      name: 'exprValue',
      dataType: 'uint8',
      length: 1,
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'rawVar * 2' }],
        variables: [
          { identifier: 'rawVar', sourceType: 'current_field', fieldId: 'raw-val' },
        ],
      },
    });

    const frame = makeFrame({
      id: 'frm-e2e',
      name: 'E2E Frame',
      fields: [headerField, rawField, exprField],
    });

    // Compile expression cache
    const cache = compileFrameExpressions([frame]);
    const compileResult = cache.get('frm-e2e');
    expect(compileResult!.success).toBe(true);

    // Build input bytes: [0xBB, 5, 0]
    //   header=0xBB (matches identifierRules), raw=5, expr_placeholder=0
    const bytes = [ID_BYTE, 5, 0];

    const input = makeProcessInput(bytes, [frame], cache);
    const outcome = processReceiveBatch(input);

    // Should match
    expect(outcome.kind).toBe('matched');
    expect(outcome.matchedFrame).toBeDefined();
    expect(outcome.matchedFrame!.frameId).toBe('frm-e2e');

    // Find fields
    const headerFieldOut = outcome.fields.find((f) => f.fieldId === 'header');
    const rawFieldOut = outcome.fields.find((f) => f.fieldId === 'raw-val');
    const exprFieldOut = outcome.fields.find((f) => f.fieldId === 'expr-val');

    expect(headerFieldOut).toBeDefined();
    expect(rawFieldOut).toBeDefined();
    expect(exprFieldOut).toBeDefined();

    // Header and raw fields are not expression fields
    expect(headerFieldOut!.expressionApplied).toBe(false);
    expect(headerFieldOut!.value).toBe(0xBB);
    expect(rawFieldOut!.expressionApplied).toBe(false);
    expect(rawFieldOut!.value).toBe(5);

    // Expression field: 5 * 2 = 10
    expect(exprFieldOut!.expressionApplied).toBe(true);
    expect(exprFieldOut!.expressionError).toBeUndefined();
    expect(exprFieldOut!.value).toBe(10);
    expect(exprFieldOut!.displayValue).toBe('10');
  });

  // ---- processReceiveBatch with failed compile cache ----

  it('returns config-error when expression cache has compile failure', () => {
    const fieldA = makeField({
      id: 'fA',
      name: 'fieldA',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vB + 1' }],
        variables: [
          { identifier: 'vB', sourceType: 'frame_field', frameId: 'frm-fail', fieldId: 'fB' },
        ],
      },
    });
    const fieldB = makeField({
      id: 'fB',
      name: 'fieldB',
      expressionConfig: {
        expressions: [{ condition: 'true', expression: 'vA + 1' }],
        variables: [
          { identifier: 'vA', sourceType: 'frame_field', frameId: 'frm-fail', fieldId: 'fA' },
        ],
      },
    });

    const frame = makeFrame({
      id: 'frm-fail',
      fields: [fieldA, fieldB],
    });

    // This produces a compile failure (circular)
    const cache = compileFrameExpressions([frame]);
    const compileResult = cache.get('frm-fail');
    expect(compileResult!.success).toBe(false);

    // Need enough bytes for all fields (2 fields x 1 byte each)
    const bytes = [ID_BYTE, 0x00];
    const input = makeProcessInput(bytes, [frame], cache);
    const outcome = processReceiveBatch(input);

    expect(outcome.kind).toBe('config-error');
    expect(outcome.issues.some((i) => i.code === 'receive.expression.compileFailed')).toBe(true);
  });

  // ---- processReceiveBatch without expression cache ----

  it('matches and parses without expression cache (no expression applied)', () => {
    const field = makeField({
      id: 'plain-field',
      name: 'plainField',
      dataType: 'uint8',
      length: 1,
    });

    const frame = makeFrame({
      id: 'frm-plain',
      fields: [field],
    });

    const bytes = [ID_BYTE];
    const input = makeProcessInput(bytes, [frame]);
    const outcome = processReceiveBatch(input);

    expect(outcome.kind).toBe('matched');
    expect(outcome.fields).toHaveLength(1);
    expect(outcome.fields[0]!.value).toBe(0xBB);
    expect(outcome.fields[0]!.expressionApplied).toBe(false);
  });
});
