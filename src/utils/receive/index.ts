/**
 * 接收帧工具函数统一导出
 */

// 帧匹配工具
export { createMatchRules, matchFrame, validateMatchRules } from './frameMatchers';

// 帧验证工具
export {
  validateMappings,
  validateDataGroups,
  validateFrameFields,
  checkMappingCircularDependency,
} from './frameValidators';

// 标签选项生成工具
export {
  generateLabelOptions,
  generateSmartLabelOptions,
  formatDisplayValue,
  generateLabelOptionsFromField,
} from './labelOptionGenerators';

// 数据处理工具
export {
  createDataPacket,
  matchDataToFrame,
  extractFieldValue,
  processReceivedData,
  applyDataProcessResult,
} from './dataProcessor';

// 重新导出类型
export type { FrameMatchRule, ValidationResult } from '../../types/frames/receive';
