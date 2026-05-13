// Core types
export {
  CHECKSUM_KINDS,
  SEND_RESULT_KINDS,
  SEND_SOURCES,
} from './core';
export type {
  ChecksumKind,
  FrameBuildOutput,
  ResolvedFieldValue,
  SendBuildInput,
  SendBuildIssue,
  SendCategoryStats,
  SendContext,
  SendError,
  SendFieldEncodingDef,
  SendFieldValue,
  SendFrameInstance,
  SendOptions,
  SendRequest,
  SendRequestRef,
  SendResult,
  SendResultKind,
  SendServiceStatus,
  SendSource,
  SendStateSnapshot,
  SendStatisticsSnapshot,
  SendStatsDelta,
} from './core';

// Core pure functions
export {
  buildFrame,
  resolveFieldValues,
  applyFactor,
  frameToBuildInput,
  evaluateFieldPreview,
  evaluateFieldPreviewForUI,
  calculateChecksum,
  checksumCrc32,
  checksumCrc16Modbus,
  checksumSum8,
  checksumXor8,
  applyBuildPostPatch,
} from './core';

// Services
export { createSendReader, createSendService } from './services';
export type { CreateSendServiceOptions, SendReader, SendService } from './services';

// Adapter ports
export type {
  SendFrameReader,
  SendTargetResolver,
  SendTransportWriter,
  SendTransportWriteOutcome,
  SendVariableProvider,
} from './adapters';
