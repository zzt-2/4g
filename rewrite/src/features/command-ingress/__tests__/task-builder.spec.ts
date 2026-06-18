import { describe, expect, it } from 'vitest';
import { buildSendFrameTask, buildReadFileAndSendTask, buildWaitConditions } from '../core/task-builder';
import { sendFrameCommandConfig } from '../fixtures/command-ingress-fixtures';
import type { ParsedCommand } from '../core/protocol-adapter';

function buildParsedCommand(overrides: Partial<ParsedCommand> = {}): ParsedCommand {
  return {
    commandId: 'scoe-cmd-test-1',
    commandCode: '05',
    commandFunction: 'send_frame',
    rawBytes: [0x01, 0x05, 0xaa, 0xaa],
    resolvedParams: { 'param-mode': 'mode_a' },
    commandConfig: sendFrameCommandConfig,
    connectionId: 'conn-tcp-1',
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildWaitConditions', () => {
  it('returns empty array when no conditions', () => {
    const cmd = buildParsedCommand();
    expect(buildWaitConditions(cmd, undefined)).toEqual([]);
    expect(buildWaitConditions(cmd, [])).toEqual([]);
  });

  it('builds fixed-value condition term', () => {
    const cmd = buildParsedCommand();
    const conditions = buildWaitConditions(cmd, sendFrameCommandConfig.completionConditions);

    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toEqual({
      frameId: 'frame-ack',
      fieldId: 'field-status',
      operator: 'eq',
      threshold: '1',
    });
  });

  it('builds parameterized condition with option index alignment', () => {
    const cmd = buildParsedCommand({
      resolvedParams: { 'param-mode': 'mode_b' },
      commandConfig: {
        ...sendFrameCommandConfig,
        params: [
          {
            id: 'param-mode',
            label: 'Mode',
            value: '',
            type: 'string',
            offset: 13,
            length: 1,
            options: [
              { label: 'Mode A', value: 'mode_a', receiveCode: '01' },
              { label: 'Mode B', value: 'mode_b', receiveCode: '02' },
            ],
          },
        ],
        completionConditions: [
          {
            id: 'cond-param',
            label: 'Wait for param',
            sourceFrameId: 'frame-ack',
            sourceFieldId: 'field-result',
            useParam: true,
            targetParamId: 'param-mode',
            options: [
              { operator: 'eq' as const, matchValue: '0A' },
              { operator: 'gte' as const, matchValue: '0B' },
            ],
          },
        ],
      },
    });

    const conditions = buildWaitConditions(cmd, cmd.commandConfig.completionConditions);
    expect(conditions).toHaveLength(1);
    // mode_b is at index 1 → options[1] = { operator: 'gte', matchValue: '0B' }
    expect(conditions[0]).toEqual({
      frameId: 'frame-ack',
      fieldId: 'field-result',
      operator: 'gte',
      threshold: '0B',
    });
  });

  it('falls back to eq when param option index not found', () => {
    const cmd = buildParsedCommand({
      resolvedParams: { 'param-mode': 'unknown_value' },
      commandConfig: {
        ...sendFrameCommandConfig,
        params: [
          {
            id: 'param-mode',
            label: 'Mode',
            value: '',
            type: 'string',
            offset: 13,
            length: 1,
            options: [
              { label: 'Mode A', value: 'mode_a', receiveCode: '01' },
            ],
          },
        ],
        completionConditions: [
          {
            id: 'cond-param',
            label: 'Wait for param',
            sourceFrameId: 'frame-ack',
            sourceFieldId: 'field-result',
            useParam: true,
            targetParamId: 'param-mode',
          },
        ],
      },
    });

    const conditions = buildWaitConditions(cmd, cmd.commandConfig.completionConditions);
    expect(conditions[0]?.operator).toBe('eq');
    expect(conditions[0]?.threshold).toBe('');
  });
});

describe('buildSendFrameTask', () => {
  it('builds TaskDefinition with immediate schedule', () => {
    const cmd = buildParsedCommand();
    const taskDef = buildSendFrameTask(cmd);

    expect(taskDef.schedule).toEqual({ kind: 'immediate' });
    expect(taskDef.errorPolicy).toEqual({ onFailure: 'stop' });
    expect(taskDef.id).toMatch(/^scoe-send-/);
    expect(taskDef.name).toContain('SEND_FRAME');
  });

  it('creates send step with resolved param field values', () => {
    const cmd = buildParsedCommand();
    const taskDef = buildSendFrameTask(cmd);

    const sendStep = taskDef.steps.find((s) => s.kind === 'send');
    expect(sendStep).toBeDefined();
    expect(sendStep!.kind).toBe('send');
    if (sendStep!.kind === 'send') {
      expect(sendStep.config.userFieldValues).toEqual({
        'field-mode': 'mode_a',
        'field-fixed': 100,
      });
      expect(sendStep.config.frameId).toBe('frame-001');
      expect(sendStep.config.targetId).toBe('network:scoe-udp:scoe-udp-remote');
    }
  });

  it('creates delay step when sendInterval > 0', () => {
    const cmd = buildParsedCommand();
    const taskDef = buildSendFrameTask(cmd);

    const delayStep = taskDef.steps.find((s) => s.kind === 'delay');
    expect(delayStep).toBeDefined();
    if (delayStep!.kind === 'delay') {
      expect(delayStep.config.durationMs).toBe(100);
    }
  });

  it('creates wait-condition step when completion conditions exist', () => {
    const cmd = buildParsedCommand();
    const taskDef = buildSendFrameTask(cmd);

    const waitStep = taskDef.steps.find((s) => s.kind === 'wait-condition');
    expect(waitStep).toBeDefined();
    if (waitStep!.kind === 'wait-condition') {
      expect(waitStep.config.timeoutMs).toBe(5000);
      expect(waitStep.config.onTimeout).toBe('fail');
      expect(waitStep.config.conditions).toHaveLength(1);
    }
  });

  it('skips delay step when sendInterval is 0 or undefined', () => {
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        sendInterval: undefined,
      },
    });
    const taskDef = buildSendFrameTask(cmd);

    expect(taskDef.steps.find((s) => s.kind === 'delay')).toBeUndefined();
  });
});

describe('buildReadFileAndSendTask', () => {
  it('throws when no frame mappings', () => {
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        frameMappings: undefined,
      },
    });
    expect(() => buildReadFileAndSendTask(cmd, ['line1'])).toThrow('No frame mapping');
  });

  it('builds TaskDefinition with timer schedule and step-level fieldResolvers', () => {
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        params: [
          {
            id: 'param-file',
            label: 'File',
            value: 'test.txt',
            type: 'string',
            offset: 13,
            length: 1,
            options: [],
          },
        ],
        frameMappings: [
          {
            frameId: 'frame-001',
            instanceId: 'inst-001',
            targetId: 'network:scoe-udp:scoe-udp-remote',
            fieldMappings: [
              { fieldId: 'field-data', source: 'param', paramId: 'param-file' },
            ],
          },
        ],
      },
    });

    const fileLines = ['data1', 'data2', 'data3'];
    const taskDef = buildReadFileAndSendTask(cmd, fileLines);

    expect(taskDef.schedule).toEqual({ kind: 'timer', intervalMs: 100 });
    expect(taskDef.stopCondition).toEqual({ maxIterations: 3 });
    expect(taskDef.id).toMatch(/^scoe-rfs-/);
    expect(taskDef.name).toContain('READ_FILE_AND_SEND');
    // 文件行下沉到 send step 的 fieldVariations(离散值列表)
    const sendStep = taskDef.steps[0]!;
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.fieldVariations).toEqual([
        { fieldId: 'field-data', values: ['data1', 'data2', 'data3'] },
      ]);
    }
  });

  it('uses default intervalMs when sendInterval is undefined', () => {
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        sendInterval: undefined,
        frameMappings: [
          {
            frameId: 'frame-001',
            instanceId: 'inst-001',
            targetId: 'network:scoe-udp:scoe-udp-remote',
            fieldMappings: [],
          },
        ],
      },
    });

    const taskDef = buildReadFileAndSendTask(cmd, ['line1']);
    expect(taskDef.schedule).toEqual({ kind: 'timer', intervalMs: 1000 });
  });

  it('omits fieldResolvers when no file param mapping found', () => {
    const cmd = buildParsedCommand({
      commandConfig: {
        ...sendFrameCommandConfig,
        params: [],
        frameMappings: [
          {
            frameId: 'frame-001',
            instanceId: 'inst-001',
            targetId: 'network:scoe-udp:scoe-udp-remote',
            fieldMappings: [],
          },
        ],
      },
    });

    const taskDef = buildReadFileAndSendTask(cmd, ['line1']);
    const sendStep = taskDef.steps[0]!;
    expect(sendStep.kind).toBe('send');
    if (sendStep.kind === 'send') {
      expect(sendStep.config.fieldVariations).toBeUndefined();
    }
  });
});
