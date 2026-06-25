import type { DockingCaseStatus } from '../../composables/use-docking-task-history';

/**
 * 任务批次历史面板「用例行」的显示映射(纯数据,模块级,O4)。
 * 五状态:pending/running/paused/passed/failed。
 *
 * 图标用 Material Icons(o_ 前缀,Quasar 内置)。颜色用 Quasar brand 状态色(conventions C2)。
 */
export interface TaskCaseStatusDisplay {
  readonly label: string;
  readonly color: 'grey' | 'primary' | 'warning' | 'positive' | 'negative';
  readonly icon: string;
}

export const TASK_CASE_STATUS_MAP: Readonly<Record<DockingCaseStatus, TaskCaseStatusDisplay>> = {
  pending: { label: '等待', color: 'grey', icon: 'o_radio_button_unchecked' },
  running: { label: '进行中', color: 'primary', icon: 'o_autorenew' },
  paused: { label: '已暂停', color: 'warning', icon: 'o_pause_circle' },
  passed: { label: '通过', color: 'positive', icon: 'o_check_circle' },
  failed: { label: '失败', color: 'negative', icon: 'o_cancel' },
} as const;

/** 取用例状态的显示映射(label/color/icon)。 */
export function resolveCaseStatusDisplay(status: DockingCaseStatus): TaskCaseStatusDisplay {
  return TASK_CASE_STATUS_MAP[status];
}

/** 用例是否处于终态(完成/失败):终态显示「详情」跳转按钮;非终态(含 paused)显示控制按钮。 */
export function isCaseFinished(status: DockingCaseStatus): boolean {
  return status === 'passed' || status === 'failed';
}
