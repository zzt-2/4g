import { ref, shallowRef, reactive } from 'vue';
import type { NorthboundService } from '@/features/northbound/services/northbound-service';
import type { TaskService } from '@/features/task';
import type { ResultService } from '@/features/result';
import type { DeviceInfoItem } from '@/features/northbound/core/types';
import type { UseNotifyReturn } from '@/shared/composables';
import { DEFAULT_DOCKING_CONFIG, MOCK_DEVICES } from '../components/docking-labels';
import type { DockingFileStorage } from '../services/docking-file-storage';
import {
  upsertMapping,
  removeMapping,
} from '../core/catalog-mapping';
import type { CatalogMapping } from '../core/catalog-mapping';

// --- Public types ---

export type { PersistedConfig } from '../services/docking-file-storage';

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
  // D006: FTP 配置(getTestCaseAll 用例数据走 FTP + TestReport 上传)
  ftpHost: string;
  ftpPort: number;
  ftpUsername: string;
  ftpPassword: string;
  ftpBasePath: string;
}

// --- Composable ---

export function useCentralDocking(
  northboundService: NorthboundService,
  taskService: TaskService,
  resultService: ResultService,
  notify: UseNotifyReturn,
  storage: DockingFileStorage,
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

  // S016:对接配置从文件持久化(storage)读,不再走 localStorage。
  // storage 已由 bootstrap hydrate 完(AppShell 保证 ready resolve 前不渲染路由)。
  const persistedConfig = storage.loadConfig();
  const config = reactive<DockingConfigForm>({
    ...DEFAULT_DOCKING_CONFIG,
    ...(persistedConfig ?? {}),
  });

  const dockingTasks = shallowRef<readonly DockingTaskRow[]>([]);
  const reportRecords = shallowRef<readonly ReportRecord[]>([]);

  // --- Device list (configurable, persisted via storage) ---
  const initialDevices = storage.loadDevices();
  const devices = shallowRef<readonly DeviceInfoItem[]>(
    initialDevices.length > 0 ? initialDevices : [...MOCK_DEVICES],
  );
  northboundService.setDeviceList(devices.value);

  // --- Catalog mappings (D004: 「模板→用例」映射,getTestCaseAll 的真实数据源) ---
  const initialMappings = storage.loadCatalogMappings();
  const catalogMappings = shallowRef<readonly CatalogMapping[]>(initialMappings);
  northboundService.setCatalogMappings(initialMappings);

  function syncMappings(next: readonly CatalogMapping[]): void {
    catalogMappings.value = next;
    northboundService.setCatalogMappings(next);
    storage.saveCatalogMappings(next);
  }

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
        // 优先按"发送次数"(sendsTotal 非 null 时反映 repeat 细粒度),回退 step 完成维度。
        progress: progress
          ? (progress.sendsTotal !== null
            ? `${progress.sendsCompleted}/${progress.sendsTotal}`
            : `${progress.stepsCompleted}/${progress.stepsTotal}`)
          : '—',
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
      // D006: FTP 配置可选。用户填了 ftpHost 才传 ftp(getTestCaseAll/TestReport 需要)。
      // 没填则不传,handleGetTestCaseAll 会回 statusCode:2 提示去配。
      const ftp = config.ftpHost.trim()
        ? {
            host: config.ftpHost.trim(),
            port: config.ftpPort,
            username: config.ftpUsername.trim(),
            password: config.ftpPassword,
            basePath: config.ftpBasePath.trim() || '/laser',
          }
        : undefined;
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
        ftp,
      });
      showConfigDialog.value = false;
      storage.saveConfig({ ...config });
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
    storage.saveDevices(next);
  }

  function updateDevice(deviceId: string, patch: Partial<DeviceInfoItem>): void {
    const next = devices.value.map(d =>
      d.deviceId === deviceId ? { ...d, ...patch } : d,
    );
    devices.value = next;
    northboundService.setDeviceList(next);
    storage.saveDevices(next);
  }

  function removeDevice(deviceId: string): void {
    const next = devices.value.filter(d => d.deviceId !== deviceId);
    devices.value = next;
    northboundService.setDeviceList(next);
    storage.saveDevices(next);
  }

  // --- Catalog mapping CRUD (D004) ---

  function saveMapping(mapping: CatalogMapping): void {
    syncMappings(upsertMapping(catalogMappings.value, mapping));
  }

  function deleteMapping(templateId: string): void {
    syncMappings(removeMapping(catalogMappings.value, templateId));
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
    catalogMappings,
    refresh,
    saveConfigAndConnect,
    disconnect,
    stopTask,
    addDevice,
    updateDevice,
    removeDevice,
    saveMapping,
    deleteMapping,
  };
}
