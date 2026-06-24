import type { TaskProgress } from '@/features/task';

/**
 * 进度百分比:优先 sends 维度(sendsTotal 非 null 且 > 0),回退 steps 维度。
 * 抽自 TaskExecutionDetail.vue(原 progressPct computed),供 TaskCaseRow 共用。
 */
export function formatProgressPct(progress: TaskProgress | null): number {
  if (!progress) return 0;
  if (progress.sendsTotal !== null && progress.sendsTotal > 0) {
    return Math.round((progress.sendsCompleted / progress.sendsTotal) * 100);
  }
  const total = progress.stepsTotal || 1;
  return Math.round((progress.stepsCompleted / total) * 100);
}

/** 进度 n/m 标签:优先 sends(sendsTotal 非 null 且 > 0),回退 steps。抽自 TaskExecutionDetail.vue。
 *  sendsTotal=0 视为无意义,回退 steps(与 formatProgressPct 的兜底语义一致)。 */
export function formatProgressLabel(progress: TaskProgress | null): string {
  if (!progress) return '';
  if (progress.sendsTotal !== null && progress.sendsTotal > 0) {
    return `${progress.sendsCompleted}/${progress.sendsTotal}`;
  }
  return `${progress.stepsCompleted}/${progress.stepsTotal}`;
}
