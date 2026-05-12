// Core types
export {
  SCOE_COMMAND_FUNCTIONS,
  HEALTH_STATUSES,
  LINK_TEST_RESULTS,
} from './core';
export type {
  ScoeCommandFunction,
  ScoeGlobalConfig,
  ChecksumConfig,
  ScoeParamOption,
  ScoeCommandParam,
  FieldMapping,
  ScoeCommandFrameMapping,
  CompletionConditionOption,
  CompletionConditionConfig,
  ScoeCommandConfig,
  SatelliteConfig,
  HealthStatus,
  LinkTestResult,
  ScoeStatisticsSnapshot,
  ScoeRuntimeStatus,
  ProtocolAdapter,
  ParsedCommand,
  CommandContext,
  CommandHandler,
  CommandResult,
  CommandIngressState,
  CommandIngressStateReader,
  CommandIngressStateWriter,
  CommandIngressStateContainer,
} from './core';

// State factory
export { createCommandIngressState } from './core';

// Handler dispatch
export { dispatchCommand } from './core';

// Task builder
export { buildSendFrameTask, buildReadFileAndSendTask, buildWaitConditions } from './core';

// Validation
export {
  validateGlobalConfig,
  validateSatelliteConfig,
  validateCommandConfig,
} from './core';

// Highlight
export { calculateHighlights } from './core';
export type { HighlightRule, Highlight, HighlightSeverity } from './core';

// Adapters
export { createScoeProtocolAdapter } from './adapters';
export type { ScoeProtocolAdapterOptions } from './adapters';

// Services
export { createCommandIngressService } from './services/command-ingress-service';
export type { CommandIngressServiceOptions, CommandIngressService } from './services/command-ingress-service';
export { createDataRecorder } from './services/data-recorder';
export type { DataRecorder, DataRecord } from './services/data-recorder';

// Handlers (for direct use in tests)
export {
  createHandleLoadSatelliteId,
  handleUnloadSatelliteId,
  handleHealthCheck,
  handleLinkCheck,
  handleSendFrame,
  handleReadFileAndSend,
} from './handlers';
