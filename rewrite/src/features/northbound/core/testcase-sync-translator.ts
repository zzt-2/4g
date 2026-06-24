import type { TaskDefinition, TaskStepDefinition } from '@/features/task/core';
import { createDelayStep, createTaskDefinition } from '@/features/task/core';
import type { CatalogMapping } from '@/features/command-ingress/core';
import type { TestCaseInfo, CaseInfoInputPar } from './types';
import type {
  CustomerTestCase,
  NorthboundTestCaseConfig,
  ReportedSnapshot,
  OverrideWarning,
} from './types';
import { getPathValue, setPathValue } from './path-resolver';

/**
 * Encode 输入源:模板定义 + 标识字段。
 * 刻意不导入 TaskTemplate(D004:task feature 不感知甲方),
 * 由调用方(northbound-service)从 TaskTemplate 拆出这几个字段传入。
 */
export interface EncodeSource {
  readonly definition: TaskDefinition;
  readonly templateId: string;
  readonly templateName: string;
  readonly templateTags: readonly string[];
}

/** 生成 outCaseId:绑定 templateId + 上报时间,用于反查快照 */
export function makeOutCaseId(templateId: string, reportedAt: number): string {
  return `${templateId}@${reportedAt}`;
}

/** 生成 execSteps 可读摘要 */
function summarizeExecSteps(steps: readonly TaskStepDefinition[]): string {
  const parts = steps.map(step => {
    if (step.kind === 'send') return `send ${step.config.frameId}`;
    if (step.kind === 'wait-condition') {
      const fc = step.config.conditions[0];
      return `wait-condition ${fc?.frameId ?? ''}`.trim();
    }
    return 'delay';
  });
  return parts.join('; ').slice(0, 200);
}

/** 按 path 在 definition.steps 里定位 step(by id),校验 stepKind,取字段值 */
function resolveStepPathValue(def: TaskDefinition, path: string): unknown {
  const parts = path.split('.');
  if (parts.length < 3) return undefined;
  const [stepId, stepKind, ...rest] = parts;
  const step = def.steps.find(s => s.id === stepId);
  if (!step) return undefined;
  if (step.kind !== stepKind) return undefined; // stepKind 不匹配
  return getPathValue(step.config, rest.join('.'));
}

/**
 * 上报: (模板定义 + 映射) → CustomerTestCase(用例节点) + 快照。overridablePaths 来自 mapping(D004)。
 *
 * 用例节点字段对齐甲方 CaseInfoNode:id/name/type/isParent 等(03-用例管理.md 文件格式定义)。
 * id = outCaseId,是快照反查键,保证 decode 闭环(setTestTask 下发的 testCaseId = 文件 id)。
 * 菜单包裹(外层 isParent:true 节点)由调用方(northbound-service)负责,这里只产单个用例节点。
 */
export function encodeSourceToTestCase(
  source: EncodeSource,
  mapping: CatalogMapping,
  config: NorthboundTestCaseConfig,
): { testCase: CustomerTestCase; snapshot: ReportedSnapshot } {
  const reportedAt = Date.now();
  const outCaseId = makeOutCaseId(source.templateId, reportedAt);
  const def = source.definition;

  // 深拷贝 definition 作为快照
  const snapshotDef: TaskDefinition = JSON.parse(JSON.stringify(def));
  const overridablePaths = mapping.overridablePaths;

  // 仅为白名单路径生成 inputPars(CaseInfoInputPar 富结构,取不到值的跳过)。
  // 我方无 cnName/type/unit/remark 元数据来源:parId 既是路径又是键,
  // cnName 取 path 最后一段兜底,defaultValue 取当前值,其余空串。
  const inputPars: CaseInfoInputPar[] = [];
  for (const path of overridablePaths) {
    const value = resolveStepPathValue(def, path);
    if (value !== undefined) {
      const lastSeg = path.split('.').pop() ?? path;
      inputPars.push({
        parId: path,
        cnName: lastSeg,
        type: '',
        defaultValue: String(value),
        unit: '',
        remark: '',
      });
    }
  }

  const testCase: CustomerTestCase = {
    id: outCaseId,
    name: source.templateName,
    type: config.caseType,
    runSubSys: config.runSubSys,
    isParent: false,
    depSubSys: config.depSubSys,
    depSubNe: config.depSubNe,
    durate: 600,
    satelliteCount: 1,
    stationCount: 1,
    execSteps: summarizeExecSteps(def.steps),
    remark: source.templateTags.length > 0 ? source.templateTags.join(', ') : undefined,
    inputPars,
    children: [],
  };

  const snapshot: ReportedSnapshot = {
    outCaseId,
    templateId: source.templateId,
    definition: snapshotDef,
    overridablePaths,
    reportedAt,
  };

  return { testCase, snapshot };
}

/** 把 string value 尽量转回原始类型(number/boolean) */
function coerceValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (value !== '' && !Number.isNaN(num)) return num;
  return value;
}

/** 下发: TestCaseInfo + 快照 → 覆盖后的 TaskDefinition */
export function decodeTestCaseToTaskDefinition(
  testCaseInfo: TestCaseInfo,
  snapshot: ReportedSnapshot,
): { definition: TaskDefinition; warnings: OverrideWarning[] } {
  const definition: TaskDefinition = JSON.parse(JSON.stringify(snapshot.definition));
  const whitelist = new Set(snapshot.overridablePaths);
  const warnings: OverrideWarning[] = [];

  for (const { parId, value } of testCaseInfo.inputPars ?? []) {
    if (!whitelist.has(parId)) {
      warnings.push({ parId, reason: 'not-in-whitelist', detail: 'path not in overridablePaths' });
      continue;
    }
    const parts = parId.split('.');
    if (parts.length < 3) {
      warnings.push({ parId, reason: 'path-not-found', detail: 'malformed path' });
      continue;
    }
    const [stepId, stepKind, ...rest] = parts;
    const stepIdx = definition.steps.findIndex(s => s.id === stepId);
    if (stepIdx < 0) {
      warnings.push({ parId, reason: 'path-not-found', detail: `step ${stepId} not found` });
      continue;
    }
    const step = definition.steps[stepIdx];
    if (step.kind !== stepKind) {
      warnings.push({ parId, reason: 'type-mismatch', detail: `expected kind ${stepKind}, got ${step.kind}` });
      continue;
    }
    const nextConfig = setPathValue(step.config, rest.join('.'), coerceValue(value));
    definition.steps = definition.steps.map((s, i) => (i === stepIdx ? { ...step, config: nextConfig } : s));
  }

  return { definition, warnings };
}

/** 快照缺失时创建立即 fail 的占位 definition */
export function createPlaceholderFailDefinition(testCaseId: string): TaskDefinition {
  return createTaskDefinition({
    id: `nb-missing-${testCaseId}-${Date.now()}`,
    name: `snapshot-missing:${testCaseId}`,
    steps: [createDelayStep(1, { id: 'step-placeholder' })],
    schedule: { kind: 'immediate' },
    errorPolicy: { onFailure: 'stop' },
  });
}

/** 路径白名单校验工具(给 UI 用) */
export function validateOverridablePath(def: TaskDefinition, path: string): boolean {
  return resolveStepPathValue(def, path) !== undefined;
}
