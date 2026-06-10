// --- Core types ---
export type {
  OutboundEnvelope,
  InboundEnvelope,
  CustomerResponse,
  EnvelopeConfig,
  SetTestTaskRequest,
  ExecutionPlanLayer,
  TestCaseInfo,
  TestCaseStep,
  WaitConditionDef,
  ControlTestTaskRequest,
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
