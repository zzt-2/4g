import { describe, it, expect } from 'vitest';
import { generateTestReport } from '../core/test-report-generator';
import type { TestReportJson, TestReportCheckPoint } from '../core/test-report-generator';
import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';
import type { ReportConfig } from '@/features/command-ingress/core/report-config';

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

  it('includes one testCase with correct id (deviceIds empty unless collected)', () => {
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
    // D008: deviceIds 走 collectedDeviceIds(执行链路采集);无采集则空,不 fallback mock。
    expect(report.testCaseList[0]!.deviceIds).toEqual([]);
  });

  // D008: 没配 ReportConfig 的用例,报告三类为空(不 fallback DEFAULT_MOCK_CONFIG 假数据)。
  // 旧版"uses default mock checkPoints"测的是已废弃的 fallback 行为,改成诚实空着。
  it('produces empty three categories when no reportConfig provided (no mock fallback)', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);
    const tc = report.testCaseList[0]!;

    expect(tc.checkPoints).toEqual([]);
    expect(tc.statisticsItems).toEqual([]);
    expect(tc.attachItems).toEqual([]);
  });

  // D008: processAndDatas(每步执行轨迹)本特性先留空(配置驱动是另一特性)。
  it('produces empty processAndDatas when no collected steps', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
    });

    const report: TestReportJson = JSON.parse(json);
    const steps = report.testCaseList[0]!.processAndDatas;

    expect(steps).toHaveLength(0);
  });

  // verdict failed 时,reportConfig 驱动的 checkPoint result 标"未通过"(纯取值但仍带判定结果字段)。
  it('marks reportConfig checkPoints as 未通过 when verdict is failed', () => {
    const reportConfig: ReportConfig = {
      templateId: 'tpl',
      checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }],
      statisticsItems: [],
      attachItems: [],
    };
    const json = generateTestReport({
      instance: makeInstance({ lifecycle: 'failed', failedAt: '2026-06-10 10:00:03' }),
      verdict: makeVerdict({ verdict: 'failed', finishedAt: '2026-06-10 10:00:03' }),
      testCaseId: 'ADS_TC_002',
      taskId: 'T_002',
      config: envelopeConfig,
      reportConfig,
      displaySnapshot: new Map([['fA:lock', '锁定']]),
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.result).toBe('fail');
    expect(report.testCaseList[0]!.result).toBe('fail');
    const cps = report.testCaseList[0]!.checkPoints;
    expect(cps.every((c: TestReportCheckPoint) => c.result === '未通过')).toBe(true);
  });

  // D008: mockConfig 字段保留(接口兼容,collector 不接线)但不再驱动 checkPoints——
  // 即使提供 mockConfig,无 reportConfig 时三类仍空(诚实非造假)。
  it('ignores mockConfig for checkPoints when no reportConfig (D008: no fake fallback)', () => {
    const json = generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(),
      testCaseId: 'ADS_TC_CUSTOM',
      taskId: 'T_CUSTOM',
      config: envelopeConfig,
      mockConfig: {
        checkPointDefs: [
          { checkPoint: '自定义检查', expectValue: 'OK', testValue: 'OK', result: '通过', msg: '' },
        ],
        processSteps: [],
        deviceIds: ['CUSTOM_01'],
      },
    });

    const report: TestReportJson = JSON.parse(json);

    expect(report.testCaseList[0]!.checkPoints).toEqual([]); // 不 fallback mockConfig
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

describe('generateTestReport — reportConfig driven (D008)', () => {
  const reportConfig: ReportConfig = {
    templateId: 'tpl',
    checkPoints: [
      { id: 'i1', name: '载波同步锁定', frameId: 'fA', fieldId: 'lock', msg: '说明1' },
    ],
    statisticsItems: [
      { id: 'i2', name: '误码率', frameId: 'fA', fieldId: 'ber' },
    ],
    attachItems: [
      { id: 'i3', name: '备注', frameId: 'fB', fieldId: 'note' },
    ],
  };

  function gen(overrides: { reportConfig?: ReportConfig; displaySnapshot?: Map<string, string>; verdict?: Partial<CaseVerdict> } = {}) {
    return generateTestReport({
      instance: makeInstance(),
      verdict: makeVerdict(overrides.verdict),
      testCaseId: 'ADS_TC_001',
      taskId: 'T_001',
      config: envelopeConfig,
      reportConfig: overrides.reportConfig,
      displaySnapshot: overrides.displaySnapshot,
    });
  }

  it('fills three categories from reportConfig + displaySnapshot', () => {
    const snapshot = new Map([
      ['fA:lock', '锁定'],
      ['fA:ber', '0.2%'],
      ['fB:note', '正常'],
    ]);
    const json = gen({ reportConfig, displaySnapshot: snapshot });
    const tc = JSON.parse(json).testCaseList[0];

    // checkPoint: name → checkPoint, 取值 → testValue, expectValue 空(纯取值), msg → msg
    expect(tc.checkPoints[0].checkPoint).toBe('载波同步锁定');
    expect(tc.checkPoints[0].testValue).toBe('锁定');
    expect(tc.checkPoints[0].expectValue).toBe('');
    expect(tc.checkPoints[0].result).toBe('通过'); // verdict passed
    expect(tc.checkPoints[0].msg).toBe('说明1');
    // statisticsItem: name → itemName, 取值 → testValue, 无判定 result
    expect(tc.statisticsItems[0].itemName).toBe('误码率');
    expect(tc.statisticsItems[0].testValue).toBe('0.2%');
    // attachItem
    expect(tc.attachItems[0].itemName).toBe('备注');
    expect(tc.attachItems[0].testValue).toBe('正常');
  });

  it('fills empty testValue when field not in snapshot (诚实标记没采到)', () => {
    const snapshot = new Map<string, string>(); // 空 snapshot
    const json = gen({ reportConfig, displaySnapshot: snapshot });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].testValue).toBe('');
    expect(tc.statisticsItems[0].testValue).toBe('');
    expect(tc.attachItems[0].testValue).toBe('');
  });

  it('falls back to empty msg when ReportItem.msg undefined (甲方 msg 是必填 string)', () => {
    const cfg: ReportConfig = {
      templateId: 'tpl',
      checkPoints: [{ id: 'i1', name: '载波同步', frameId: 'fA', fieldId: 'lock' }], // 无 msg
      statisticsItems: [{ id: 'i2', name: '误码率', frameId: 'fA', fieldId: 'ber' }],
      attachItems: [],
    };
    const json = gen({ reportConfig: cfg, displaySnapshot: new Map([['fA:lock', '锁定'], ['fA:ber', '0.2%']]) });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].msg).toBe('');
    expect(tc.statisticsItems[0].msg).toBe('');
  });

  it('marks checkPoint result 未通过 when verdict failed', () => {
    const json = gen({
      reportConfig,
      displaySnapshot: new Map([['fA:lock', '锁定']]),
      verdict: { verdict: 'failed', finishedAt: '2026-06-10 10:00:03' },
    });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].result).toBe('未通过');
  });

  it('keeps item order within each category', () => {
    const cfg: ReportConfig = {
      templateId: 'tpl',
      checkPoints: [
        { id: 'a', name: '第一', frameId: 'fA', fieldId: 'lock' },
        { id: 'b', name: '第二', frameId: 'fA', fieldId: 'lock' },
        { id: 'c', name: '第三', frameId: 'fA', fieldId: 'lock' },
      ],
      statisticsItems: [],
      attachItems: [],
    };
    const json = gen({ reportConfig: cfg, displaySnapshot: new Map([['fA:lock', '锁定']]) });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints.map((c: { checkPoint: string }) => c.checkPoint)).toEqual(['第一', '第二', '第三']);
  });

  // expectValue(期望结果)可选字段:三类都支持。checkPoint 必填位置兜底空串,
  // statisticsItem/attachItem 可选位置原样透传 undefined。
  it('fills expectValue in all three categories when provided', () => {
    const cfg: ReportConfig = {
      templateId: 'tpl',
      checkPoints: [{ id: 'cp', name: '载波同步', frameId: 'fA', fieldId: 'lock', expectValue: '锁定' }],
      statisticsItems: [{ id: 'st', name: '误码率', frameId: 'fA', fieldId: 'ber', expectValue: '<1%' }],
      attachItems: [{ id: 'at', name: '附加', frameId: 'fA', fieldId: 'x', expectValue: '期望X' }],
    };
    const json = gen({ reportConfig: cfg, displaySnapshot: new Map([['fA:lock', '锁定'], ['fA:ber', '0.2%'], ['fA:x', '实测X']]) });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].expectValue).toBe('锁定');     // 必填位置,有值
    expect(tc.statisticsItems[0].expectValue).toBe('<1%');   // 可选位置,有值
    expect(tc.attachItems[0].expectValue).toBe('期望X');     // 可选位置,有值
  });

  it('leaves expectValue empty string for checkPoint when not provided', () => {
    const cfg: ReportConfig = {
      templateId: 'tpl',
      checkPoints: [{ id: 'cp', name: '载波同步', frameId: 'fA', fieldId: 'lock' }], // 无 expectValue
      statisticsItems: [{ id: 'st', name: '误码率', frameId: 'fA', fieldId: 'ber' }],
      attachItems: [],
    };
    const json = gen({ reportConfig: cfg, displaySnapshot: new Map([['fA:lock', '锁定'], ['fA:ber', '0.2%']]) });
    const tc = JSON.parse(json).testCaseList[0];
    expect(tc.checkPoints[0].expectValue).toBe('');          // checkPoint 兜底空串(必填)
    expect(tc.statisticsItems[0].expectValue).toBeUndefined(); // 可选位置,未配即 undefined
  });
});

