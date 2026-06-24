import type { PersistedTaskCase } from '../../services/docking-task-history-storage';

/**
 * 任务批次历史面板「用例行」的显示映射(纯数据,模块级,O4)。
 *
 * 用例四状态(spec: 任务批次历史面板「用例行子组件」):
 *  - pending:○ 等待(grey)
 *  - running:⟳ 进行中(primary)
 *  - passed:✓ 通过(positive)
 *  - failed:✗ 失败(negative)
 *
 * 图标用 Material Icons(o_ 前缀,Quasar 内置)。颜色用 Quasar brand 色(conventions C2 状态色映射)。
 */
export interface TaskCaseStatusDisplay {
  readonly label: string;
  readonly color: 'grey' | 'primary' | 'positive' | 'negative';
  readonly icon: string;
}

export const TASK_CASE_STATUS_MAP: Readonly<Record<PersistedTaskCase['status'], TaskCaseStatusDisplay>> = {
  pending: { label: '等待', color: 'grey', icon: 'o_radio_button_unchecked' },
  running: { label: '进行中', color: 'primary', icon: 'o_autorenew' },
  passed: { label: '通过', color: 'positive', icon: 'o_check_circle' },
  failed: { label: '失败', color: 'negative', icon: 'o_cancel' },
} as const;

/** 取用例状态的显示映射(label/color/icon)。 */
export function resolveCaseStatusDisplay(status: PersistedTaskCase['status']): TaskCaseStatusDisplay {
  return TASK_CASE_STATUS_MAP[status];
}

/** 用例是否处于终态(完成/失败):用于显示「详情」跳转按钮(vs 进行中的控制按钮)。 */
export function isCaseFinished(status: PersistedTaskCase['status']): boolean {
  return status === 'passed' || status === 'failed';
}
