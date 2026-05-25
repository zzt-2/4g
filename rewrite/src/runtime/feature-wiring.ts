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
  type TaskService,
  type TaskStepResult,
} from '@/features/task';
import {
  createCommandIngressService,
  createCommandIngressState,
  type CommandIngressService,
  type ScoeGlobalConfig,
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
  type NorthboundService,
} from '@/features/northbound';
import { getHttpFacade } from '@/platform';
import { ConnectionBackedSendWriter } from './bridges/connection-backed-writer';
import { ConnectionBackedTargetResolver } from './bridges/connection-backed-target-resolver';
import { ReceiveEventSourceBridge } from './bridges/receive-event-source-bridge';

export interface RewriteWiredFeatures {
  readonly frameReader: FrameAssetReader;
  readonly frameService: FrameAssetService;
  readonly settingsService: SettingsService;
  readonly storageReader: StorageLocalReader;
  readonly storageService: StorageLocalService;
  readonly connectionService: ConnectionService;
  readonly receiveService: ReceiveService;
  readonly displayService: DisplayService;
  readonly sendService: SendService;
  readonly taskService: TaskService;
  readonly resultService: ResultService;
  readonly commandIngressService: CommandIngressService;
  readonly northboundService: NorthboundService;
  readonly receiveEventSourceBridge: ReceiveEventSourceBridge;
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
  const frameService = createDefaultFrameService();
  const frameReader = frameService;
  const settingsService = createSettingsService();
  const storageService = createDefaultStorageService();
  const storageReader = storageService;

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

  // Late-binding for onStepResult (northbound not yet created)
  const stepResultHolder = { current: undefined as ((instanceId: string, result: TaskStepResult) => void) | undefined };

  const resultState = createResultState();
  const resultService = createResultService(resultState);

  const taskService = createTaskService({
    sendService,
    receiveEventSource: receiveEventSourceBridge,
    onStepResult: (instanceId, result) => stepResultHolder.current?.(instanceId, result),
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
  const northboundService = createNorthboundService({
    taskService,
    resultService,
    httpFacade: httpFacade!,
    connectionSnapshot: () => connectionService.getSnapshot(),
  });

  // Bind the step result callback
  stepResultHolder.current = northboundService.handleStepResult;

  return {
    frameReader,
    frameService,
    settingsService,
    storageReader,
    storageService,
    connectionService,
    receiveService,
    displayService,
    sendService,
    taskService,
    resultService,
    commandIngressService,
    northboundService,
    receiveEventSourceBridge,
  };
}
