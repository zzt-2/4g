import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';
import type { EnvelopeConfig } from './types';

// --- TestReport types (customer format) ---

export interface TestReportCheckPoint {
  readonly checkPoint: string;
  readonly expectValue: string;
  readonly testValue: string;
  readonly result: '通过' | '未通过';
  readonly msg: string;
}

export interface TestReportProcessAndData {
  readonly stepName: string;
  readonly initPars: Readonly<Record<string, string>>;
  readonly setPars: Readonly<Record<string, string>>;
  readonly resultDatas: Readonly<Record<string, string>>;
  readonly startTime: string;
  readonly endTime: string;
}

export interface TestReportTestCase {
  readonly testCaseId: string;
  readonly resources: readonly unknown[];
  readonly deviceIds: readonly string[];
  readonly startTime: string;
  readonly endTime: string;
  readonly checkPoints: readonly TestReportCheckPoint[];
  readonly statisticsItems: readonly unknown[];
  readonly attachItems: readonly unknown[];
  readonly result: 'success' | 'fail';
  readonly msg: string;
  readonly judgmentMsg: string;
  readonly processAndDatas: readonly TestReportProcessAndData[];
  readonly testParsInfo: readonly unknown[];
}

export interface TestReportJson {
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId: number;
  readonly taskId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly result: 'success' | 'fail';
  readonly msg: string;
  readonly testCaseList: readonly TestReportTestCase[];
  readonly taskDatas: readonly unknown[];
}

// --- Config for mock data ---

export interface TestReportMockConfig {
  readonly checkPointDefs: readonly TestReportCheckPoint[];
  readonly processSteps: readonly TestReportProcessAndData[];
  readonly deviceIds: readonly string[];
}

const DEFAULT_MOCK_CONFIG: TestReportMockConfig = {
  checkPointDefs: [
    { checkPoint: '上电状态', expectValue: '已上电', testValue: '0x0001', result: '通过', msg: '' },
    { checkPoint: '载波同步锁定', expectValue: '锁定', testValue: '0x0001', result: '通过', msg: '' },
    { checkPoint: '帧同步锁定', expectValue: '锁定', testValue: '0x0001', result: '通过', msg: '' },
    { checkPoint: '误码率', expectValue: '<1%', testValue: '0.2%', result: '通过', msg: '' },
  ],
  processSteps: [
    {
      stepName: '发送帧',
      initPars: {},
      setPars: {},
      resultDatas: { '发送速率': '5Gbps(QPSK)', '发送帧计数': '100' },
      startTime: '',
      endTime: '',
    },
    {
      stepName: '接收帧',
      initPars: {},
      setPars: {},
      resultDatas: { '接收速率': '5Gbps(QPSK)', '载波同步': '锁定', '帧同步': '锁定' },
      startTime: '',
      endTime: '',
    },
    {
      stepName: '校验结果',
      initPars: {},
      setPars: {},
      resultDatas: { '误码率': '0.2%', '接收数据帧计数': '98', '接收误帧计数': '2' },
      startTime: '',
      endTime: '',
    },
  ],
  deviceIds: ['ADS_LCT_01'],
};

// --- Generator ---

export interface GenerateTestReportInput {
  readonly instance: TaskInstanceState;
  readonly verdict: CaseVerdict;
  readonly testCaseId: string;
  readonly taskId: string;
  readonly config: EnvelopeConfig;
  readonly mockConfig?: TestReportMockConfig;
}

export function generateTestReport(input: GenerateTestReportInput): string {
  const { instance, verdict, testCaseId, taskId, config } = input;
  const mock = input.mockConfig ?? DEFAULT_MOCK_CONFIG;

  const startTime = instance.startedAt ?? verdict.startedAt;
  const endTime = instance.completedAt ?? instance.failedAt ?? instance.stoppedAt ?? verdict.finishedAt;

  const isPassed = verdict.verdict === 'passed';

  const testCase: TestReportTestCase = {
    testCaseId,
    resources: [],
    deviceIds: mock.deviceIds,
    startTime,
    endTime,
    checkPoints: mock.checkPointDefs.map(cp =>
      isPassed ? cp : { ...cp, result: '未通过' as const },
    ),
    statisticsItems: [],
    attachItems: [],
    result: isPassed ? 'success' : 'fail',
    msg: isPassed ? 'ok' : verdict.verdict,
    judgmentMsg: '',
    processAndDatas: mock.processSteps.map(step => ({
      ...step,
      startTime,
      endTime,
    })),
    testParsInfo: [],
  };

  const report: TestReportJson = {
    subSysType: config.subSysType,
    subSysId: config.subSysId,
    sessionId: config.sessionId ?? 0,
    taskId,
    startTime,
    endTime,
    result: isPassed ? 'success' : 'fail',
    msg: isPassed ? 'ok' : verdict.verdict,
    testCaseList: [testCase],
    taskDatas: [],
  };

  return JSON.stringify(report, null, 2);
}
