import { shallowRef } from 'vue';
import type { CommandLogEntry } from '../core/command-log';
import type { CommandIngressService } from '../services/command-ingress-service';

export function useScoeMonitor(service: CommandIngressService) {
  const statistics = shallowRef(service.getScoeStatistics());
  const runtimeStatus = shallowRef(service.getScoeRuntimeStatus());
  const commandLog = shallowRef<readonly CommandLogEntry[]>(service.getCommandLog());

  function refresh(): void {
    statistics.value = service.getScoeStatistics();
    runtimeStatus.value = service.getScoeRuntimeStatus();
    commandLog.value = service.getCommandLog();
  }

  function clearCommandLog(): void {
    service.clearCommandLog();
    commandLog.value = service.getCommandLog();
  }

  return {
    statistics,
    runtimeStatus,
    commandLog,
    refresh,
    clearCommandLog,
  };
}
