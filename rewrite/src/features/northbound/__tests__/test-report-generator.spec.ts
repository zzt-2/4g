import { describe, it, expect } from 'vitest';
import { generateTestReport } from '../core/test-report-generator';
import type { TestReportJson, TestReportCheckPoint } from '../core/test-report-generator';
import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';

function makeInstance(overrides: Partial<TaskInstanceState> = {}): TaskInstanceState {
  return {
    instanceId: 'inst-1',
    definitionRef: {
      id: 'task-def-1',
      name: '激光链路测试',
      steps: [],
      schedule: { kind: 'immediate' },
      errorPolicy: { onFailure: 'stop' },
    },
    lifecycle: 'completed',
    startedAt: '2026-06-10 10:00:00',
    completedAt: '2026-06-10 10:00:05',
    currentStepIndex: 0,
    currentIteration: 0,
    stepResults: [],
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<CaseVerdict> = {}): CaseVerdict {
  return {
    instanceId: 'inst-1',
    taskDefinitionId: 'task-def-1',
    verdict: 'passed',
    judgedAt: '2026-06-10 10:00:05',
    startedAt: '2026-06-10 10:00:00',
    finishedAt: '2026-06-10 10:00:05',
    ...overrides,
  };
}

const envelopeConfig = { subSysType: 'ADS', subSysId: 'ADS_001', sessionId: 12345 };

describe('generateTestReport', () => {
  it('produces valid JSON matching TestReport structure', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.subSysType).toBe('ADS');
    expect(report.subSysId).toBe('ADS_001');
    expect(report.sessionId).toBe(12345);
    expect(report.taskId).toBe('T_001');
    expect(report.result).toBe('success');
    expect(report.msg).toBe('ok');
    expect(report.startTime).toBe('2026-06-10 10:00:00');
    expect(report.endTime).toBe('2026-06-10 10:00:05');
    expect(report.taskDatas).toEqual([]);
  });

  it('includes one testCase with correct id and deviceIds', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.testCaseList).toHaveLength(1);
    expect(report.testCaseList[0]!.testCaseId).toBe('ADS_TC_001');
    expect(report.testCaseList[0]!.deviceIds).toContain('ADS_LCT_01');
  });

  it('uses default mock checkPoints when no mockConfig provided', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);
    const cps = report.testCaseList[0]!.checkPoints;

    expect(cps).toHaveLength(4);
    expect(cps.map((c: TestReportCheckPoint) => c.checkPoint)).toEqual([
      '上电状态', '载波同步锁定', '帧同步锁定', '误码率',
    ]);
    expect(cps.every((c: TestReportCheckPoint) => c.result === '通过')).toBe(true);
  });

  it('uses default mock processAndDatas with 3 steps', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);
    const steps = report.testCaseList[0]!.processAndDatas;

    expect(steps).toHaveLength(3);
    expect(steps[0]!.stepName).toBe('发送帧');
    expect(steps[1]!.stepName).toBe('接收帧');
    expect(steps[2]!.stepName).toBe('校验结果');
  });

  it('marks all checkPoints as failed when verdict is failed', () => {
    const json = generateTestReport({
      instance: makeInstance({ lifecycle: 'failed', failedAt: '2026-06-10 10:00:03' }),
      verdict: makeVerdict({ verdict: 'failed', finishedAt: '2026-06-10 10:00:03' }),
      testCaseId: 'ADS_TC_002',
      taskId: 'T_002',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.result).toBe('fail');
    expect(report.testCaseList[0]!.result).toBe('fail');
    const cps = report.testCaseList[0]!.checkPoints;
    expect(cps.every((c: TestReportCheckPoint) => c.result === '未通过')).toBe(true);
  });

  it('uses custom mockConfig when provided', () => {
    const customCheckPoints: TestReportCheckPoint[] = [
      { checkPoint: '自定义检查', expectValue: 'OK', testValue: 'OK', result: '通过', msg: '' },
    ];

    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_CUSTOM',
      taskId: 'T_CUSTOM',
      config: envelopeConfig,
      mockConfig: {
        checkPointDefs: customCheckPoints,
        processSteps: [],
        deviceIds: ['CUSTOM_01'],
      },
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.testCaseList[0]!.checkPoints).toHaveLength(1);
    expect(report.testCaseList[0]!.checkPoints[0]!.checkPoint).toBe('自定义检查');
    expect(report.testCaseList[0]!.deviceIds).toEqual(['CUSTOM_01']);
    expect(report.testCaseList[0]!.processAndDatas).toHaveLength(0);
  });

  it('falls back to verdict timestamps when instance has no startedAt', () => {
    const json = generateTestReport({
      instance: makeInstance({ startedAt: undefined }),
      verdict: makeVerdict({ startedAt: '2026-06-10 12:00:00' }),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.startTime).toBe('2026-06-10 12:00:00');
  });
});
