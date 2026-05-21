import { shallowRef } from 'vue';
import type { TaskService } from '../services';
import type { ReadonlyTaskInstanceState } from '../core';
import { selectActiveInstances, selectTaskHistory } from '../selectors';
import { resolveDisplayStatus } from '../components/taskStatusMap';
import { SCHEDULE_KIND_MAP } from '../components/scheduleKindMap';
import { calculateProgress } from '../core';
import type { TaskTableRow } from '../components/task-columns';
import type { HistoryTableRow } from '../components/history-columns';

export function toTaskRow(inst: ReadonlyTaskInstanceState): TaskTableRow {
  const displayStatus = resolveDisplayStatus(inst.lifecycle, inst.definitionRef);
  const progress = calculateProgress(inst);
  const total = progress.stepsTotal || 1;
  const pct = Math.round((progress.stepsCompleted / total) * 100);
  const kind = inst.definitionRef.schedule.kind;
  return {
    instanceId: inst.instanceId,
    name: inst.definitionRef.name,
    scheduleKind: kind,
    scheduleKindDisplay: SCHEDULE_KIND_MAP[kind] ?? { color: 'grey', label: kind },
    lifecycle: inst.lifecycle,
    displayStatus,
    progressPercent: pct,
    progressLabel: `${progress.stepsCompleted}/${progress.stepsTotal}`,
    _original: inst,
  };
}

export function toHistoryRow(inst: ReadonlyTaskInstanceState): HistoryTableRow {
  const startedAt = inst.startedAt ? new Date(inst.startedAt).getTime() : 0;
  const endRef = inst.completedAt ?? inst.stoppedAt ?? inst.failedAt;
  const endTime = endRef ? new Date(endRef).getTime() : Date.now();
  const elapsedMs = startedAt > 0 ? Math.max(0, endTime - startedAt) : 0;
  const finishedAt = inst.completedAt ?? inst.stoppedAt ?? inst.failedAt ?? '';
  const kind = inst.definitionRef.schedule.kind;
  return {
    instanceId: inst.instanceId,
    name: inst.definitionRef.name,
    scheduleKind: kind,
    scheduleKindDisplay: SCHEDULE_KIND_MAP[kind] ?? { color: 'grey', label: kind },
    lifecycle: inst.lifecycle,
    elapsedMs,
    finishedAt,
    _original: inst,
  };
}

export function useTaskList(taskService: TaskService, mode: 'active' | 'history') {
  const rows = shallowRef<TaskTableRow[]>([]);
  const historyRows = shallowRef<HistoryTableRow[]>([]);

  function refresh(): void {
    const snapshot = taskService.getSnapshot();
    if (mode === 'active') {
      const active = selectActiveInstances(snapshot);
      rows.value = active.map(toTaskRow);
    } else {
      const history = selectTaskHistory(snapshot);
      historyRows.value = history.map(toHistoryRow);
    }
  }

  function selectAllRows(): readonly (TaskTableRow | HistoryTableRow)[] {
    return mode === 'active' ? rows.value : historyRows.value;
  }

  return { rows, historyRows, refresh, selectAllRows };
}
