import { describe, it, expect } from 'vitest';
import {
  createEnvelope,
  translateTaskResult,
  translateStepResult,
  translateHeartbeat,
  translateDeviceInfoReport,
  translateDeviceAlarmReport,
  translateSubSysAlarmReport,
  translateTestDataFileComplete,
  translateFileTranslationComplete,
  translateSigReport,
} from '../core/outbound-translator';
import type { TaskInstanceState, TaskStepResult, TaskDefinition } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';
import type { EnvelopeConfig } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultEnvelope: EnvelopeConfig = {
  subSysType: 'ADS',
  subSysId: 'ADS_001',
  sessionId: 12345,
};

function makeTaskDefinition(overrides?: Partial<TaskDefinition>): TaskDefinition {
  return {
    id: 'def-001',
    name: 'Test def',
    steps: [
      { kind: 'send', id: 'step-0', name: 'Send frame-001', config: { frameId: 'frame-001', targetId: 'target-1' } },
      { kind: 'wait-condition', id: 'step-1', name: 'Wait voltage', config: { conditions: [], timeoutMs: 5000, onTimeout: 'fail' } },
    ],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
    ...overrides,
  };
}

function makeInstance(overrides?: Partial<TaskInstanceState>): TaskInstanceState {
  return {
    instanceId: 'inst-001',
    definitionRef: makeTaskDefinition(),
    lifecycle: 'completed',
    currentStepIndex: 2,
    currentIteration: 0,
    stepResults: [],
    startedAt: '2026-05-25T10:00:00.000Z',
    completedAt: '2026-05-25T10:00:05.000Z',
    ...overrides,
  };
}

function makeVerdict(overrides?: Partial<CaseVerdict>): CaseVerdict {
  return {
    instanceId: 'inst-001',
    taskDefinitionId: 'def-001',
    verdict: 'passed',
    judgedAt: '2026-05-25T10:00:05.000Z',
    startedAt: '2026-05-25T10:00:00.000Z',
    finishedAt: '2026-05-25T10:00:05.000Z',
    ...overrides,
  };
}

function makeSendStepResult(
  overrides?: Partial<TaskStepResult>,
  sendKind: 'sent' | 'error' = 'sent',
): TaskStepResult {
  return {
    kind: 'send',
    stepIndex: 0,
    iteration: 0,
    sendResult: {
      kind: sendKind,
      requestRef: { frameId: 'frame-001', targetId: 'target-1', context: { source: 'task' } },
      bytesBuilt: 10,
      bytesSent: sendKind === 'sent' ? 10 : 0,
      timestamp: '2026-05-25T10:00:01.000Z',
      ...(sendKind === 'error' ? { error: { kind: 'transport-error', message: 'connection lost' } } : {}),
      buildIssues: [],
    },
    ...overrides,
  };
}

function makeWaitConditionStepResult(matched: boolean, overrides?: Partial<TaskStepResult>): TaskStepResult {
  return {
    kind: 'wait-condition',
    stepIndex: 1,
    iteration: 0,
    matched,
    timedOut: !matched,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createEnvelope
// ---------------------------------------------------------------------------

describe('createEnvelope', () => {
  it('produces envelope with config values and random requestId', () => {
    const env = createEnvelope('testMethod', defaultEnvelope);

    expect(env.method).toBe('testMethod');
    expect(env.subSysType).toBe('ADS');
    expect(env.subSysId).toBe('ADS_001');
    expect(env.sessionId).toBe(12345);
    expect(env.requestId).toBeGreaterThanOrEqual(0);
    expect(env.requestId).toBeLessThanOrEqual(2147483648);
  });

  it('generates random sessionId when not provided', () => {
    const env = createEnvelope('test', { subSysType: 'ADS', subSysId: 'ADS_001' });

    expect(env.sessionId).toBeGreaterThanOrEqual(0);
    expect(env.sessionId).toBeLessThanOrEqual(2147483648);
  });
});

// ---------------------------------------------------------------------------
// translateTaskResult
// ---------------------------------------------------------------------------

describe('translateTaskResult', () => {
  it('maps verdict "passed" to result "success"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'passed' });

    const report = translateTaskResult(instance, verdict, 'tc-001', 'task-001', defaultEnvelope);

    expect(report.testCaseId).toBe('tc-001');
    expect(report.taskId).toBe('task-001');
    expect(report.result).toBe('success');
    expect(report.method).toBe('testCaseResultReport');
    expect(report.subSysType).toBe('ADS');
  });

  it('maps verdict "failed" to result "fail"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'failed' });

    const report = translateTaskResult(instance, verdict, 'tc-002', 'task-002', defaultEnvelope);

    expect(report.result).toBe('fail');
  });

  it('maps verdict "stopped" to result "tbd"', () => {
    const instance = makeInstance();
    const verdict = makeVerdict({ verdict: 'stopped' });

    const report = translateTaskResult(instance, verdict, 'tc-003', 'task-003', defaultEnvelope);

    expect(report.result).toBe('tbd');
  });

  it('uses currentIteration + 1 as loopIndex', () => {
    const instance = makeInstance({ currentIteration: 3 });
    const verdict = makeVerdict();

    const report = translateTaskResult(instance, verdict, 'tc-004', 'task-004', defaultEnvelope);

    expect(report.loopIndex).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// translateStepResult
// ---------------------------------------------------------------------------

describe('translateStepResult', () => {
  it('produces MsgReportOutbound with envelope fields', () => {
    const instance = makeInstance();
    const stepResult = makeSendStepResult(undefined, 'sent');

    const msg = translateStepResult(instance, stepResult, 'tc-010', 'task-010', defaultEnvelope);

    expect(msg.method).toBe('msgReport');
    expect(msg.taskId).toBe('task-010');
    expect(msg.testCaseId).toBe('tc-010');
    expect(msg.stepInfo).toHaveLength(1);
    expect(msg.stepInfo[0].id).toBe('1');
    expect(msg.stepInfo[0].result).toBe('success');
    expect(msg.stepInfo[0].name).toBe('Send frame-001');
  });

  it('maps send step with error to result "fail"', () => {
    const instance = makeInstance();
    const stepResult = makeSendStepResult(undefined, 'error');

    const msg = translateStepResult(instance, stepResult, 'tc-011', 'task-011', defaultEnvelope);

    expect(msg.stepInfo[0].result).toBe('fail');
  });

  it('maps wait-condition matched=true to success', () => {
    const instance = makeInstance();
    const stepResult = makeWaitConditionStepResult(true, { stepIndex: 1 });

    const msg = translateStepResult(instance, stepResult, 'tc-012', 'task-012', defaultEnvelope);

    expect(msg.stepInfo[0].result).toBe('success');
    expect(msg.stepInfo[0].name).toBe('Wait voltage');
  });
});

// ---------------------------------------------------------------------------
// New translators
// ---------------------------------------------------------------------------

describe('translateHeartbeat', () => {
  it('produces HeartbeatOutbound with subSysType/subSysId and timer', () => {
    const hb = translateHeartbeat('ADS', 'ADS_001', 15);

    expect(hb.method).toBe('heartbeat');
    expect(hb.subSysType).toBe('ADS');
    expect(hb.subSysId).toBe('ADS_001');
    expect(hb.timer).toBe(15);
    expect(hb.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe('translateDeviceInfoReport', () => {
  it('produces DeviceInfoReportOutbound', () => {
    const items = [{ name: 'UE1', deviceId: 'ADS_UE_01', type: 'UE', swVer: '1.0', status: 'online' as const }];
    const report = translateDeviceInfoReport(items, defaultEnvelope);

    expect(report.method).toBe('deviceInfoReport');
    expect(report.datas).toHaveLength(1);
    expect(report.subSysType).toBe('ADS');
  });
});

describe('translateDeviceAlarmReport', () => {
  it('produces DeviceAlarmReportOutbound', () => {
    const items = [{ alarmId: 'A1', deviceId: 'D1', severity: 'critical' as const, warnTime: '2026-01-01T00:00:00', msg: 'alarm' }];
    const report = translateDeviceAlarmReport(items, defaultEnvelope);

    expect(report.method).toBe('deviceAlarmReport');
    expect(report.datas).toHaveLength(1);
  });
});

describe('translateSubSysAlarmReport', () => {
  it('produces SubSysAlarmReportOutbound', () => {
    const items = [{ alarmId: 'A2', severity: 'warn' as const, warnTime: '2026-01-01T00:00:00', msg: 'sys alarm' }];
    const report = translateSubSysAlarmReport(items, defaultEnvelope);

    expect(report.method).toBe('subSysAlarmReport');
    expect(report.datas).toHaveLength(1);
  });
});

describe('translateTestDataFileComplete', () => {
  it('produces TestDataFileCompleteOutbound', () => {
    const file = {
      taskId: 'T1',
      testCaseId: ['TC1'],
      ftpServerIP: '192.168.0.1',
      fileType: 'WRPSig',
      filePath: '/data/test.csv',
    };
    const report = translateTestDataFileComplete(file, defaultEnvelope);

    expect(report.method).toBe('testDataFileTranslationComplete');
    expect(report.taskId).toBe('T1');
  });
});

describe('translateFileTranslationComplete', () => {
  it('produces FileTranslationCompleteOutbound', () => {
    const file = {
      tranType: 'upload' as const,
      result: 'success' as const,
      fileType: 'WRPSig',
      fileIndex: 1,
      filePath: '/data/test.csv',
      ftpServerIp: '192.168.0.1',
    };
    const report = translateFileTranslationComplete(file, defaultEnvelope);

    expect(report.method).toBe('fileTranslationComplete');
    expect(report.tranType).toBe('upload');
  });
});

describe('translateSigReport', () => {
  it('produces SigReportOutbound', () => {
    const data = [{
      deviceCode: 'UE1',
      sigLog: [{
        collectTime: '2024-06-05 11:11:11',
        stIMSI: '77889966',
        direction: 'D' as const,
        source: 'gNB',
        destination: 'UE',
        protocol: 'NRRRC' as const,
        sig: 'mib',
      }],
    }];
    const report = translateSigReport(data, 'T1', 'TC1', defaultEnvelope);

    expect(report.method).toBe('sigReport');
    expect(report.taskId).toBe('T1');
    expect(report.data).toHaveLength(1);
    expect(report.data[0].sigLog).toHaveLength(1);
  });
});
