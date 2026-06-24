import { ref, computed } from 'vue';
import type { TaskProgress } from '@/features/task';
import type { DockingTaskHistoryStorage, PersistedTaskBatch, PersistedTaskCase } from '../services/docking-task-history-storage';

/**
 * 中心对接「任务批次历史面板」的数据源 + 控制动作(spec: 任务批次历史面板)。
 *
 * 职责:
 *  - batches:从 historyStorage.loadAll() 读批次(响应式,refresh 时重读)。
 *  - sortedBatches:按 receivedAt 倒序(最新在前)的派生视图(面板 v-for 用)。
 *  - progressOf(c):对 running 用例,从 taskService.getProgress(instanceId) 取实时进度(供 TaskCaseRow 进度条)。
 *  - pauseCase/stopCase:转发 taskService 的控制 API(进行中用例的控制按钮)。
 *  - viewDetail:跳转执行监控页(/tasks,路由无 name,最小跳转;精确定位列为后续)。
 *
 * 路由事实(routes.ts):TaskManagePage 在 path '/tasks',无 route name。
 * 所以 viewDetail 用 { path: '/tasks' }(spec「跳转」段:倾向最小跳转)。
 */

/** taskService 最小消费接口(只取本 composable 用到的方法)。 */
export interface DockingTaskHistoryTaskServicePort {
  getInstance(id: string): { definitionRef: { name: string } } | undefined;
  pauseTask(id: string): void;
  stopTask(id: string): void;
  /** 进度查询(可选:旧 taskService 可能无此方法,用可选链兜底)。 */
  getProgress?(id: string): TaskProgress | undefined;
}

/** router 最小消费接口。 */
export interface DockingTaskHistoryRouterPort {
  push(to: unknown): unknown;
}

export interface UseDockingTaskHistoryOptions {
  readonly historyStorage: DockingTaskHistoryStorage;
  readonly taskService: DockingTaskHistoryTaskServicePort;
  readonly router: DockingTaskHistoryRouterPort;
}

export interface UseDockingTaskHistory {
  /** 原序批次(从 storage 读,refresh 时更新)。 */
  readonly batches: ReturnType<typeof ref<readonly PersistedTaskBatch[]>>;
  /** 按 receivedAt 倒序的派生视图(面板渲染用)。 */
  readonly sortedBatches: ReturnType<typeof computed<readonly PersistedTaskBatch[]>>;
  /** running 用例的实时进度(非 running / 无 instanceId / getProgress 缺失 → null)。 */
  progressOf(c: PersistedTaskCase): TaskProgress | null;
  /** 暂停用例(转发 taskService.pauseTask;无 instanceId 跳过)。 */
  pauseCase(c: PersistedTaskCase): void;
  /** 停止用例(转发 taskService.stopTask;无 instanceId 跳过)。 */
  stopCase(c: PersistedTaskCase): void;
  /** 跳转执行监控页(/tasks,最小跳转)。 */
  viewDetail(c: PersistedTaskCase): void;
  /** 重读 storage(页面 polling 调,刷新 batches)。 */
  refresh(): void;
}

export function useDockingTaskHistory(options: UseDockingTaskHistoryOptions): UseDockingTaskHistory {
  const batches = ref<readonly PersistedTaskBatch[]>(options.historyStorage.loadAll());

  // 按 receivedAt 倒序(最新在前)。receivedAt 相等时保持稳定(不二次排序)。
  const sortedBatches = computed<readonly PersistedTaskBatch[]>(() =>
    [...batches.value].sort((a, b) => b.receivedAt - a.receivedAt),
  );

  function progressOf(c: PersistedTaskCase): TaskProgress | null {
    if (c.status !== 'running' || !c.instanceId) return null;
    return options.taskService.getProgress?.(c.instanceId) ?? null;
  }

  function pauseCase(c: PersistedTaskCase): void {
    if (!c.instanceId) return;
    options.taskService.pauseTask(c.instanceId);
  }

  function stopCase(c: PersistedTaskCase): void {
    if (!c.instanceId) return;
    options.taskService.stopTask(c.instanceId);
  }

  function viewDetail(c: PersistedTaskCase): void {
    // 执行监控页在 /tasks(无 route name)。最小跳转;精确定位到具体 instance 列为后续。
    // 参数 c 预留给未来精确定位(按 instanceId 选行),当前最小跳转未用。
    void c;
    options.router.push({ path: '/tasks' });
  }

  function refresh(): void {
    batches.value = options.historyStorage.loadAll();
  }

  return { batches, sortedBatches, progressOf, pauseCase, stopCase, viewDetail, refresh };
}
