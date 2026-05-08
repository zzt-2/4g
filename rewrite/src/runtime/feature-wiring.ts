import {
  createFrameAssetReader,
  type FrameAssetReader,
} from '@/features/frame';
import {
  createSettingsService,
  type SettingsService,
} from '@/features/settings';
import {
  createStorageLocalReader,
  type StorageLocalReader,
} from '@/features/storage-local-baseline';
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
} from '@/features/task';
import { ConnectionBackedSendWriter } from './bridges/connection-backed-writer';
import { ConnectionBackedTargetResolver } from './bridges/connection-backed-target-resolver';
import { ReceiveEventSourceBridge } from './bridges/receive-event-source-bridge';

export interface RewriteWiredFeatures {
  readonly frameReader: FrameAssetReader;
  readonly settingsService: SettingsService;
  readonly storageReader: StorageLocalReader;
  readonly connectionService: ConnectionService;
  readonly receiveService: ReceiveService;
  readonly sendService: SendService;
  readonly taskService: TaskService;
  readonly receiveEventSourceBridge: ReceiveEventSourceBridge;
}

export interface WireFeaturesOptions {
  readonly connectionAdapter: ConnectionTransportAdapter;
}

function createDefaultFrameReader(): FrameAssetReader {
  return createFrameAssetReader(() => ({ frames: [] }));
}

function createDefaultStorageReader(): StorageLocalReader {
  return createStorageLocalReader(() => ({
    records: [],
    historyMaterials: [],
    csvMaterials: [],
    legacyMaterials: [],
  }));
}

export function wireFeatures(
  options: WireFeaturesOptions,
): RewriteWiredFeatures {
  // L0: no cross-dependencies
  const frameReader = createDefaultFrameReader();
  const settingsService = createSettingsService();
  const storageReader = createDefaultStorageReader();

  // L1: needs adapter
  const connectionService = createConnectionService({
    adapter: options.connectionAdapter,
  });

  // L2: needs L0 + L1
  const receiveService = createReceiveService({ frameReader });

  const sendWriter = new ConnectionBackedSendWriter(connectionService);
  const targetResolver = new ConnectionBackedTargetResolver(connectionService);
  const sendService = createSendService({
    frameReader,
    targetResolver,
    transportWriter: sendWriter,
  });

  // L3: needs L2
  const receiveEventSourceBridge = new ReceiveEventSourceBridge();
  const taskService = createTaskService({
    sendService,
    receiveEventSource: receiveEventSourceBridge,
  });

  return {
    frameReader,
    settingsService,
    storageReader,
    connectionService,
    receiveService,
    sendService,
    taskService,
    receiveEventSourceBridge,
  };
}
