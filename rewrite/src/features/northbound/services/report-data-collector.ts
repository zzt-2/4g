import type { TaskStepResult } from '@/features/task/core';
import type { TestReportCheckPoint, TestReportProcessAndData } from '../core/test-report-generator';

export interface CollectedReportData {
  readonly processSteps: readonly TestReportProcessAndData[];
  readonly checkPoints: readonly TestReportCheckPoint[];
}

export interface ReportDataCollector {
  onStepResult(instanceId: string, result: TaskStepResult): void;
  collect(instanceId: string): CollectedReportData;
}

/**
 * 订阅 task 执行事件,按 instanceId 累积 processSteps(send) + checkPoints(wait)。
 * onTaskSettled 触发报告生成时,collect() 取出数据喂给 generateTestReport。
 */
export function createReportDataCollector(): ReportDataCollector {
  const store = new Map<string, { processSteps: TestReportProcessAndData[]; checkPoints: TestReportCheckPoint[] }>();

  function bucket(instanceId: string) {
    let b = store.get(instanceId);
    if (!b) {
      b = { processSteps: [], checkPoints: [] };
      store.set(instanceId, b);
    }
    return b;
  }

  return {
    onStepResult(instanceId, result) {
      const b = bucket(instanceId);
      if (result.kind === 'send') {
        const resolved = (result.sendResult as { resolvedFieldValues?: Record<string, unknown> })?.resolvedFieldValues ?? {};
        const resultDatas: Record<string, string> = {};
        for (const [k, v] of Object.entries(resolved)) {
          resultDatas[k] = String(v);
        }
        b.processSteps.push({
          stepName: `step-${result.stepIndex}`,
          initPars: {},
          setPars: {},
          resultDatas,
          startTime: '',
          endTime: '',
        });
      } else if (result.kind === 'wait-condition') {
        b.checkPoints.push({
          checkPoint: `step-${result.stepIndex}`,
          expectValue: '',
          testValue: result.matchedValue != null ? String(result.matchedValue) : '',
          result: result.matched ? '通过' : '未通过',
          msg: result.timedOut ? 'timeout' : '',
        });
      } else {
        // delay step: 记录为空 processStep(保留执行轨迹)
        b.processSteps.push({
          stepName: `step-${result.stepIndex}`,
          initPars: {},
          setPars: {},
          resultDatas: {},
          startTime: '',
          endTime: '',
        });
      }
    },
    collect(instanceId) {
      const b = store.get(instanceId);
      const data: CollectedReportData = {
        processSteps: b?.processSteps ?? [],
        checkPoints: b?.checkPoints ?? [],
      };
      store.delete(instanceId);
      return data;
    },
  };
}
