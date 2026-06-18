// --- Envelope types ---

import type { TaskDefinition } from '@/features/task/core';

export interface OutboundEnvelope {
  readonly method: string;
  readonly requestId: number;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId: number;
}

export interface InboundEnvelope {
  readonly method: string;
  readonly requestId: number;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId?: number;
}

export interface CustomerResponse {
  readonly method: string;
  readonly requestId: number;
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId: number;
  readonly statusCode: 1 | 2;
  readonly msg: string;
  /** getTestCaseAll 等接口返回的用例数据 */
  readonly datas?: readonly unknown[];
}

export interface EnvelopeConfig {
  readonly subSysType: string;
  readonly subSysId: string;
  readonly sessionId?: number;
}

// --- Inbound request types ---

// HAR-aligned setTestTask payload (see rewrite/docs/10.15.5.53.har /dispatch/data response).
// Envelope fields (method/requestId/subSysType/subSysId/sessionId) come from InboundEnvelope.
export interface SetTestTaskRequest extends InboundEnvelope {
  readonly method: 'setTestTask';
  readonly resources: readonly TestTaskResource[];
  readonly taskId: string;                 // 'T_178022737246337558'
  readonly taskName: string;
  readonly immediate: boolean;
  readonly repeatCount: number;
  readonly isEnd: boolean;
  readonly orbitProtectTime: number;       // seconds
  readonly testCaseInfo: readonly TestCaseInfo[];
  readonly ftpInfo: FtpInfo | null;
  readonly executionPlan: ExecutionPlan;
}

export interface TestTaskResource {
  readonly satelliteId: string;
  readonly loadIds: readonly string[];
  readonly payload: readonly { readonly ip?: string; readonly payloadId?: string }[];
}

export interface TestCaseInfo {
  readonly testCaseId: string;
  readonly deviceIds?: readonly string[];   // ['KPS_UE_202']  (optional per 04-任务管理.md)
  readonly masterTest?: boolean;
  readonly testMode?: 1 | 2;
  readonly ephMode?: 1 | 2;
  readonly orbitInfo?: readonly OrbitInfo[] | null;
  readonly inputPars?: readonly InputPar[];
}

export interface OrbitInfo {
  readonly subSysId?: string;
  readonly satelliteId?: string;
  readonly satelliteType?: string;
  readonly cellIds?: readonly string[];
  readonly stationId?: string;
  readonly orbitId?: string;
  readonly loopNum?: number;
  readonly startTime?: string;
  readonly endTime?: string;
}

export interface InputPar {
  readonly parId: string;
  readonly value: string;
}

export interface ExecutionPlan {
  readonly layers: readonly ExecutionPlanLayer[];
}

export interface ExecutionPlanLayer {
  readonly layer: number;                  // NOTE: 'layer' not 'layerNo'
  readonly parallel: boolean;
  readonly nodes: readonly string[];  // testCaseId strings (04-任务管理.md: nodes is plain id list)
}

// V1.0.4 controlTestTask: single taskId + action (not testCaseIdList[] + controlType).
// Response adds handleCode + taskId echo on top of CustomerResponse.
export interface ControlTestTaskRequest extends InboundEnvelope {
  readonly method: 'controlTestTask';
  readonly taskId: string;
  readonly action: 'pause' | 'continue' | 'stop' | 'abort';
}

export interface ControlTestTaskResponse extends CustomerResponse {
  readonly method: 'controlTestTask';
  readonly taskId: string;
  readonly handleCode: 0 | 1 | 2;           // 0=ok, 1=busy, 2=env not ready
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HeartbeatRequest {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetSubSysStateRequest {}

// --- Inbound stub request types ---

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetDeviceListRequest {}

export interface GetDeviceInfoRequest {
  readonly deviceIds: readonly string[];
}

export interface SetDeviceInfoRequest {
  readonly deviceData: Record<string, unknown>;
}

export interface GetParsRequest {
  readonly taskId?: string;
  readonly imsi?: string;
  readonly parIds: readonly string[];
}

export interface SetParsRequest {
  readonly taskId?: string;
  readonly imsi?: string;
  readonly pars: readonly { readonly parId: string; readonly value: string }[];
}

export interface DataTransmitRequest {
  readonly msgList: readonly {
    readonly data: {
      readonly relationId: string;
      readonly statusCode: string;
      readonly statusMsg?: string;
      readonly msgValue?: string;
      readonly filePath?: string;
    };
  }[];
}

export interface NeControlRequest {
  readonly neType: 'sys' | 'device';
  readonly optType: 'powerOn' | 'powerOff' | 'restart';
  readonly deviceId: readonly string[];
}

export interface FtpInfo {
  readonly ip?: string;
  readonly port?: number;
  readonly username?: string;
  readonly password?: string;
  readonly dir?: string;
}

export interface GetTestCaseAllRequest {
  readonly ftpInfo?: FtpInfo;
}

export type CustomerRequest =
  | { readonly kind: 'setTestTask'; readonly body: SetTestTaskRequest }
  | { readonly kind: 'controlTestTask'; readonly body: ControlTestTaskRequest }
  | { readonly kind: 'heartbeat'; readonly body: HeartbeatRequest }
  | { readonly kind: 'getSubSysState'; readonly body: GetSubSysStateRequest }
  | { readonly kind: 'getDeviceList'; readonly body: GetDeviceListRequest }
  | { readonly kind: 'getDeviceInfo'; readonly body: GetDeviceInfoRequest }
  | { readonly kind: 'setDeviceInfo'; readonly body: SetDeviceInfoRequest }
  | { readonly kind: 'getPars'; readonly body: GetParsRequest }
  | { readonly kind: 'setPars'; readonly body: SetParsRequest }
  | { readonly kind: 'dataTransmit'; readonly body: DataTransmitRequest }
  | { readonly kind: 'neControl'; readonly body: NeControlRequest }
  | { readonly kind: 'getTestCaseAll'; readonly body: GetTestCaseAllRequest };

// --- Outbound types (9 interfaces) ---

// 1. heartbeat
export interface HeartbeatOutbound extends OutboundEnvelope {
  readonly method: 'heartbeat';
  readonly timer: number;
  readonly time: string;
}

// 2. testCaseResultReport
export interface TestCaseResultReportOutbound extends OutboundEnvelope {
  readonly method: 'testCaseResultReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly loopIndex: number;
  readonly result: 'success' | 'fail' | 'tbd';
  readonly msg: string;
}

// 3. msgReport
export interface MsgReportOutbound extends OutboundEnvelope {
  readonly method: 'msgReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly stepInfo: readonly StepInfoItem[];
}

export interface StepInfoItem {
  readonly id: string;
  readonly name: string;
  readonly result?: 'success' | 'fail';
  readonly msg?: string;
  readonly msgTime: string;
}

// 4. deviceInfoReport
export interface DeviceInfoReportOutbound extends OutboundEnvelope {
  readonly method: 'deviceInfoReport';
  readonly datas: readonly DeviceInfoItem[];
}

export interface DeviceInfoItem {
  readonly name: string;
  readonly deviceId: string;
  readonly type: string;
  readonly ip?: string;
  readonly port?: number;
  readonly phoneNumber?: string;
  readonly imsi?: string;
  readonly departments?: string;
  readonly position?: string;
  readonly manufacturer?: string;
  readonly swVer: string;
  readonly status: 'online' | 'offline' | 'alarm' | 'error' | 'busying' | 'available';
  readonly remark?: string;
  readonly pars?: readonly DeviceParam[];
}

export interface DeviceParam {
  readonly parId: string;
  readonly parName: string;
  readonly value: string;
  readonly unit: string;
}

// 5. deviceAlarmReport
export interface DeviceAlarmReportOutbound extends OutboundEnvelope {
  readonly method: 'deviceAlarmReport';
  readonly datas: readonly DeviceAlarmItem[];
}

export interface DeviceAlarmItem {
  readonly alarmId: string;
  readonly deviceId: string;
  readonly severity: 'critical' | 'major' | 'warn' | 'clear';
  readonly warnTime: string;
  readonly msg: string;
}

// 6. subSysAlarmReport
export interface SubSysAlarmReportOutbound extends OutboundEnvelope {
  readonly method: 'subSysAlarmReport';
  readonly datas: readonly SubSysAlarmItem[];
}

export interface SubSysAlarmItem {
  readonly alarmId: string;
  readonly severity: 'critical' | 'major' | 'warn' | 'clear';
  readonly warnTime: string;
  readonly msg: string;
}

// 7. testDataFileTranslationComplete
export interface TestDataFileCompleteOutbound extends OutboundEnvelope {
  readonly method: 'testDataFileTranslationComplete';
  readonly taskId: string;
  readonly result?: 'success' | 'fail';
  readonly msg?: string;
  readonly testCaseId: readonly string[];
  readonly imsi?: string;
  readonly ueFlag?: '1' | '2';
  readonly ftpServerIP: string;
  readonly fileType: string;
  readonly filePath: string;
  readonly fileFormat?: 'pic' | 'voice' | '';
  readonly fileTitle?: string;
}

// 8. fileTranslationComplete
export interface FileTranslationCompleteOutbound extends OutboundEnvelope {
  readonly method: 'fileTranslationComplete';
  readonly tranType: 'upload' | 'download';
  readonly result: 'success' | 'fail';
  readonly fileType: string;
  readonly fileIndex: number;
  readonly filePath: string;
  readonly ftpServerIp: string;
}

// 9. sigReport
export interface SigReportOutbound extends OutboundEnvelope {
  readonly method: 'sigReport';
  readonly taskId: string;
  readonly testCaseId: string;
  readonly data: readonly SigReportDevice[];
}

export interface SigReportDevice {
  readonly deviceCode: string;
  readonly sigLog: readonly SigLogEntry[];
}

export interface SigLogEntry {
  readonly collectTime: string;
  readonly stIMSI: string;
  readonly direction: 'U' | 'D';
  readonly source: string;
  readonly destination: string;
  readonly protocol: 'NRRRC' | 'NRNAS' | 'SIP';
  readonly sig: string;
}

// --- testcase-sync 相关类型 ---

/** 上报给甲方的用例(caseTemplate 结构,对齐 04-任务管理.md) */
export interface CustomerTestCase {
  readonly outCaseId: string;
  readonly caseName: string;
  readonly caseType: string;
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
  readonly durate: number;
  readonly satelliteCount: number;
  readonly stationCount: number;
  readonly isParent: boolean;
  readonly inputPars: readonly InputPar[];
  readonly execSteps?: string;
  readonly remark?: string;
}

/** laser 子系统的全局配置(subSysId/menuId 等) */
export interface NorthboundTestCaseConfig {
  readonly subSysId: string;
  readonly subSysName: string;
  readonly menuId: string;
  readonly menuName: string;
  readonly caseType: string;
  readonly depSubSys?: string;
  readonly depSubNe?: string;
}

/** 上报快照(decode 时按 outCaseId 反查) */
export interface ReportedSnapshot {
  readonly outCaseId: string;
  readonly templateId: string;
  readonly definition: TaskDefinition;
  readonly overridablePaths: readonly string[];
  readonly reportedAt: number;
}

/** 覆盖警告 */
export interface OverrideWarning {
  readonly parId: string;
  readonly reason: 'not-in-whitelist' | 'path-not-found' | 'type-mismatch';
  readonly detail: string;
}
