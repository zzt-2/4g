import type { TaskInstanceState } from '@/features/task';
import type { CaseVerdict } from '@/features/result';
import type { ReportConfig, ReportItem } from '@/features/command-ingress/core/report-config';
import type { EnvelopeConfig } from './types';

// --- TestReport types (customer format) ---

export interface TestReportCheckPoint {
  readonly checkPoint: string;
  readonly expectValue: string;
  readonly testValue: string;
  readonly result: '通过' | '未通过';
  readonly msg: string;
}

/** 甲方 TestReport.statisticsItems[] 一项(name→itemName,可选 expectValue/result)。 */
export interface TestReportStatisticsItem {
  readonly itemName: string;
  readonly testValue: string;
  readonly expectValue?: string;
  readonly result?: '通过' | '未通过';
  readonly msg: string;
}

/** 甲方 TestReport.attachItems[] 一项(结构同 statisticsItem)。 */
export interface TestReportAttachItem {
  readonly itemName: string;
  readonly testValue: string;
  readonly expectValue?: string;
  readonly result?: '通过' | '未通过';
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
  readonly statisticsItems: readonly TestReportStatisticsItem[];
  readonly attachItems: readonly TestReportAttachItem[];
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

// --- Config for mock data (D008 后废弃:checkPoints 改由 reportConfig 驱动) ---
// TestReportMockConfig 类型保留(GenerateTestReportInput.mockConfig 入参的类型,接口兼容);
// 原 DEFAULT_MOCK_CONFIG 假数据常量已删(D008:不再 fallback 假 checkPoints,诚实空着)。

export interface TestReportMockConfig {
  readonly checkPointDefs: readonly TestReportCheckPoint[];
  readonly processSteps: readonly TestReportProcessAndData[];
  readonly deviceIds: readonly string[];
}

// --- Generator ---

export interface GenerateTestReportInput {
  readonly instance: TaskInstanceState;
  readonly verdict: CaseVerdict;
  readonly testCaseId: string;
  readonly taskId: string;
  readonly config: EnvelopeConfig;
  /** @deprecated D008 后 checkPoints 改由 reportConfig 驱动;字段保留(接口兼容),不再生效。 */
  readonly mockConfig?: TestReportMockConfig;
  /** @deprecated D008 后 reportDataCollector 不接线;字段保留(接口兼容),永远 undefined。 */
  readonly collectedCheckPoints?: readonly TestReportCheckPoint[];
  /** @deprecated D008 后 reportDataCollector 不接线;字段保留(接口兼容),永远 undefined。 */
  readonly collectedProcessSteps?: readonly TestReportProcessAndData[];
  /** @deprecated 设备 id 采集;保留接口兼容。 */
  readonly collectedDeviceIds?: readonly string[];
  /** 配置驱动的报告内容(三类)。提供时优先于 mockConfig 和 collected*(D008)。 */
  readonly reportConfig?: ReportConfig;
  /** 字段值快照,按 dataItemId(frameId:fieldId)取 displayValue。 */
  readonly displaySnapshot?: ReadonlyMap<string, string>;
}

export function generateTestReport(input: GenerateTestReportInput): string {
  const { instance, verdict, testCaseId, taskId, config } = input;

  const startTime = instance.startedAt ?? verdict.startedAt;
  const endTime = instance.completedAt ?? instance.failedAt ?? instance.stoppedAt ?? verdict.finishedAt;
  const isPassed = verdict.verdict === 'passed';

  // 三类填充(D008:配置驱动)。
  // reportConfig 提供时 → 按清单从 displaySnapshot 取 displayValue 填三类;
  // reportConfig undefined(空壳 holder 阶段或模板没配)→ 三类全空 [],不 fallback
  // DEFAULT_MOCK_CONFIG(诚实空着,不造假)。mockConfig/collected* 字段保留(接口兼容)但不再生效。
  const snapshot = input.displaySnapshot ?? new Map<string, string>();
  const reportConfig = input.reportConfig;

  function toItemForCheckPoint(item: ReportItem): TestReportCheckPoint {
    const value = snapshot.get(`${item.frameId}:${item.fieldId}`) ?? '';
    return {
      checkPoint: item.name,
      expectValue: item.expectValue ?? '', // 可选;未配留空(checkPoint 期望值位置必填 string)
      testValue: value,
      result: isPassed ? '通过' : '未通过',
      msg: item.msg ?? '', // 甲方 TestReportCheckPoint.msg 必填 string,undefined 兜底空串
    };
  }
  function toItemPlain(item: ReportItem): TestReportStatisticsItem {
    const value = snapshot.get(`${item.frameId}:${item.fieldId}`) ?? '';
    return {
      itemName: item.name,
      expectValue: item.expectValue, // 可选,未配即 undefined(甲方 statisticsItem.expectValue 可选)
      testValue: value,
      msg: item.msg ?? '',
    };
  }

  const checkPoints = reportConfig ? reportConfig.checkPoints.map(toItemForCheckPoint) : [];
  const statisticsItems = reportConfig ? reportConfig.statisticsItems.map(toItemPlain) : [];
  const attachItems = reportConfig ? reportConfig.attachItems.map(toItemPlain) : [];

  // processAndDatas:本特性先留空(spec 不做项)。collectedProcessSteps 保留接口兼容,
  // collector 不接线所以永远 undefined → 空数组。
  const processSteps = input.collectedProcessSteps ?? [];
  const deviceIds = input.collectedDeviceIds ?? [];

  const testCase: TestReportTestCase = {
    testCaseId,
    resources: [],
    deviceIds,
    startTime,
    endTime,
    checkPoints,
    statisticsItems,
    attachItems,
    result: isPassed ? 'success' : 'fail',
    msg: isPassed ? 'ok' : verdict.verdict,
    judgmentMsg: '',
    processAndDatas: processSteps.map(step => ({
      ...step,
      startTime: step.startTime || startTime,
      endTime: step.endTime || endTime,
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
