export { createStorageHighspeedService } from './services'
export type { StorageHighspeedService, StoragePlatformFacade, CreateServiceOptions } from './services'
export {
  compilePattern,
  matchesPrefix,
  matchFrameHeader,
  defaultConfig,
  defaultStats,
  validateHexPattern,
  validateRule,
} from './core'
export type {
  HighSpeedStorageConfig,
  FrameHeaderRule,
  StorageStatus,
  HighSpeedStorageStats,
  HighSpeedStorageState,
  RuleValidationResult,
} from './core'
export {
  selectStorageStatus,
  selectFormattedStats,
  selectCanActivate,
  selectRuleSummary,
} from './selectors'
export type { FormattedStats, RuleSummary } from './selectors'
export { useHighspeedStorage } from './composables/use-highspeed-storage'
export type { UseHighspeedStorage } from './composables/use-highspeed-storage'
