import { describe, expect, it } from 'vitest';
import {
  migrateGlobalConfig,
  migrateFrameInstances,
  migrateCompletionConditions,
  migrateCommand,
} from '../../../../scripts/migrate-scoe-config';

// --- C24: Migration script verification ---

const sampleGlobalConfig = {
  scoeIdentifier: '0x01',
  tcpServerIp: '192.168.1.100',
  tcpServerPort: 6000,
  tcpServerAutoConnect: true,
  udpIpAddress: '192.168.1.200',
  udpPort: 7000,
  messageIdentifierOffset: 4,
  sourceIdentifierOffset: 5,
  destinationIdentifierOffset: 6,
  modelIdOffset: 7,
  satelliteIdOffset: 8,
  functionCodeOffset: 0,
  successFrameId: 'ack-frame-001',
};

const sampleOldCommand = {
  id: 'cmd-send-1',
  label: 'SEND_FRAME Test',
  code: '05',
  function: 'send_frame' as const,
  checksums: [
    { enabled: true, offset: 4, length: 8, checksumOffset: 12 },
  ],
  params: [
    {
      id: 'param-mode',
      label: 'Mode',
      value: '',
      type: 'string' as const,
      offset: 13,
      length: 1,
      targetInstanceId: 'inst-001',
      targetFieldId: 'field-mode',
      options: [
        { label: 'Mode A', value: 'mode_a', receiveCode: '01' },
        { label: 'Mode B', value: 'mode_b', receiveCode: '02' },
      ],
    },
  ],
  frameInstances: [
    {
      id: 'inst-001',
      frameId: 'frame-001',
      label: 'Primary send frame',
      description: 'Used for SCOE send commands',
      targetId: 'network:scoe-udp:scoe-udp-remote',
      fields: [
        { id: 'field-mode', value: 'mode_a' },
        { id: 'field-fixed', value: 100 },
        { id: 'field-empty' },
      ],
    },
    {
      id: 'inst-002',
      frameId: 'frame-002',
      targetId: 'network:scoe-udp:scoe-udp-remote',
      fields: [],
    },
  ],
  completionConditions: [
    {
      id: 'cond-001',
      label: 'Wait for ack',
      sourceFrameId: 'frame-ack',
      sourceFieldId: 'field-status',
      useParam: false,
      targetFixedValue: '1',
      operator: 'equal' as const,
    },
    {
      id: 'cond-002',
      label: 'Parametric condition',
      sourceFrameId: 'frame-result',
      sourceFieldId: 'field-result',
      useParam: true,
      targetParamId: 'param-mode',
      options: [
        { operator: 'equal' as const, matchValue: '0' },
        { operator: 'not_equal' as const, matchValue: '1' },
      ],
    },
  ],
  completionTimeout: 5000,
  successFrameId: 'cmd-ack-001',
  sendInterval: 100,
};

describe('migrateGlobalConfig', () => {
  it('migrates all fields correctly and adds udpTargetId', () => {
    const result = migrateGlobalConfig(sampleGlobalConfig);

    expect(result.scoeIdentifier).toBe('0x01');
    expect(result.tcpServerIp).toBe('192.168.1.100');
    expect(result.tcpServerPort).toBe(6000);
    expect(result.tcpServerAutoConnect).toBe(true);
    expect(result.udpIpAddress).toBe('192.168.1.200');
    expect(result.udpPort).toBe(7000);
    expect(result.udpTargetId).toBe('network:scoe-udp:scoe-udp-remote');
    expect(result.functionCodeOffset).toBe(0);
    expect(result.successFrameId).toBe('ack-frame-001');
  });

  it('does not include highlightConfigs', () => {
    const result = migrateGlobalConfig({
      ...sampleGlobalConfig,
      highlightConfigs: { color: 'red' },
    } as typeof sampleGlobalConfig);

    expect(Object.keys(result)).not.toContain('highlightConfigs');
  });
});

describe('migrateFrameInstances – C24', () => {
  it('migrates label and description from old frame instance', () => {
    const result = migrateFrameInstances(
      sampleOldCommand.frameInstances,
      sampleOldCommand.params,
    );

    expect(result).toBeDefined();
    expect(result![0]!.label).toBe('Primary send frame');
    expect(result![0]!.description).toBe('Used for SCOE send commands');
  });

  it('maps frameId and instanceId from old instance', () => {
    const result = migrateFrameInstances(
      sampleOldCommand.frameInstances,
      sampleOldCommand.params,
    );

    expect(result).toHaveLength(2);
    expect(result![0]!.frameId).toBe('frame-001');
    expect(result![0]!.instanceId).toBe('inst-001');
    expect(result![1]!.frameId).toBe('frame-002');
    expect(result![1]!.instanceId).toBe('inst-002');
  });

  it('generates param fieldMappings for fields referenced by params', () => {
    const result = migrateFrameInstances(
      sampleOldCommand.frameInstances,
      sampleOldCommand.params,
    );

    const paramMapping = result![0]!.fieldMappings.find(
      (fm) => fm.source === 'param',
    );
    expect(paramMapping).toEqual({
      fieldId: 'field-mode',
      source: 'param',
      paramId: 'param-mode',
    });
  });

  it('generates fixed fieldMappings for fields with values and no param reference', () => {
    const result = migrateFrameInstances(
      sampleOldCommand.frameInstances,
      sampleOldCommand.params,
    );

    const fixedMapping = result![0]!.fieldMappings.find(
      (fm) => fm.fieldId === 'field-fixed',
    );
    expect(fixedMapping).toEqual({
      fieldId: 'field-fixed',
      source: 'fixed',
      fixedValue: 100,
    });
  });

  it('skips fields with no value and no param reference', () => {
    const result = migrateFrameInstances(
      sampleOldCommand.frameInstances,
      sampleOldCommand.params,
    );

    const emptyMapping = result![0]!.fieldMappings.find(
      (fm) => fm.fieldId === 'field-empty',
    );
    expect(emptyMapping).toBeUndefined();
  });

  it('defaults targetId when old instance has none', () => {
    const result = migrateFrameInstances(
      [{ id: 'inst-x', frameId: 'frame-x', fields: [] }],
      [],
    );

    expect(result![0]!.targetId).toBe('network:scoe-udp:scoe-udp-remote');
  });

  it('returns undefined for empty frameInstances', () => {
    expect(migrateFrameInstances(undefined, [])).toBeUndefined();
    expect(migrateFrameInstances([], [])).toBeUndefined();
  });
});

describe('migrateCompletionConditions – operator mapping', () => {
  it('maps all 6 old operators to ComparisonOperator', () => {
    const operators = [
      { old: 'equal' as const, new: 'eq' },
      { old: 'not_equal' as const, new: 'neq' },
      { old: 'greater_than' as const, new: 'gt' },
      { old: 'less_than' as const, new: 'lt' },
      { old: 'greater_equal' as const, new: 'gte' },
      { old: 'less_equal' as const, new: 'lte' },
    ];

    for (const { old, new: expectedNew } of operators) {
      const result = migrateCompletionConditions([
        {
          id: 'c1',
          label: 'Test',
          sourceFrameId: 'f1',
          sourceFieldId: 'fd1',
          useParam: false,
          operator: old,
        },
      ]);
      expect(result![0]!.operator).toBe(expectedNew);
    }
  });

  it('maps options operators correctly', () => {
    const result = migrateCompletionConditions(
      sampleOldCommand.completionConditions,
    );

    // cond-002 has options with old operators
    const condWithOpts = result!.find((c) => c.id === 'cond-002')!;
    expect(condWithOpts.options).toEqual([
      { operator: 'eq', matchValue: '0' },
      { operator: 'neq', matchValue: '1' },
    ]);
  });

  it('preserves non-operator fields', () => {
    const result = migrateCompletionConditions(
      sampleOldCommand.completionConditions,
    );

    const cond = result!.find((c) => c.id === 'cond-001')!;
    expect(cond.sourceFrameId).toBe('frame-ack');
    expect(cond.sourceFieldId).toBe('field-status');
    expect(cond.useParam).toBe(false);
    expect(cond.targetFixedValue).toBe('1');
    expect(cond.operator).toBe('eq');
  });
});

describe('migrateCommand – full command', () => {
  it('migrates all fields of a complete command', () => {
    const result = migrateCommand(sampleOldCommand);

    expect(result.id).toBe('cmd-send-1');
    expect(result.label).toBe('SEND_FRAME Test');
    expect(result.code).toBe('05');
    expect(result.function).toBe('send_frame');
    expect(result.checksums).toEqual([{ enabled: true, offset: 4, length: 8, checksumOffset: 12 }]);
    expect(result.params).toHaveLength(1);
    expect(result.params![0]!.id).toBe('param-mode');
    expect(result.frameMappings).toHaveLength(2);
    expect(result.completionConditions).toHaveLength(2);
    expect(result.completionTimeout).toBe(5000);
    expect(result.successFrameId).toBe('cmd-ack-001');
    expect(result.sendInterval).toBe(100);
  });
});
