import type { ComparisonOperator } from '@/shared/condition-operators';

// --- Enums ---

export const SCOE_COMMAND_FUNCTIONS = [
  'load_satellite_id',
  'unload_satellite_id',
  'health_check',
  'link_check',
  'send_frame',
  'read_file_and_send',
] as const;
export type ScoeCommandFunction = (typeof SCOE_COMMAND_FUNCTIONS)[number];

// --- Global config (protocol layer) ---

export interface ScoeGlobalConfig {
  readonly scoeIdentifier: string;
  readonly tcpServerIp: string;
  readonly tcpServerPort: number;
  readonly tcpServerAutoConnect: boolean;
  readonly udpIpAddress: string;
  readonly udpPort: number;
  readonly udpTargetId: string;
  readonly messageIdentifierOffset: number;
  readonly sourceIdentifierOffset: number;
  readonly destinationIdentifierOffset: number;
  readonly modelIdOffset: number;
  readonly satelliteIdOffset: number;
  readonly functionCodeOffset: number;
  readonly successFrameId?: string;
}

// --- Command config (command layer) ---

export interface ChecksumConfig {
  readonly enabled: boolean;
  readonly offset: number;
  readonly length: number;
  readonly checksumOffset: number;
}

export interface ScoeParamOption {
  readonly label: string;
  readonly value: string;
  readonly receiveCode: string;
}

export interface ScoeCommandParam {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly offset: number;
  readonly length: number;
  readonly targetInstanceId?: string;
  readonly targetFieldId?: string;
  readonly options: readonly ScoeParamOption[];
}

export interface FieldMapping {
  readonly fieldId: string;
  readonly source: 'fixed' | 'param';
  readonly fixedValue?: string | number;
  readonly paramId?: string;
}

export interface ScoeCommandFrameMapping {
  readonly frameId: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly description?: string;
  readonly targetId: string;
  readonly fieldMappings: readonly FieldMapping[];
}

export interface CompletionConditionOption {
  readonly operator: ComparisonOperator;
  readonly matchValue: string;
}

export interface CompletionConditionConfig {
  readonly id: string;
  readonly label: string;
  readonly sourceFrameId: string;
  readonly sourceFieldId: string;
  readonly useParam: boolean;
  readonly targetParamId?: string;
  readonly targetFixedValue?: string;
  readonly operator?: ComparisonOperator;
  readonly options?: readonly CompletionConditionOption[];
}

export interface ScoeCommandConfig {
  readonly id: string;
  readonly label: string;
  readonly code: string;
  readonly function: ScoeCommandFunction;
  readonly checksums: readonly ChecksumConfig[];
  readonly params?: readonly ScoeCommandParam[];
  readonly frameMappings?: readonly ScoeCommandFrameMapping[];
  readonly completionConditions?: readonly CompletionConditionConfig[];
  readonly completionTimeout?: number;
  readonly successFrameId?: string;
  readonly sendInterval?: number;
}

// --- Satellite config ---

export interface SatelliteConfig {
  readonly satelliteId: string;
  readonly messageIdentifier: string;
  readonly sourceIdentifier: string;
  readonly destinationIdentifier: string;
  readonly modelId: string;
  readonly commandConfigs: readonly ScoeCommandConfig[];
}

// --- Health / link status ---

export const HEALTH_STATUSES = ['unknown', 'healthy', 'error'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const LINK_TEST_RESULTS = ['unknown', 'pass', 'fail'] as const;
export type LinkTestResult = (typeof LINK_TEST_RESULTS)[number];

// --- Statistics snapshot (selector output) ---

export interface ScoeStatisticsSnapshot {
  readonly commandReceiveCount: number;
  readonly commandSuccessCount: number;
  readonly commandErrorCount: number;
  readonly runtimeSeconds: number;
  readonly satelliteIdRuntimeSeconds: number;
  readonly lastErrorReason: string;
}

// --- Runtime status (selector output) ---

export interface ScoeRuntimeStatus {
  readonly loadedSatelliteId: string;
  readonly scoeFramesLoaded: boolean;
  readonly healthStatus: HealthStatus;
  readonly linkTestResult: LinkTestResult;
  readonly lastCommandCode: string;
  readonly receiveCommandSuccess: boolean;
}
