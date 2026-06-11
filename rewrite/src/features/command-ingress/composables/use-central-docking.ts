import { ref, shallowRef, reactive } from 'vue';
import type { NorthboundService } from '@/features/northbound/services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import type { UseNotifyReturn } from '@/shared/composables';
import { DEFAULT_DOCKING_CONFIG, MOCK_DEVICES, DEFAULT_TEST_CATALOG } from '../components/docking-labels';

// --- Persistence helpers ---

const CONFIG_KEY = 'northbound-docking-config';
const DEVICES_KEY = 'northbound-docking-devices';
const TEST_CATALOG_KEY = 'northbound-docking-test-catalog';

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

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
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
  localStorage.setItem(CONFIG_KEY, JSON.stringify(persisted));
}

function persistDevices(items: readonly DeviceInfoItem[]): void {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(items));
}

function persistTestCatalog(data: unknown): void {
  localStorage.setItem(TEST_CATALOG_KEY, JSON.stringify(data));
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
  notify: UseNotifyReturn,
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
    ...loadJson<Partial<PersistedConfig>>(CONFIG_KEY, {}),
  });

  const dockingTasks = shallowRef<readonly DockingTaskRow[]>([]);
  const reportRecords = shallowRef<readonly ReportRecord[]>([]);

  // --- Device list (configurable, persisted) ---
  const initialDevices = loadJson<DeviceInfoItem[]>(DEVICES_KEY, [...MOCK_DEVICES]);
  const devices = shallowRef<readonly DeviceInfoItem[]>(initialDevices);
  northboundService.setDeviceList(initialDevices);

  // --- Test case catalog (configurable, persisted) ---
  const initialCatalog = loadJson<Record<string, unknown>>(TEST_CATALOG_KEY, DEFAULT_TEST_CATALOG);
  const testCatalog = shallowRef(initialCatalog);
  northboundService.setTestCatalogData(initialCatalog);

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
      notify.success('已连接甲方');
    } catch (e) {
      notify.error('连接失败', e instanceof Error ? e.message : String(e));
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
      notify.success('已断开连接');
    } catch (e) {
      notify.error('断开失败', e instanceof Error ? e.message : String(e));
    } finally {
      isDisconnecting.value = false;
    }
  }

  // --- Stop a single task ---

  function stopTask(instanceId: string): void {
    taskService.stopTask(instanceId);
  }

  // --- Device CRUD ---

  function addDevice(device: DeviceInfoItem): void {
    const next = [...devices.value, device];
    devices.value = next;
    northboundService.setDeviceList(next);
    persistDevices(next);
  }

  function updateDevice(deviceId: string, patch: Partial<DeviceInfoItem>): void {
    const next = devices.value.map(d =>
      d.deviceId === deviceId ? { ...d, ...patch } : d,
    );
    devices.value = next;
    northboundService.setDeviceList(next);
    persistDevices(next);
  }

  function removeDevice(deviceId: string): void {
    const next = devices.value.filter(d => d.deviceId !== deviceId);
    devices.value = next;
    northboundService.setDeviceList(next);
    persistDevices(next);
  }

  // --- Test catalog update ---

  function updateTestCatalog(data: Record<string, unknown>): void {
    testCatalog.value = data;
    northboundService.setTestCatalogData(data);
    persistTestCatalog(data);
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
    testCatalog,
    refresh,
    saveConfigAndConnect,
    disconnect,
    stopTask,
    addDevice,
    updateDevice,
    removeDevice,
    updateTestCatalog,
  };
}
