// --- Core types ---
export type {
  OutboundEnvelope,
  InboundEnvelope,
  CustomerResponse,
  EnvelopeConfig,
  SetTestTaskRequest,
  TestTaskResource,
  TestCaseInfo,
  OrbitInfo,
  InputPar,
  ExecutionPlan,
  ExecutionPlanLayer,
  ExecutionPlanNode,
  ControlTestTaskRequest,
  ControlTestTaskResponse,
  HeartbeatRequest,
  GetSubSysStateRequest,
  GetDeviceListRequest,
  GetDeviceInfoRequest,
  SetDeviceInfoRequest,
  GetParsRequest,
  SetParsRequest,
  DataTransmitRequest,
  NeControlRequest,
  FtpInfo,
  GetTestCaseAllRequest,
  CustomerRequest,
  // Outbound types
  HeartbeatOutbound,
  TestCaseResultReportOutbound,
  MsgReportOutbound,
  StepInfoItem,
  DeviceInfoReportOutbound,
  DeviceInfoItem,
  DeviceParam,
  DeviceAlarmReportOutbound,
  DeviceAlarmItem,
  SubSysAlarmReportOutbound,
  SubSysAlarmItem,
  TestDataFileCompleteOutbound,
  FileTranslationCompleteOutbound,
  SigReportOutbound,
  SigReportDevice,
  SigLogEntry,
} from './core/types';

// --- Translators ---
export { translateTestCaseToTaskDefinition, translateTestCaseToMockTaskDefinition } from './core/inbound-translator';
export {
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
} from './core/outbound-translator';

// --- State ---
export { createNorthboundState, type NorthboundStateContainer, type NorthboundSessionSnapshot } from './state/northbound-state';

// --- Auth ---
export { createAuthService, type AuthService, type AuthConfig } from './services/auth';

// --- Heartbeat ---
export { createHeartbeatTimer, type HeartbeatTimer } from './services/heartbeat-timer';

// --- Service ---
export { createNorthboundService, type NorthboundService, type NorthboundConfig, type NorthboundServiceOptions, type FtpFacade, type FtpUploadConfig } from './services/northbound-service';

// --- Reported snapshot storage (encode 快照持久化,decode 时按 outCaseId 反查) ---
export { createReportedSnapshotStorage, type ReportedSnapshotStorage } from './services/reported-snapshot-storage';
