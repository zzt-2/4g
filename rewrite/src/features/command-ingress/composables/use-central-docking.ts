import { ref } from 'vue';

export interface DockingConnectionState {
  readonly https: 'unknown' | 'connected' | 'disconnected' | 'error';
  readonly heartbeat: 'unknown' | 'active' | 'inactive';
  readonly device: 'unknown' | 'online' | 'offline';
}

export interface DockingTask {
  readonly taskId: string;
  readonly caseCount: number;
  readonly status: string;
  readonly issuedAt: string;
}

export function useCentralDocking() {
  const connectionState = ref<DockingConnectionState>({
    https: 'unknown',
    heartbeat: 'unknown',
    device: 'unknown',
  });
  const tasks = ref<readonly DockingTask[]>([]);
  const isConfiguring = ref(false);
  const showConfigDialog = ref(false);

  function connect(): Promise<void> {
    throw new Error('Not implemented');
  }

  function disconnect(): Promise<void> {
    throw new Error('Not implemented');
  }

  function saveConfig(): Promise<void> {
    throw new Error('Not implemented');
  }

  return {
    connectionState,
    tasks,
    isConfiguring,
    showConfigDialog,
    connect,
    disconnect,
    saveConfig,
  };
}
