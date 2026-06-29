/**
 * 用例报告配置(D008:TestReport 内容配置驱动)。
 *
 * 每个用例(task 模板)对应一份 ReportConfig,记录三类(checkPoints / statisticsItems /
 * attachItems)各自要上报哪些接收帧字段的值。task 跑完生成 TestReport 时,按这份清单
 * 从 DisplayService 的字段值快照取 displayValue,填进甲方三类。
 *
 * 三类同构(内部统一用 ReportItem),填报告时再映射成甲方各自字段名:
 * - checkPoints → 甲方 checkPoint(必带 result 判定)
 * - statisticsItems / attachItems → 甲方 itemName(可选 result,本任务纯取值不判定)
 *
 * 设计约束(同 D004 不变量):
 * - 只存 templateId(字符串),不耦合 task feature 的 TaskTemplate 类型。
 * - 归 command-ingress feature 持有;northbound 跨读(不持业务规则)。
 * - 配置独立于 CatalogMapping(不塞进映射对象),见 D008。
 *
 * key 取值约定:报告生成时按 `${frameId}:${fieldId}` 组合定位(对齐 DisplayService 的
 * dataItemId),无 fieldId 跨帧重名覆盖问题(对比 receive-event-source-bridge 用纯 fieldId)。
 */

/** 用例报告配置中的一项(检查点/统计项/附加项通用结构)。
 *  name → 甲方 checkPoint/itemName;frameId:fieldId 定位取值;msg 可选说明。
 *  三类(checkPoints/statisticsItems/attachItems)都用此结构,填报告时映射各自字段名。 */
export interface ReportItem {
  /** 项唯一 id(nanoid),排序/编辑追踪用 */
  readonly id: string;
  /** 报告里这一项叫啥("载波同步锁定") */
  readonly name: string;
  /** 取值的帧 */
  readonly frameId: string;
  /** 取值的字段(取该字段的 displayValue) */
  readonly fieldId: string;
  /** 说明,可选 → 甲方 msg */
  readonly msg?: string;
}

/** 一个用例(模板)对应一份报告配置。三类与甲方 TestReport 的 checkPoints/statisticsItems/attachItems 一一对应。 */
export interface ReportConfig {
  /** 关联哪个 task 模板(只存 id) */
  readonly templateId: string;
  /** → TestReport.checkPoints[] */
  readonly checkPoints: readonly ReportItem[];
  /** → TestReport.statisticsItems[] */
  readonly statisticsItems: readonly ReportItem[];
  /** → TestReport.attachItems[] */
  readonly attachItems: readonly ReportItem[];
}

/** 按方向移动一个类别内的项(上移/下移)。返回新数组,越界或未命中返回原数组。 */
export function moveReportItem(
  items: readonly ReportItem[],
  id: string,
  direction: 'up' | 'down',
): readonly ReportItem[] {
  const idx = items.findIndex(i => i.id === id);
  if (idx < 0) return items;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= items.length) return items;
  const next = [...items];
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return next;
}

// --- CRUD(纯函数,返回新数组,不直接读写存储) ---

/** 新增/替换配置。已存在同 templateId → 原地替换(保持位置,不重排)。 */
export function upsertReportConfig(
  configs: readonly ReportConfig[],
  config: ReportConfig,
): ReportConfig[] {
  const idx = configs.findIndex(c => c.templateId === config.templateId);
  if (idx < 0) return [...configs, config];
  const next = [...configs];
  next[idx] = config;
  return next;
}

/** 按 templateId 删除。未命中返回原数组(等价无操作)。 */
export function removeReportConfig(
  configs: readonly ReportConfig[],
  templateId: string,
): ReportConfig[] {
  return configs.filter(c => c.templateId !== templateId);
}

/** 按 templateId 查。 */
export function findReportConfig(
  configs: readonly ReportConfig[],
  templateId: string,
): ReportConfig | undefined {
  return configs.find(c => c.templateId === templateId);
}

/** 为模板创建空配置(三类全空)。 */
export function createEmptyReportConfig(templateId: string): ReportConfig {
  return { templateId, checkPoints: [], statisticsItems: [], attachItems: [] };
}

// --- guards(导入/读取数据时形状校验) ---

export function isReportItem(v: unknown): v is ReportItem {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.frameId === 'string' &&
    typeof o.fieldId === 'string' &&
    (o.msg === undefined || typeof o.msg === 'string')
  );
}

export function isReportConfig(v: unknown): v is ReportConfig {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.templateId === 'string' &&
    Array.isArray(o.checkPoints) && o.checkPoints.every(isReportItem) &&
    Array.isArray(o.statisticsItems) && o.statisticsItems.every(isReportItem) &&
    Array.isArray(o.attachItems) && o.attachItems.every(isReportItem)
  );
}
