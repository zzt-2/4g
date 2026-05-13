// Types
export {
  SCOE_COMMAND_FUNCTIONS,
  HEALTH_STATUSES,
  LINK_TEST_RESULTS,
} from './types';
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
} from './types';

// Protocol adapter interface
export type { ProtocolAdapter, ParsedCommand } from './protocol-adapter';

// Handler types
export type { CommandContext, CommandHandler, CommandResult } from './handler';
export { dispatchCommand } from './handler';

// Task builder
export { buildSendFrameTask, buildReadFileAndSendTask, buildWaitConditions } from './task-builder';

// State
export type {
  CommandIngressState,
  CommandIngressStateReader,
  CommandIngressStateWriter,
  CommandIngressStateContainer,
} from './state';
export { createCommandIngressState } from './state';

// Validation
export {
  validateGlobalConfig,
  validateSatelliteConfig,
  validateCommandConfig,
} from './validation';

// Highlight
export { calculateHighlights } from './highlight';
export type { HighlightRule, HighlightRuleConfig, Highlight, HighlightSeverity } from './highlight';
