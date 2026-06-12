export const FRAME_DIRECTIONS = ['send', 'receive'] as const;
export const FRAME_DATA_TYPES = [
  'uint8',
  'int8',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'uint64',
  'int64',
  'float',
  'double',
  'bytes',
] as const;
export const FRAME_INPUT_TYPES = ['input', 'select', 'radio', 'expression'] as const;
export const DATA_PARTICIPATION_TYPES = ['direct', 'indirect'] as const;
export const EXPRESSION_SOURCE_TYPES = ['current_field', 'frame_field', 'global_stat'] as const;
export const IDENTIFIER_RULE_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'range', 'mask', 'any'] as const;
export const IDENTIFIER_LOGIC_OPERATORS = ['and', 'or'] as const;
export const CHECKSUM_METHODS = ['sum8', 'xor8', 'crc16', 'crc32', 'sum32', 'sum16', 'custom'] as const;

export type FrameDirection = (typeof FRAME_DIRECTIONS)[number];
export type FrameDataType = (typeof FRAME_DATA_TYPES)[number];
export type FrameInputType = (typeof FRAME_INPUT_TYPES)[number];
export type DataParticipationType = (typeof DATA_PARTICIPATION_TYPES)[number];
export type ExpressionSourceType = (typeof EXPRESSION_SOURCE_TYPES)[number];
export type IdentifierRuleOperator = (typeof IDENTIFIER_RULE_OPERATORS)[number];
export type IdentifierLogicOperator = (typeof IDENTIFIER_LOGIC_OPERATORS)[number];
export type ChecksumMethod = (typeof CHECKSUM_METHODS)[number];

export interface FrameOptionDefinition {
  value: string;
  label: string;
  isDefault?: boolean;
}

export interface IdentifierRule {
  startIndex: number;
  endIndex: number;
  operator: IdentifierRuleOperator;
  value: string;
  logicOperator: IdentifierLogicOperator;
}

export interface FrameChecksumDefinition {
  isChecksum: boolean;
  startFieldIndex: number;
  endFieldIndex: number;
  checksumMethod?: ChecksumMethod;
}

export interface ExpressionVariableDefinition {
  identifier: string;
  sourceType: ExpressionSourceType | string;
  sourceId?: string;
  frameId?: string;
  fieldId?: string;
}

export interface ConditionalExpressionDefinition {
  condition: string;
  expression: string;
}

export interface ExpressionDefinition {
  expressions: ConditionalExpressionDefinition[];
  variables: ExpressionVariableDefinition[];
}

export interface FrameFieldDefinition {
  id: string;
  name: string;
  dataType: FrameDataType;
  length: number;
  description?: string;
  validOption?: FrameChecksumDefinition;
  defaultValue?: string;
  inputType: FrameInputType;
  configurable: boolean;
  options: FrameOptionDefinition[];
  dataParticipationType: DataParticipationType;
  expressionConfig?: ExpressionDefinition;
  bigEndian?: boolean;
  isASCII?: boolean;
  factor?: number;
}

export interface FrameOptionsDefinition {
  autoChecksum: boolean;
  bigEndian: boolean;
  includeLengthField: boolean;
}

export interface FrameAsset {
  id: string;
  name: string;
  direction: FrameDirection;
  fields: FrameFieldDefinition[];
  description?: string;
  frameType?: string;
  protocol?: string;
  isFavorite?: boolean;
  options?: FrameOptionsDefinition;
  identifierRules?: IdentifierRule[];
  createdAt?: string;
  updatedAt?: string;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export type { ReadonlyDeep } from '@/shared/types/readonly-deep';

export type ReadonlyFrameFieldDefinition = ReadonlyDeep<FrameFieldDefinition>;
export type ReadonlyFrameAsset = ReadonlyDeep<FrameAsset>;
