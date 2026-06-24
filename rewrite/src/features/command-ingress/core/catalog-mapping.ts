/**
 * 甲方对接用例目录映射表(D004)。
 *
 * 一张「task 模板 → 甲方用例」的映射,记录:
 * - 哪些模板要上报给甲方(enabled)
 * - 甲方可覆盖哪些字段路径(overridablePaths)
 * - 上报后甲方侧的 outCaseId / 上报时间(系统回填)
 *
 * 设计约束(H009 不变量):
 * - 只存 templateId(字符串),不耦合 task feature 的 TaskTemplate 类型。
 * - task feature 永不感知甲方存在;本表是 command-ingress feature 的私有数据。
 * - northbound feature(协议层)只消费本表,不持有业务规则。
 *
 * 路径格式见 northbound/core/path-resolver.ts:点 + 方括号语法,
 * 形如 `step-send.send.userFieldValues.power`。
 */

/** 一条「模板 → 甲方用例」映射 */
export interface CatalogMapping {
  /** 引用的 task 模板 id(只存 id,不耦合) */
  readonly templateId: string;
  /** 是否上报给甲方 */
  readonly enabled: boolean;
  /** 甲方可覆盖的字段路径白名单(路径格式见 path-resolver) */
  readonly overridablePaths: readonly string[];
  /** 上报后甲方侧的用例外部 ID。上报后由系统回填,下发时反查快照用 */
  readonly outCaseId?: string;
  /** 上次上报时间戳(ms)。上报后由系统回填 */
  readonly reportedAt?: number;
}

/** localStorage 持久化 key */
export const CATALOG_MAPPINGS_KEY = 'northbound-docking-catalog-mappings';

/** 从 localStorage 读映射表;读失败/空 → 返回空数组 */
export function loadCatalogMappings(): CatalogMapping[] {
  try {
    const raw = localStorage.getItem(CATALOG_MAPPINGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCatalogMapping);
  } catch {
    return [];
  }
}

/** 把映射表写回 localStorage */
export function persistCatalogMappings(mappings: readonly CatalogMapping[]): void {
  localStorage.setItem(CATALOG_MAPPINGS_KEY, JSON.stringify(mappings));
}

// --- CRUD(纯函数,返回新数组,不直接读写 localStorage) ---

/** 新增映射。已存在同 templateId 的 → 原地替换(保持原位置,不重排) */
export function upsertMapping(
  mappings: readonly CatalogMapping[],
  mapping: CatalogMapping,
): CatalogMapping[] {
  const idx = mappings.findIndex(m => m.templateId === mapping.templateId);
  if (idx < 0) return [...mappings, mapping]; // 新增:追加末尾
  const next = [...mappings];
  next[idx] = mapping; // 已存在:原地替换,保持 index
  return next;
}

/** 按 templateId 删除 */
export function removeMapping(
  mappings: readonly CatalogMapping[],
  templateId: string,
): CatalogMapping[] {
  return mappings.filter(m => m.templateId !== templateId);
}

/** 按 templateId 查 */
export function findMapping(
  mappings: readonly CatalogMapping[],
  templateId: string,
): CatalogMapping | undefined {
  return mappings.find(m => m.templateId === templateId);
}

/** 过滤出启用上报的映射(getTestCaseAll 数据源) */
export function selectEnabledMappings(
  mappings: readonly CatalogMapping[],
): CatalogMapping[] {
  return mappings.filter(m => m.enabled);
}

/** 回填上报结果(outCaseId / reportedAt)。无对应项 → 返回原数组 */
export function markReported(
  mappings: readonly CatalogMapping[],
  templateId: string,
  outCaseId: string,
  reportedAt: number,
): CatalogMapping[] {
  return mappings.map(m =>
    m.templateId === templateId
      ? { ...m, outCaseId, reportedAt }
      : m,
  );
}

// --- guards ---

function isCatalogMapping(v: unknown): v is CatalogMapping {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.templateId === 'string' &&
    typeof o.enabled === 'boolean' &&
    Array.isArray(o.overridablePaths) &&
    o.overridablePaths.every(p => typeof p === 'string')
  );
}
