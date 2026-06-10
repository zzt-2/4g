import type { TaskInstanceState, TaskStepResult } from '@/features/task/core';
import type { CaseVerdict } from '@/features/result';
import type {
  OutboundEnvelope,
  EnvelopeConfig,
  TestCaseResultReportOutbound,
  MsgReportOutbound,
  StepInfoItem,
  HeartbeatOutbound,
  DeviceInfoReportOutbound,
  DeviceInfoItem,
  DeviceAlarmReportOutbound,
  DeviceAlarmItem,
  SubSysAlarmReportOutbound,
  SubSysAlarmItem,
  TestDataFileCompleteOutbound,
  FileTranslationCompleteOutbound,
  SigReportOutbound,
  SigReportDevice,
} from './types';

// --- Envelope helper ---

export function createEnvelope(method: string, config: EnvelopeConfig): OutboundEnvelope {
  return {
    method,
    requestId: Math.floor(Math.random() * 2147483648),
    subSysType: config.subSysType,
    subSysId: config.subSysId,
    sessionId: config.sessionId ?? Math.floor(Math.random() * 2147483648),
  };
}

// --- Existing translators (updated signatures) ---

const verdictMap: Record<string, 'success' | 'fail' | 'tbd'> = {
  passed: 'success',
  failed: 'fail',
  stopped: 'tbd',
};

export function translateTaskResult(
  instance: TaskInstanceState,
  verdict: CaseVerdict,
  testCaseId: string,
  taskId: string,
  config: EnvelopeConfig,
): TestCaseResultReportOutbound {
  return {
    ...createEnvelope('testCaseResultReport', config),
    taskId,
    testCaseId,
    loopIndex: instance.currentIteration + 1,
    result: verdictMap[verdict.verdict],
    msg: verdict.verdict === 'passed' ? 'ok' : verdict.verdict,
  };
}

export function translateStepResult(
  instance: TaskInstanceState,
  stepResult: TaskStepResult,
  testCaseId: string,
  taskId: string,
  config: EnvelopeConfig,
): MsgReportOutbound {
  const stepDef = instance.definitionRef.steps[stepResult.stepIndex];
  const isSuccess = isStepSuccess(stepResult);

  const item: StepInfoItem = {
    id: String(stepResult.stepIndex + 1),
    name: stepDef?.name ?? `Step ${stepResult.stepIndex}`,
    result: isSuccess ? 'success' : 'fail',
    msgTime: formatNow(),
  };

  return {
    ...createEnvelope('msgReport', config),
    taskId,
    testCaseId,
    stepInfo: [item],
  };
}

// --- New translators ---

export function translateHeartbeat(subSysId: string, timer: number): HeartbeatOutbound {
  return {
    method: 'heartbeat',
    requestId: Math.floor(Math.random() * 2147483648),
    subSysType: '',
    subSysId,
    sessionId: 0,
    timer,
    time: new Date().toISOString().slice(0, 19),
  };
}

export function translateDeviceInfoReport(
  items: readonly DeviceInfoItem[],
  config: EnvelopeConfig,
): DeviceInfoReportOutbound {
  return {
    ...createEnvelope('deviceInfoReport', config),
    datas: items,
  };
}

export function translateDeviceAlarmReport(
  items: readonly DeviceAlarmItem[],
  config: EnvelopeConfig,
): DeviceAlarmReportOutbound {
  return {
    ...createEnvelope('deviceAlarmReport', config),
    datas: items,
  };
}

export function translateSubSysAlarmReport(
  items: readonly SubSysAlarmItem[],
  config: EnvelopeConfig,
): SubSysAlarmReportOutbound {
  return {
    ...createEnvelope('subSysAlarmReport', config),
    datas: items,
  };
}

export function translateTestDataFileComplete(
  file: Omit<TestDataFileCompleteOutbound, keyof OutboundEnvelope>,
  config: EnvelopeConfig,
): TestDataFileCompleteOutbound {
  return {
    ...createEnvelope('testDataFileTranslationComplete', config),
    ...file,
  };
}

export function translateFileTranslationComplete(
  file: Omit<FileTranslationCompleteOutbound, keyof OutboundEnvelope>,
  config: EnvelopeConfig,
): FileTranslationCompleteOutbound {
  return {
    ...createEnvelope('fileTranslationComplete', config),
    ...file,
  };
}

export function translateSigReport(
  data: readonly SigReportDevice[],
  taskId: string,
  testCaseId: string,
  config: EnvelopeConfig,
): SigReportOutbound {
  return {
    ...createEnvelope('sigReport', config),
    taskId,
    testCaseId,
    data,
  };
}

// --- Internal helpers ---

function isStepSuccess(stepResult: TaskStepResult): boolean {
  switch (stepResult.kind) {
    case 'send':
      return stepResult.sendResult.kind === 'sent';
    case 'wait-condition':
      return stepResult.matched;
    case 'delay':
      return stepResult.completed;
  }
}

function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
