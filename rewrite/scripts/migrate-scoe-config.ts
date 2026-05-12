/**
 * Migration script: old SCOE config JSON → new ScoeCommandConfig[] JSON
 *
 * Usage: npx tsx rewrite/scripts/migrate-scoe-config.ts <input.json> <output.json>
 *
 * Input format (old): { commands: OldScoeReceiveCommand[], globalConfig: OldScoeGlobalConfig }
 * Output format (new): { commandConfigs: ScoeCommandConfig[], globalConfig: ScoeGlobalConfig }
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// --- Old types (source) ---

interface OldHighlightConfigs {
  [key: string]: unknown;
}

interface OldScoeGlobalConfig {
  scoeIdentifier: string;
  tcpServerIp: string;
  tcpServerPort: number;
  tcpServerAutoConnect?: boolean;
  udpIpAddress: string;
  udpPort: number;
  messageIdentifierOffset: number;
  sourceIdentifierOffset: number;
  destinationIdentifierOffset: number;
  modelIdOffset: number;
  satelliteIdOffset: number;
  functionCodeOffset: number;
  successFrameId?: string;
  highlightConfigs?: OldHighlightConfigs;
}

type OldMatchOperator = 'equal' | 'not_equal' | 'greater_than' | 'less_than' | 'greater_equal' | 'less_equal' | 'contains';

interface OldChecksumConfig {
  enabled: boolean;
  offset: number;
  length: number;
  checksumOffset: number;
}

interface OldScoeParamOption {
  label: string;
  value: string;
  receiveCode: string;
}

interface OldScoeCommandParams {
  id: string;
  label: string;
  value: string;
  type: 'string' | 'number' | 'boolean';
  offset: number;
  length: number;
  targetInstanceId?: string;
  targetFieldId?: string;
  options: OldScoeParamOption[];
}

interface OldCompletionConditionOption {
  operator: OldMatchOperator;
  matchValue: string;
}

interface OldCompletionCondition {
  id: string;
  label: string;
  sourceFrameId: string;
  sourceFieldId: string;
  useParam: boolean;
  targetParamId?: string;
  targetFixedValue?: string;
  operator?: OldMatchOperator;
  options?: OldCompletionConditionOption[];
}

type OldScoeCommandFunction =
  | 'load_satellite_id'
  | 'unload_satellite_id'
  | 'health_check'
  | 'link_check'
  | 'send_frame'
  | 'read_file_and_send';

interface OldSendFrameInstance {
  id: string;
  frameId: string;
  label?: string;
  description?: string;
  targetId?: string;
  fields?: OldSendInstanceField[];
  [key: string]: unknown;
}

interface OldSendInstanceField {
  id: string;
  value?: string | number;
  targetInstanceId?: string;
  targetFieldId?: string;
  [key: string]: unknown;
}

interface OldScoeReceiveCommand {
  id: string;
  label: string;
  code: string;
  function: OldScoeCommandFunction;
  checksums: OldChecksumConfig[];
  params?: OldScoeCommandParams[];
  frameInstances?: OldSendFrameInstance[];
  completionConditions?: OldCompletionCondition[];
  completionTimeout?: number;
  successFrameId?: string;
  sendInterval?: number;
}

// --- New types (target) ---

type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'change' | 'any';

interface NewFieldMapping {
  fieldId: string;
  source: 'fixed' | 'param';
  fixedValue?: string | number;
  paramId?: string;
}

interface NewScoeCommandFrameMapping {
  frameId: string;
  instanceId: string;
  label?: string;
  description?: string;
  targetId: string;
  fieldMappings: NewFieldMapping[];
}

interface NewCompletionConditionOption {
  operator: ComparisonOperator;
  matchValue: string;
}

interface NewCompletionConditionConfig {
  id: string;
  label: string;
  sourceFrameId: string;
  sourceFieldId: string;
  useParam: boolean;
  targetParamId?: string;
  targetFixedValue?: string;
  operator?: ComparisonOperator;
  options?: NewCompletionConditionOption[];
}

interface NewScoeGlobalConfig {
  scoeIdentifier: string;
  tcpServerIp: string;
  tcpServerPort: number;
  tcpServerAutoConnect: boolean;
  udpIpAddress: string;
  udpPort: number;
  udpTargetId: string;
  messageIdentifierOffset: number;
  sourceIdentifierOffset: number;
  destinationIdentifierOffset: number;
  modelIdOffset: number;
  satelliteIdOffset: number;
  functionCodeOffset: number;
  successFrameId?: string;
}

interface NewScoeCommandConfig {
  id: string;
  label: string;
  code: string;
  function: OldScoeCommandFunction;
  checksums: OldChecksumConfig[];
  params?: OldScoeCommandParams[];
  frameMappings?: NewScoeCommandFrameMapping[];
  completionConditions?: NewCompletionConditionConfig[];
  completionTimeout?: number;
  successFrameId?: string;
  sendInterval?: number;
}

// --- Operator mapping ---

const OPERATOR_MAP: Record<OldMatchOperator, ComparisonOperator> = {
  equal: 'eq',
  not_equal: 'neq',
  greater_than: 'gt',
  less_than: 'lt',
  greater_equal: 'gte',
  less_equal: 'lte',
  contains: 'contains',
};

function mapOperator(old: OldMatchOperator): ComparisonOperator {
  return OPERATOR_MAP[old] ?? 'eq';
}

// --- Migration logic ---

export function migrateGlobalConfig(old: OldScoeGlobalConfig): NewScoeGlobalConfig {
  return {
    scoeIdentifier: old.scoeIdentifier,
    tcpServerIp: old.tcpServerIp,
    tcpServerPort: old.tcpServerPort,
    tcpServerAutoConnect: old.tcpServerAutoConnect ?? true,
    udpIpAddress: old.udpIpAddress,
    udpPort: old.udpPort,
    udpTargetId: 'network:scoe-udp:scoe-udp-remote',
    messageIdentifierOffset: old.messageIdentifierOffset,
    sourceIdentifierOffset: old.sourceIdentifierOffset,
    destinationIdentifierOffset: old.destinationIdentifierOffset,
    modelIdOffset: old.modelIdOffset,
    satelliteIdOffset: old.satelliteIdOffset,
    functionCodeOffset: old.functionCodeOffset,
    ...(old.successFrameId ? { successFrameId: old.successFrameId } : {}),
  };
}

export function migrateFrameInstances(
  oldInstances: OldSendFrameInstance[] | undefined,
  params: OldScoeCommandParams[] | undefined,
): NewScoeCommandFrameMapping[] | undefined {
  if (!oldInstances || oldInstances.length === 0) return undefined;

  const paramByTarget = new Map<string, string>();
  for (const param of params ?? []) {
    if (param.targetInstanceId && param.targetFieldId) {
      paramByTarget.set(`${param.targetInstanceId}::${param.targetFieldId}`, param.id);
    }
  }

  return oldInstances.map((inst) => {
    const fieldMappings: NewFieldMapping[] = [];

    for (const field of inst.fields ?? []) {
      const key = `${inst.id}::${field.id}`;
      const paramId = paramByTarget.get(key);

      if (paramId) {
        fieldMappings.push({
          fieldId: field.id,
          source: 'param',
          paramId,
        });
      } else if (field.value !== undefined) {
        fieldMappings.push({
          fieldId: field.id,
          source: 'fixed',
          fixedValue: field.value,
        });
      }
    }

    return {
      frameId: inst.frameId,
      instanceId: inst.id,
      ...(inst.label ? { label: inst.label } : {}),
      ...(inst.description ? { description: inst.description } : {}),
      targetId: inst.targetId ?? 'network:scoe-udp:scoe-udp-remote',
      fieldMappings,
    };
  });
}

export function migrateCompletionConditions(
  oldConditions: OldCompletionCondition[] | undefined,
): NewCompletionConditionConfig[] | undefined {
  if (!oldConditions || oldConditions.length === 0) return undefined;

  return oldConditions.map((cond) => ({
    id: cond.id,
    label: cond.label,
    sourceFrameId: cond.sourceFrameId,
    sourceFieldId: cond.sourceFieldId,
    useParam: cond.useParam,
    ...(cond.targetParamId ? { targetParamId: cond.targetParamId } : {}),
    ...(cond.targetFixedValue ? { targetFixedValue: cond.targetFixedValue } : {}),
    ...(cond.operator ? { operator: mapOperator(cond.operator) } : {}),
    ...(cond.options
      ? {
          options: cond.options.map((opt) => ({
            operator: mapOperator(opt.operator),
            matchValue: opt.matchValue,
          })),
        }
      : {}),
  }));
}

export function migrateCommand(old: OldScoeReceiveCommand): NewScoeCommandConfig {
  return {
    id: old.id,
    label: old.label,
    code: old.code,
    function: old.function,
    checksums: old.checksums.map((cs) => ({ ...cs })),
    params: old.params?.map((p) => ({
      id: p.id,
      label: p.label,
      value: p.value,
      type: p.type,
      offset: p.offset,
      length: p.length,
      targetInstanceId: p.targetInstanceId,
      targetFieldId: p.targetFieldId,
      options: p.options.map((o) => ({ ...o })),
    })),
    frameMappings: migrateFrameInstances(old.frameInstances, old.params),
    completionConditions: migrateCompletionConditions(old.completionConditions),
    ...(old.completionTimeout ? { completionTimeout: old.completionTimeout } : {}),
    ...(old.successFrameId ? { successFrameId: old.successFrameId } : {}),
    ...(old.sendInterval ? { sendInterval: old.sendInterval } : {}),
  };
}

// --- Main ---

interface MigrationInput {
  commands: OldScoeReceiveCommand[];
  globalConfig: OldScoeGlobalConfig;
}

interface MigrationOutput {
  commandConfigs: NewScoeCommandConfig[];
  globalConfig: NewScoeGlobalConfig;
}

function main(): void {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath || !outputPath) {
    console.error('Usage: npx tsx rewrite/scripts/migrate-scoe-config.ts <input.json> <output.json>');
    process.exit(1);
  }

  const raw = readFileSync(resolve(inputPath), 'utf-8');
  const input: MigrationInput = JSON.parse(raw);

  const output: MigrationOutput = {
    commandConfigs: input.commands.map(migrateCommand),
    globalConfig: migrateGlobalConfig(input.globalConfig),
  };

  writeFileSync(resolve(outputPath), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Migrated ${output.commandConfigs.length} commands → ${outputPath}`);
}

// Only run when executed directly
if (process.argv[1]?.endsWith('migrate-scoe-config.ts')) {
  main();
}
