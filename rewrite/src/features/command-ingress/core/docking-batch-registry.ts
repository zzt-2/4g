/**
 * 中心对接「批次元信息」内存映射表(spec: 批次历史改内存派生)。
 *
 * 只存 taskService 内存里没有的批次元信息:taskId 分组、taskName、receivedAt、
 * testCaseId↔instanceId 关联、caseName。**不存 status/进度/结果**——这些运行时
 * 从 taskService 实例派生(面板渲染时查 getInstance)。
 *
 * 不持久化(重启清空,用户已确认跨重启历史无所谓)。范式照 northbound-state.ts 闭包 Map。
 * 归 command-ingress(D004:对接归 command-ingress,task 内核不感知甲方)。
 */
export interface DockingBatchCaseMeta {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly instanceId: string | null;
}

export interface DockingBatchMeta {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly cases: readonly DockingBatchCaseMeta[];
}

export interface DockingBatchRegistry {
  /** 插入新批次(按 taskId 去重,已存在返回 false 不覆盖)。 */
  insertBatch(meta: DockingBatchMeta): boolean;
  /** 回填指定 taskId/testCaseId 的 instanceId(不存在则静默跳过)。 */
  setInstance(taskId: string, testCaseId: string, instanceId: string): void;
  /** 读全部批次(返回快照,外部修改不影响内部)。 */
  loadAll(): readonly DockingBatchMeta[];
  /** 清空。 */
  clear(): void;
}

export function createDockingBatchRegistry(): DockingBatchRegistry {
  const batches = new Map<string, DockingBatchMeta>();

  /** 浅拷贝 meta(顶层 + cases 数组),隔离外部对入参/返回值的篡改。 */
  function clone(meta: DockingBatchMeta): DockingBatchMeta {
    return { ...meta, cases: meta.cases.map(c => ({ ...c })) };
  }

  return {
    insertBatch(meta: DockingBatchMeta): boolean {
      if (batches.has(meta.taskId)) return false;
      batches.set(meta.taskId, clone(meta));
      return true;
    },

    setInstance(taskId: string, testCaseId: string, instanceId: string): void {
      const batch = batches.get(taskId);
      if (!batch) return;
      const cases = batch.cases.map(c =>
        c.testCaseId === testCaseId ? { ...c, instanceId } : c,
      );
      batches.set(taskId, { ...batch, cases });
    },

    loadAll(): readonly DockingBatchMeta[] {
      return [...batches.values()].map(clone);
    },

    clear(): void {
      batches.clear();
    },
  };
}
