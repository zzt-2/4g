import { ref, computed } from 'vue';
import type { TaskProgress, TaskInstanceState } from '@/features/task';
import type { DockingBatchRegistry, DockingBatchMeta } from '../core/docking-batch-registry';

/**
 * 中心对接「任务批次历史面板」数据源 + 控制动作(spec: 批次历史改内存派生)。
 *
 * 数据源:batchRegistry(批次元信息)+ taskService(实例 lifecycle/进度/结果)派生。
 * case.status 实时从实例 lifecycle 算(含 paused),暂停/停止/恢复零同步成本。
 * 控制动作直接打 taskService,下一秒 polling 自然反映。
 */
export type DockingCaseStatus = 'pending' | 'running' | 'paused' | 'passed' | 'failed';

export interface DockingCaseView {
  readonly testCaseId: string;
  readonly caseName: string;
  readonly instanceId: string | null;
  readonly status: DockingCaseStatus;
  readonly durationMs: number | null;
}

export type DockingBatchStatus = 'running' | 'completed' | 'partial-failed' | 'failed';

export interface DockingBatchView {
  readonly taskId: string;
  readonly taskName: string;
  readonly receivedAt: number;
  readonly status: DockingBatchStatus;
  readonly cases: readonly DockingCaseView[];
}

/** taskService 最小消费接口(返回完整实例含 lifecycle/时间戳)。 */
export interface DockingTaskHistoryTaskServicePort {
  getInstance(id: string): TaskInstanceState | undefined;
  pauseTask(id: string): void;
  resumeTask(id: string): void;
  stopTask(id: string): void;
  getProgress?(id: string): TaskProgress | undefined;
}

export interface DockingHistoryRouterPort {
  push(to: unknown): unknown;
}

export interface UseDockingTaskHistoryOptions {
  readonly batchRegistry: DockingBatchRegistry;
  readonly taskService: DockingTaskHistoryTaskServicePort;
  readonly router: DockingHistoryRouterPort;
}

export interface UseDockingTaskHistory {
  readonly sortedBatches: ReturnType<typeof computed<readonly DockingBatchView[]>>;
  progressOf(c: DockingCaseView): TaskProgress | null;
  pauseCase(c: DockingCaseView): void;
  resumeCase(c: DockingCaseView): void;
  stopCase(c: DockingCaseView): void;
  viewDetail(c: DockingCaseView): void;
  refresh(): void;
}

/** lifecycle → DockingCaseStatus 映射(spec 映射表)。 */
function deriveCaseStatus(instanceId: string | null, instance: TaskInstanceState | undefined): DockingCaseStatus {
  if (!instanceId) return 'pending';
  if (!instance) return 'failed'; // 异常兜底:实例被清/映射残留
  switch (instance.lifecycle) {
    case 'created': return 'running';   // 建完就 start,几乎见不到,归 running
    case 'running': return 'running';
    case 'paused': return 'paused';
    case 'completed': return 'passed';
    case 'failed': return 'failed';
    case 'stopped': return 'failed';     // 粒度2 不细分
    default: return 'failed';
  }
}

/** 实例时间戳 → durationMs(终态: endRef - startedAt;非终态: null)。 */
function deriveDurationMs(instance: TaskInstanceState | undefined): number | null {
  if (!instance) return null;
  const start = instance.startedAt ? new Date(instance.startedAt).getTime() : null;
  if (start === null) return null;
  const endRef = instance.completedAt ?? instance.stoppedAt ?? instance.failedAt;
  if (!endRef) return null; // 非终态
  return Math.max(0, new Date(endRef).getTime() - start);
}

/** 派生批次 status(spec 规则)。 */
function deriveBatchStatus(cases: readonly DockingCaseView[]): DockingBatchStatus {
  const hasActive = cases.some(c => c.status === 'pending' || c.status === 'running' || c.status === 'paused');
  if (hasActive) return 'running';
  const passed = cases.filter(c => c.status === 'passed').length;
  const failed = cases.filter(c => c.status === 'failed').length;
  if (failed === 0) return 'completed';
  if (passed === 0) return 'failed';
  return 'partial-failed';
}

function deriveBatchView(meta: DockingBatchMeta, ts: DockingTaskHistoryTaskServicePort): DockingBatchView {
  const cases = meta.cases.map(c => {
    const inst = c.instanceId ? ts.getInstance(c.instanceId) : undefined;
    return {
      testCaseId: c.testCaseId,
      caseName: c.caseName,
      instanceId: c.instanceId,
      status: deriveCaseStatus(c.instanceId, inst),
      durationMs: deriveDurationMs(inst),
    } satisfies DockingCaseView;
  });
  return { taskId: meta.taskId, taskName: meta.taskName, receivedAt: meta.receivedAt, status: deriveBatchStatus(cases), cases };
}

export function useDockingTaskHistory(options: UseDockingTaskHistoryOptions): UseDockingTaskHistory {
  // 触发器:每次 refresh 重新读 registry + 派生(让 sortedBatches 响应)。
  const tick = ref(0);

  function refresh(): void {
    tick.value++;
  }

  const sortedBatches = computed<readonly DockingBatchView[]>(() => {
    void tick.value; // 依赖 tick,refresh 后重算
    const metas = options.batchRegistry.loadAll();
    const views = metas.map(meta => deriveBatchView(meta, options.taskService));
    return views.sort((a, b) => b.receivedAt - a.receivedAt);
  });

  function progressOf(c: DockingCaseView): TaskProgress | null {
    if (c.status !== 'running' || !c.instanceId) return null;
    return options.taskService.getProgress?.(c.instanceId) ?? null;
  }

  function pauseCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.pauseTask(c.instanceId);
  }
  function resumeCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.resumeTask(c.instanceId);
  }
  function stopCase(c: DockingCaseView): void {
    if (!c.instanceId) return;
    options.taskService.stopTask(c.instanceId);
  }
  function viewDetail(c: DockingCaseView): void {
    void c;
    options.router.push({ path: '/tasks' });
  }

  return { sortedBatches, progressOf, pauseCase, resumeCase, stopCase, viewDetail, refresh };
}
