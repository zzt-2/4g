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
  type NorthboundService,
} from '@/features/northbound';
import {
  createStorageHighspeedService,
  type StorageHighspeedService,
} from '@/features/storage-highspeed';
import { getHttpFacade, getStorageFacade, getFtpFacade } from '@/platform';
import { ConnectionBackedSendWriter } from './bridges/connection-backed-writer';
import { ConnectionBackedTargetResolver } from './bridges/connection-backed-target-resolver';
import { ReceiveEventSourceBridge } from './bridges/receive-event-source-bridge';

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
  const northboundService = createNorthboundService({
    taskService,
    resultService,
    httpFacade: httpFacade!,
    ftpFacade: ftpFacade ?? undefined,
    connectionSnapshot: () => connectionService.getSnapshot(),
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
  };
}
