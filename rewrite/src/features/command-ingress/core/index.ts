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

// Catalog mapping (D004: task 模板 → 甲方用例 映射表)
export {
  CATALOG_MAPPINGS_KEY,
  loadCatalogMappings,
  persistCatalogMappings,
  upsertMapping,
  removeMapping,
  findMapping,
  selectEnabledMappings,
  markReported,
} from './catalog-mapping';
export type { CatalogMapping } from './catalog-mapping';

// Report config (D008: TestReport 内容配置驱动,三类 checkPoints/statisticsItems/attachItems)
export {
  moveReportItem,
  upsertReportConfig,
  removeReportConfig,
  findReportConfig,
  createEmptyReportConfig,
  isReportItem,
  isReportConfig,
} from './report-config';
export type { ReportItem, ReportConfig } from './report-config';

// Docking batch registry(批次元信息内存映射表,不持久化)
export { createDockingBatchRegistry } from './docking-batch-registry';
export type { DockingBatchRegistry, DockingBatchMeta, DockingBatchCaseMeta } from './docking-batch-registry';
