import {
  createFrameAssetService,
  type FrameAssetReader,
  type FrameAssetService,
} from '@/features/frame';
import {
  createSettingsService,
  type SettingsService,
} from '@/features/settings';
import {
  createStorageLocalService,
  type StorageLocalReader,
  type StorageLocalService,
} from '@/features/storage-local-baseline';
import { createFakeLocalMaterialAdapter } from '@/features/storage-local-baseline/adapters/fake-local-material-adapter';
import {
  createConnectionService,
  type ConnectionService,
  type ConnectionTransportAdapter,
} from '@/features/connection';
import {
  createReceiveService,
  type ReceiveService,
} from '@/features/receive';
import {
  createSendService,
  type SendService,
} from '@/features/send';
import {
  createTaskService,
  createTaskHistoryStorage,
  type TaskService,
} from '@/features/task';
import {
  createCommandIngressService,
  createCommandIngressState,
  type CommandIngressService,
  type ScoeGlobalConfig,
} from '@/features/command-ingress';
import { LazyDockingStorage } from '@/features/command-ingress/services/docking-file-storage';
import { LazyReportConfigStorage } from '@/features/command-ingress/services/report-config-file-storage';
import {
  createDockingBatchRegistry,
  type DockingBatchRegistry,
} from '@/features/command-ingress';
import {
  createDisplayService,
  type DisplayService,
} from '@/features/display';
import {
  createResultService,
  createResultState,
  type ResultService,
} from '@/features/result';
import {
  createNorthboundService,
  createReportedSnapshotStorage,
  type NorthboundService,
} from '@/features/northbound';
import {
  createStorageHighspeedService,
  type StorageHighspeedService,
} from '@/features/storage-highspeed';
import { getHttpFacade, getStorageFacade, getFtpFacade, getRecordingFacade } from '@/platform';
import { ConnectionBackedSendWriter } from './bridges/connection-backed-writer';
import { ConnectionBackedTargetResolver } from './bridges/connection-backed-target-resolver';
import { ReceiveEventSourceBridge } from './bridges/receive-event-source-bridge';
import { RecordingBridge } from './bridges/recording-bridge';
import {
  createRecordingService,
  type RecordingService,
} from '@/features/recording';

export interface RewriteWiredFeatures {
  readonly frameReader: FrameAssetReader;
  readonly frameService: FrameAssetService;
  readonly settingsService: SettingsService;
  readonly storageReader: StorageLocalReader;
  readonly storageService: StorageLocalService;
  readonly highSpeedStorageService: StorageHighspeedService;
  readonly connectionService: ConnectionService;
  readonly receiveService: ReceiveService;
  readonly displayService: DisplayService;
  readonly sendService: SendService;
  readonly taskService: TaskService;
  readonly resultService: ResultService;
  readonly commandIngressService: CommandIngressService;
  readonly northboundService: NorthboundService;
  readonly receiveEventSourceBridge: ReceiveEventSourceBridge;
  /** S016: 中心对接数据文件持久化 holder(对接配置/设备/映射表)。wireFeatures 时建空壳,
   *  bootstrap 拿到 fileFacade 后建真 storage + hydrate + setDelegate 注入。 */
  readonly dockingStorage: LazyDockingStorage;
  /** S018: 用例报告配置文件持久化 holder(state/report-configs.json)。wireFeatures 时建空壳,
   *  bootstrap 拿到 fileFacade 后建真 storage + hydrate + setDelegate 注入。
   *  northbound 的 reportConfigProvider 闭包调 getByTemplateId,空壳阶段返 undefined(诚实空)。 */
  readonly reportConfigStorage: LazyReportConfigStorage;
  /** 中心下发批次元信息内存映射表(不持久化,setTestTask 时建,重启清空)。
   *  批次面板从 taskService 实例 + 此映射表派生(spec: 批次历史改内存派生)。 */
  readonly batchRegistry: DockingBatchRegistry;
  /** H014/S012:实时录制服务(状态全局,切路由不中断)。 */
  readonly recordingService: RecordingService;
  /** H014/S012:从 routingTick outcomes 采集选中帧(O(1) 早退守 S015)。 */
  readonly recordingBridge: RecordingBridge;
}

export interface WireFeaturesOptions {
  readonly connectionAdapter: ConnectionTransportAdapter;
}

function createDefaultFrameService(): FrameAssetService {
  return createFrameAssetService();
}

function createDefaultStorageService(): StorageLocalService {
  const adapter = createFakeLocalMaterialAdapter();
  return createStorageLocalService({ adapter });
}

export function wireFeatures(
  options: WireFeaturesOptions,
): RewriteWiredFeatures {
  // L0: no cross-dependencies
  const dockingStorage = new LazyDockingStorage();
  const reportConfigStorage = new LazyReportConfigStorage();
  const batchRegistry = createDockingBatchRegistry();
  const frameService = createDefaultFrameService();
  const frameReader = frameService;
  const settingsService = createSettingsService();
  const storageService = createDefaultStorageService();
  const storageReader = storageService;

  const storageFacade = getStorageFacade();
  const highSpeedStorageService = createStorageHighspeedService({
    platformFacade: storageFacade ?? {
      activateFilter: async () => ({ ok: false, error: 'Storage facade not available' }),
      deactivateFilter: async () => ({ ok: false, error: 'Storage facade not available' }),
      getStats: async () => ({
        totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
        storageStartTime: null, lastStorageTime: null, isStorageActive: false,
      }),
      resetStats: async () => ({ ok: false, error: 'Storage facade not available' }),
      updateConfig: async () => ({ ok: false, error: 'Storage facade not available' }),
    },
  });

  // H014/S012:录制服务(独立路径,不碰 storage-local records,见 D013)。
  // L0 层,无依赖。facade 缺失(测试/非 Electron)时用 stub,appendFrames 静默丢弃。
  // frameReader 用于 start() 时取选中帧定义快照写进 .bin 头部(防漂移,H015)。
  const recordingFacade = getRecordingFacade();
  const recordingService = createRecordingService({
    frameReader,
    platformFacade: recordingFacade ?? {
      activate: async () => ({ ok: false, error: 'Recording facade not available' }),
      deactivate: async () => ({ ok: false, error: 'Recording facade not available' }),
      appendFrames: async () => ({ ok: false, error: 'Recording facade not available' }),
      getStats: async () => ({
        totalFramesStored: 0, totalBytesStored: 0, currentFileSize: 0,
        storageStartTime: null, lastStorageTime: null, isStorageActive: false,
      }),
      reset: async () => ({ ok: false, error: 'Recording facade not available' }),
      updateConfig: async () => ({ ok: false, error: 'Recording facade not available' }),
      listRecordingFiles: async () => [],
      readRecordingFile: async () => ({ bytes: [], ok: false, error: 'Recording facade not available' }),
    },
  });
  const recordingBridge = new RecordingBridge(recordingService);

  // L1: needs adapter
  const connectionService = createConnectionService({
    adapter: options.connectionAdapter,
  });

  // L2: needs L0 + L1
  const receiveService = createReceiveService({ frameReader });
  const displayService = createDisplayService();

  const sendWriter = new ConnectionBackedSendWriter(connectionService);
  const targetResolver = new ConnectionBackedTargetResolver(connectionService);
  const sendService = createSendService({
    frameReader,
    targetResolver,
    transportWriter: sendWriter,
  });

  // L3: needs L2
  const receiveEventSourceBridge = new ReceiveEventSourceBridge();

  const resultState = createResultState();
  const resultService = createResultService(resultState);

  const taskService = createTaskService({
    sendService,
    receiveEventSource: receiveEventSourceBridge,
    // S014: 接线 fieldValueProvider, 让 repeat.until / exitCondition 在生产生效。
    // 这两者不走 push registry, 只能 pull 当前字段值快照; 不接则永不触发。
    // wait-condition step 不依赖它(走 registry.processInput push 模型)。
    fieldValueProvider: () => receiveEventSourceBridge.getLatestFieldValues(),
    // templateStorage 不在此注入(S012 根因 D):wireFeatures 同步初始化时无 fileFacade,
    // 启动模板为空。bootstrap 异步读到文件后端后调 setTemplateStorage + hydrateTemplates 注入。
    historyStorage: createTaskHistoryStorage(),
  });

  // L4: needs L3 + config
  const defaultGlobalConfig: ScoeGlobalConfig = {
    scoeIdentifier: '',
    tcpServerIp: '0.0.0.0',
    tcpServerPort: 0,
    tcpServerAutoConnect: false,
    udpIpAddress: '0.0.0.0',
    udpPort: 0,
    udpTargetId: '',
    messageIdentifierOffset: 0,
    sourceIdentifierOffset: 0,
    destinationIdentifierOffset: 0,
    modelIdOffset: 0,
    satelliteIdOffset: 0,
    functionCodeOffset: 0,
  };
  const commandIngressState = createCommandIngressState(defaultGlobalConfig);
  const commandIngressService = createCommandIngressService({
    globalConfig: defaultGlobalConfig,
    commandConfigs: [],
    satelliteConfigs: [],
    taskService,
    sendService,
    frameReader,
    connectionService,
    connectionSnapshot: () => connectionService.getSnapshot(),
    receiveSnapshot: () => ({}),
    platformFileReader: async () => [],
    stateReader: commandIngressState.reader,
    stateWriter: commandIngressState.writer,
  });

  // L5: needs L3 + L4 + platform facades
  const httpFacade = getHttpFacade();
  const ftpFacade = getFtpFacade();
  // D: reportedSnapshotStorage 负责持久化 encode 快照(getTestCaseAll 时 save),
  // setTestTask 下发时按 outCaseId(=testCaseId)load 反查,decode 还原带参数覆盖的 TaskDefinition。
  // 漏接它 → snapshot missing → 用占位 fail 任务,真实测试逻辑不执行。
  // 默认用 localStorage(renderer 进程可用);无 localStorage 环境退化成空 storage。
  const reportedSnapshotStorage = createReportedSnapshotStorage();
  const northboundService = createNorthboundService({
    taskService,
    resultService,
    httpFacade: httpFacade!,
    ftpFacade: ftpFacade ?? undefined,
    connectionSnapshot: () => connectionService.getSnapshot(),
    reportedSnapshotStorage,
    // 批次元信息内存映射表(spec: 批次历史改内存派生):不持久化,setTestTask 时建,面板从实例派生。
    batchRegistry,
    // S018: 报告配置驱动(D008)。reportConfigProvider 闭包调 holder.getByTemplateId——
    // holder 是 LazyReportConfigStorage,wireFeatures 同步建空壳,bootstrap 异步 hydrate 后 setDelegate。
    // 漏传这两项 = 报告生成时取不到数据 = 静默失败(同 S014/S017 病),必须显式注入。
    reportConfigProvider: (templateId) => reportConfigStorage.getByTemplateId(templateId),
    displayFieldReader: displayService, // getSourceFields() 已存在(display-service.ts:251)
  });

  // 事件订阅（onStepResult / onTaskSettled）由 northbound 在 start() 内自管

  return {
    frameReader,
    frameService,
    settingsService,
    storageReader,
    storageService,
    highSpeedStorageService,
    connectionService,
    receiveService,
    displayService,
    sendService,
    taskService,
    resultService,
    commandIngressService,
    northboundService,
    receiveEventSourceBridge,
    dockingStorage,
    reportConfigStorage,
    batchRegistry,
    recordingService,
    recordingBridge,
  };
}
