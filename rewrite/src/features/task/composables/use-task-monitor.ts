import { ref, shallowRef } from 'vue';
import type { TaskService } from '../services';
import type { TaskInstanceState, TaskProgress } from '../core';
import { isTerminal, calculateProgress } from '../core';
import { resolveDisplayStatus } from '../components/taskStatusMap';
import { TASK_STATUS_MAP } from '../components/taskStatusMap';
import { usePolling } from '@/shared/composables';

export function useTaskMonitor(taskService: TaskService) {
  const selectedId = ref<string | null>(null);
  const instance = shallowRef<TaskInstanceState | undefined>(undefined);
  const progress = shallowRef<TaskProgress | null>(null);
  const displayStatus = ref('');
  const statusInfo = shallowRef<{ label: string; color: string }>({
    label: '',
    color: 'grey',
  });

  const polling = usePolling(refresh, 1000);

  function refresh(): void {
    if (!selectedId.value) return;
    const inst = taskService.getInstance(selectedId.value);
    if (!inst) {
      instance.value = undefined;
      progress.value = null;
      displayStatus.value = '';
      statusInfo.value = { label: '', color: 'grey' };
      return;
    }
    instance.value = inst;
    progress.value = calculateProgress(inst);
    const status = resolveDisplayStatus(inst.lifecycle, inst.definitionRef);
    displayStatus.value = status;
    statusInfo.value = TASK_STATUS_MAP[status] ?? { label: status, color: 'grey' };

    if (isTerminal(inst.lifecycle)) {
      polling.stop();
    }
  }

  function select(instanceId: string | null): void {
    selectedId.value = instanceId;
    if (instanceId) {
      refresh();
      const inst = taskService.getInstance(instanceId);
      if (inst && !isTerminal(inst.lifecycle)) {
        polling.start();
      }
    } else {
      instance.value = undefined;
      progress.value = null;
      displayStatus.value = '';
      statusInfo.value = { label: '', color: 'grey' };
      polling.stop();
    }
  }

  return {
    selectedId,
    instance,
    progress,
    displayStatus,
    statusInfo,
    polling,
    select,
    refresh,
  };
}
