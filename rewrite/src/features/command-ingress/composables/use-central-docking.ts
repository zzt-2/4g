import { ref, shallowRef, reactive } from 'vue';
import type { NorthboundService } from '@/features/northbound/services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import { DEFAULT_DOCKING_CONFIG, MOCK_DEVICES } from '../components/docking-labels';

// --- Persistence helpers ---

const STORAGE_KEY = 'northbound-docking-config';

interface PersistedConfig {
  serverHost: string;
  serverPort: number;
  customerBaseUrl: string;
  subSysType: string;
  subSysId: string;
  loginUrl: string;
  clientId: string;
  username: string;
  grantType: string;
  tenantId: string;
}

function loadPersistedConfig(): Partial<PersistedConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistConfig(cfg: DockingConfigForm): void {
  const persisted: PersistedConfig = {
    serverHost: cfg.serverHost,
    serverPort: cfg.serverPort,
    customerBaseUrl: cfg.customerBaseUrl,
    subSysType: cfg.subSysType,
    subSysId: cfg.subSysId,
    loginUrl: cfg.loginUrl,
    clientId: cfg.clientId,
    username: cfg.username,
    grantType: cfg.grantType,
    tenantId: cfg.tenantId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

// --- Public types ---

export interface DockingConnectionState {
  readonly https: 'unknown' | 'connected' | 'disconnected' | 'error';
  readonly heartbeat: 'unknown' | 'active' | 'inactive';
  readonly device: 'unknown' | 'online' | 'offline';
}

export interface DockingTaskRow {
  readonly testCaseId: string;
  readonly instanceId: string;
  readonly name: string;
  readonly lifecycle: string;
  readonly progress: string;
  readonly startedAt: string;
}

export interface ReportRecord {
  readonly testCaseId: string;
  readonly verdict: string;
  readonly reportedAt: string;
}

export interface DockingConfigForm {
  serverHost: string;
  serverPort: number;
  customerBaseUrl: string;
  subSysType: string;
  subSysId: string;
  loginUrl: string;
  clientId: string;
  username: string;
  password: string;
  grantType: string;
  tenantId: string;
}

// --- Composable ---

export function useCentralDocking(
  northboundService: NorthboundService,
  taskService: TaskService,
  resultService: ResultService,
) {
  const connectionState = ref<DockingConnectionState>({
    https: 'unknown',
    heartbeat: 'unknown',
    device: 'unknown',
  });

  const isActive = ref(false);
  const showConfigDialog = ref(false);
  const showReportDialog = ref(false);
  const isConnecting = ref(false);
  const isDisconnecting = ref(false);

  const config = reactive<DockingConfigForm>({
    ...DEFAULT_DOCKING_CONFIG,
    ...loadPersistedConfig(),
  });

  const dockingTasks = shallowRef<readonly DockingTaskRow[]>([]);
  const reportRecords = shallowRef<readonly ReportRecord[]>([]);
  const devices = shallowRef<readonly DeviceInfoItem[]>(MOCK_DEVICES);

  // Track which tasks we've already recorded as settled
  const reportedInstanceIds = new Set<string>();

  // --- Refresh (called by page polling) ---

  function refresh(): void {
    const active = northboundService.isActive();
    isActive.value = active;

    if (active) {
      connectionState.value = { https: 'connected', heartbeat: 'active', device: 'online' };
    } else {
      connectionState.value = { https: 'disconnected', heartbeat: 'inactive', device: 'offline' };
    }

    // Build task list from northbound mapping + task service
    const snapshot = northboundService.getSessionStatus();
    const rows: DockingTaskRow[] = [];
    const newReports: ReportRecord[] = [...reportRecords.value];

    for (const [testCaseId, { instanceId }] of snapshot.activeTestCases) {
      const instance = taskService.getInstance(instanceId);
      const progress = taskService.getProgress(instanceId);

      rows.push({
        testCaseId,
        instanceId,
        name: instance?.definitionRef.name ?? testCaseId,
        lifecycle: instance?.lifecycle ?? 'unknown',
        progress: progress ? `${progress.stepsCompleted}/${progress.stepsTotal}` : '—',
        startedAt: instance?.startedAt ?? '',
      });

      // Detect settled tasks → record as report
      const lifecycle = instance?.lifecycle;
      if (
        lifecycle === 'completed' ||
        lifecycle === 'failed' ||
        lifecycle === 'stopped'
      ) {
        if (!reportedInstanceIds.has(instanceId)) {
          reportedInstanceIds.add(instanceId);
          const verdict = resultService.getVerdict(instanceId);
          newReports.push({
            testCaseId,
            verdict: verdict?.kind ?? lifecycle,
            reportedAt: new Date().toISOString(),
          });
        }
      }
    }

    dockingTasks.value = rows;
    if (newReports.length !== reportRecords.value.length) {
      reportRecords.value = newReports;
    }
  }

  // --- Connect ---

  async function saveConfigAndConnect(): Promise<void> {
    isConnecting.value = true;
    try {
      await northboundService.start({
        serverHost: config.serverHost,
        serverPort: config.serverPort,
        customerBaseUrl: config.customerBaseUrl,
        subSysType: config.subSysType,
        subSysId: config.subSysId,
        auth: {
          loginUrl: config.loginUrl || `${config.customerBaseUrl}auth/partner/login`,
          clientId: config.clientId,
          username: config.username,
          password: config.password,
          grantType: config.grantType,
          tenantId: config.tenantId,
        },
      });
      showConfigDialog.value = false;
      persistConfig(config);
      refresh();
    } finally {
      isConnecting.value = false;
    }
  }

  // --- Disconnect ---

  async function disconnect(): Promise<void> {
    isDisconnecting.value = true;
    try {
      await northboundService.stop();
      reportedInstanceIds.clear();
      refresh();
    } finally {
      isDisconnecting.value = false;
    }
  }

  // --- Stop a single task ---

  function stopTask(instanceId: string): void {
    taskService.stopTask(instanceId);
  }

  return {
    connectionState,
    isActive,
    config,
    showConfigDialog,
    showReportDialog,
    isConnecting,
    isDisconnecting,
    dockingTasks,
    reportRecords,
    devices,
    refresh,
    saveConfigAndConnect,
    disconnect,
    stopTask,
  };
}
