import { describe, expect, it } from 'vitest';
import { createSendService } from '../services';
import { createSendState } from '../state';
import {
  createFakeFrameProvider,
  createFakeConnectionWriter,
  createFailingWriter,
} from '../adapters/test-exports';
import type { FrameAsset } from '@/features/frame';
import type { SendRequest } from '../core';

// --- Variable maps ---

const speedVars = new Map<string, number | string | boolean>([['targetSpeed', 100]]);
const lowSpeedVars = new Map<string, number | string | boolean>([['targetSpeed', 30]]);
const noVars = new Map<string, number | string | boolean>();

// --- Inline frame assets ---

/** SC1: Basic frame - 2 configurable uint8 fields with hex defaults */
const basicFrame: FrameAsset = {
  id: 'int-basic',
  name: '基本帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xFF',
    },
    {
      id: 'command',
      name: '命令',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x01',
    },
  ],
};

/** SC2/SC3/SC4: Expression frame - 3 fields with expression configs */
const expressionFrame: FrameAsset = {
  id: 'int-expression',
  name: '表达式帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xAA',
    },
    {
      id: 'speed',
      name: '速度',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      expressionConfig: {
        expressions: [
          { condition: 'targetSpeed > 0', expression: 'targetSpeed' },
        ],
        variables: [
          { identifier: 'targetSpeed', sourceType: 'global_stat' },
        ],
      },
    },
    {
      id: 'mode',
      name: '模式',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      expressionConfig: {
        expressions: [
          { condition: 'targetSpeed >= 100', expression: '2' },
          { condition: 'targetSpeed >= 50', expression: '1' },
        ],
        variables: [
          { identifier: 'targetSpeed', sourceType: 'global_stat' },
        ],
      },
    },
  ],
};

/** Frame for expression eval failure test - references undefined variable */
const brokenExpressionFrame: FrameAsset = {
  id: 'int-broken-expr',
  name: '错误表达式帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xBB',
    },
    {
      id: 'broken',
      name: '坏字段',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      expressionConfig: {
        expressions: [
          { condition: 'undefinedVar > 10', expression: 'undefinedVar' },
        ],
        variables: [
          { identifier: 'undefinedVar', sourceType: 'global_stat' },
        ],
      },
    },
    {
      id: 'tail',
      name: '尾字段',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xCC',
    },
  ],
};

/** SC9: Checksum frame - header + data + checksum(isChecksum) */
const checksumFrame: FrameAsset = {
  id: 'int-checksum',
  name: '校验和帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x01',
    },
    {
      id: 'data',
      name: '数据',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x02',
    },
    {
      id: 'checksum',
      name: '校验和',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
      validOption: {
        isChecksum: true,
        startFieldIndex: 0,
        endFieldIndex: 1,
        checksumMethod: 'sum8',
      },
    },
  ],
  options: { autoChecksum: true, bigEndian: false, includeLengthField: false },
};

/** SC10: Auto length frame - includeLengthField=true but no lengthFieldId */
const autoLengthFrame: FrameAsset = {
  id: 'int-autolength',
  name: '自动长度帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x55',
    },
    {
      id: 'data',
      name: '数据',
      dataType: 'uint8',
      length: 2,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x00',
    },
  ],
  options: { autoChecksum: false, bigEndian: false, includeLengthField: true },
};

/** SC11: Direction frame - receive-only */
const receiveDirectionFrame: FrameAsset = {
  id: 'int-receive-only',
  name: '接收帧',
  direction: 'receive',
  fields: [
    {
      id: 'data',
      name: '数据',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0',
    },
  ],
};

/** SC14: Configurable priority frame */
const configurablePriorityFrame: FrameAsset = {
  id: 'int-configurable-priority',
  name: '优先级帧',
  direction: 'send',
  fields: [
    {
      id: 'header',
      name: '帧头',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0xDD',
    },
    {
      id: 'command',
      name: '命令',
      dataType: 'uint8',
      length: 1,
      inputType: 'input',
      configurable: true,
      options: [],
      dataParticipationType: 'direct',
      defaultValue: '0x00',
    },
    {
      id: 'fixedValue',
      name: '固定值',
      dataType: 'uint8',
      length: 1,
      inputType: 'expression',
      configurable: false,
      options: [],
      dataParticipationType: 'direct',
      expressionConfig: {
        expressions: [
          { condition: 'true', expression: '42' },
        ],
        variables: [],
      },
    },
  ],
};

// --- Helper: create integration service ---

const defaultTarget = {
  targetId: 'target-001',
  connectionId: 'conn-001',
  kind: 'serial' as const,
  role: 'serial-port' as const,
  label: 'COM3',
  routeLabel: 'serial:COM3',
  available: true,
};

const unavailableTarget = {
  targetId: 'target-unavail',
  connectionId: 'conn-unavail',
  kind: 'serial' as const,
  role: 'serial-port' as const,
  label: 'COM4',
  routeLabel: 'serial:COM4',
  available: false,
};

function createIntegrationService(options: {
  frames: readonly FrameAsset[];
  failWrites?: boolean;
  variables?: Map<string, number | string | boolean>;
  extraTargets?: readonly typeof defaultTarget[];
}) {
  const state = createSendState();
  const frameProvider = createFakeFrameProvider({ frames: options.frames });
  const allTargets = [defaultTarget, unavailableTarget, ...(options.extraTargets ?? [])];
  const connectionWriter = createFakeConnectionWriter({ targets: allTargets });
  const variableProvider = { getVariables: () => options.variables ?? new Map() };

  const service = createSendService({
    frameReader: frameProvider,
    targetResolver: connectionWriter,
    transportWriter: options.failWrites
      ? createFailingWriter('write-failed', 'Transport error')
      : connectionWriter,
    variableProvider,
    state,
    now: () => '2026-05-08T00:00:01.000Z',
  });

  return { service, state, connectionWriter };
}

function baseRequest(frameId: string, targetId = 'target-001'): SendRequest {
  return {
    frameId,
    targetId,
    context: { source: 'test' },
  };
}

// --- Integration tests ---

describe('send integration: end-to-end pipeline', () => {
  // SC1: Basic frame build + send
  it('SC1: builds and sends a basic frame with user field values', async () => {
    const { service, state, connectionWriter } = createIntegrationService({
      frames: [basicFrame],
    });

    const result = await service.execute({
      ...baseRequest('int-basic'),
      userFieldValues: { header: '0xFF', command: '0x01' },
    });

    expect(result.kind).toBe('sent');
    expect(result.bytesBuilt).toBe(2);
    expect(result.bytesSent).toBe(2);
    expect(result.buildIssues).toHaveLength(0);

    // Verify buffer content via recorded write
    expect(connectionWriter.recordedWrites).toHaveLength(1);
    expect(connectionWriter.recordedWrites[0]!.bytes).toEqual([0xff, 0x01]);

    // Verify stats
    const stats = state.getSnapshot().statistics;
    expect(stats.totalSent).toBe(1);
    expect(stats.totalErrors).toBe(0);
    expect(stats.totalRequests).toBe(1);
  });

  // SC2: Expression field evaluation
  it('SC2: evaluates expression fields using variable provider', async () => {
    const { service, connectionWriter } = createIntegrationService({
      frames: [expressionFrame],
      variables: speedVars,
    });

    const result = await service.execute(baseRequest('int-expression'));

    expect(result.kind).toBe('sent');
    expect(result.buildIssues).toHaveLength(0);

    // header=0xAA, speed=targetSpeed(100)=100=0x64, mode=targetSpeed>=100 => 2
    expect(connectionWriter.recordedWrites).toHaveLength(1);
    const bytes = connectionWriter.recordedWrites[0]!.bytes;
    expect(bytes[0]).toBe(0xaa);
    expect(bytes[1]).toBe(100); // 100 decimal = 0x64
    expect(bytes[2]).toBe(2);
  });

  // SC3: Expression conditional branching
  it('SC3: selects correct expression branch based on variables', async () => {
    const { service, connectionWriter } = createIntegrationService({
      frames: [expressionFrame],
      variables: lowSpeedVars, // targetSpeed=30
    });

    const result = await service.execute(baseRequest('int-expression'));

    expect(result.kind).toBe('sent');

    // header=0xAA, speed=30, mode=targetSpeed>=100 false, >=50 false => no branch matched => fallback 0
    const bytes = connectionWriter.recordedWrites[0]!.bytes;
    expect(bytes[0]).toBe(0xaa);
    expect(bytes[1]).toBe(30);
    expect(bytes[2]).toBe(0);
  });

  // SC4: Expression eval failure => graceful degradation
  it('SC4: zero-fills expression field on eval failure with build error', async () => {
    const { service } = createIntegrationService({
      frames: [brokenExpressionFrame],
      variables: noVars, // no variables available
    });

    const result = await service.execute(baseRequest('int-broken-expr'));

    // Expression failure should result in build-error because severity='error'
    expect(result.kind).toBe('build-error');

    // Should have an error issue for the broken field
    const brokenIssues = result.buildIssues.filter((i) => i.fieldId === 'broken');
    expect(brokenIssues.length).toBeGreaterThanOrEqual(1);
    expect(brokenIssues.some((i) => i.severity === 'error')).toBe(true);
  });

  // SC9: Checksum backfill
  it('SC9: backfills checksum field when autoChecksum=true', async () => {
    const { service, connectionWriter } = createIntegrationService({
      frames: [checksumFrame],
    });

    const result = await service.execute(baseRequest('int-checksum'));

    expect(result.kind).toBe('sent');
    expect(result.buildIssues).toHaveLength(0);

    const bytes = connectionWriter.recordedWrites[0]!.bytes;
    // header=0x01, data=0x02, checksum = sum8([0x01, 0x02]) = 0x03
    expect(bytes[0]).toBe(0x01);
    expect(bytes[1]).toBe(0x02);
    expect(bytes[2]).toBe(0x03);
  });

  // SC10: Auto length - warning path (no lengthFieldId)
  it('SC10: emits warning when includeLengthField=true but lengthFieldId is missing', async () => {
    const { service } = createIntegrationService({
      frames: [autoLengthFrame],
    });

    const result = await service.execute(baseRequest('int-autolength'));

    expect(result.kind).toBe('sent');

    // Should have a warning about missing lengthFieldId
    const lengthWarnings = result.buildIssues.filter(
      (i) => i.code === 'send.build.lengthFieldIdMissing',
    );
    expect(lengthWarnings).toHaveLength(1);
    expect(lengthWarnings[0]!.severity).toBe('warning');
  });

  // SC11: Direction filter
  it('SC11: returns build-error for receive-only frame', async () => {
    const { service } = createIntegrationService({
      frames: [receiveDirectionFrame],
    });

    const result = await service.execute(baseRequest('int-receive-only'));

    expect(result.kind).toBe('build-error');
    expect(result.error?.kind).toBe('wrong-direction');
    expect(result.bytesBuilt).toBe(0);
  });

  // SC12: Target unavailable
  it('SC12: returns target-unavailable for unavailable target', async () => {
    const { service } = createIntegrationService({
      frames: [basicFrame],
    });

    const result = await service.execute({
      ...baseRequest('int-basic', 'target-unavail'),
      userFieldValues: { header: '0xFF', command: '0x01' },
    });

    expect(result.kind).toBe('target-unavailable');
    expect(result.error?.kind).toBe('target-not-available');
    expect(result.bytesBuilt).toBe(2);
    expect(result.bytesSent).toBe(0);
  });

  // SC13: Transport write failure
  it('SC13: returns transport-error when transport writer fails', async () => {
    const { service } = createIntegrationService({
      frames: [basicFrame],
      failWrites: true,
    });

    const result = await service.execute({
      ...baseRequest('int-basic'),
      userFieldValues: { header: '0xFF', command: '0x01' },
    });

    expect(result.kind).toBe('transport-error');
    expect(result.error?.kind).toBe('write-failed');
    expect(result.bytesBuilt).toBe(2);
    expect(result.bytesSent).toBe(0);
  });

  // SC14: Configurable priority - non-configurable field ignores user input
  it('SC14: non-configurable field ignores user input and uses expression', async () => {
    const { service, connectionWriter } = createIntegrationService({
      frames: [configurablePriorityFrame],
      variables: noVars,
    });

    const result = await service.execute({
      ...baseRequest('int-configurable-priority'),
      userFieldValues: {
        command: '0x99',
        fixedValue: 77, // user tries to set non-configurable field
      },
    });

    expect(result.kind).toBe('sent');

    const bytes = connectionWriter.recordedWrites[0]!.bytes;
    // header=0xDD (non-configurable, default), command=0x99 (configurable, user wins),
    // fixedValue=42 (non-configurable, expression "true=>42" wins, user input ignored)
    expect(bytes[0]).toBe(0xdd);
    expect(bytes[1]).toBe(0x99);
    expect(bytes[2]).toBe(42);
  });
});
