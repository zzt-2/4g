import { contextBridge, ipcRenderer } from 'electron';
import {
  createRewriteBridgeInfo,
  REWRITE_PLATFORM_BRIDGE_KEY,
  type TransportBridge,
  type TransportBridgeEvent,
  type TransportCommandResult,
  type SerialPortCandidate,
  type TransportConnectConfig,
  type FileBridge,
  type SaveDialogOptions,
  type OpenDialogOptions,
  type HttpBridge,
  type HttpServerConfig,
  type HttpClientConfig,
  type HttpRequest,
  type HttpResponse,
  type FtpBridge,
  type FtpUploadConfig,
  type StorageBridge,
  type StorageActivateRequest,
  type StorageConfigUpdate,
  type WindowControlBridge,
} from '../../src/shared/platform-bridge';

const IPC_ENUMERATE = 'transport:enumerate-serial-ports';
const IPC_CONNECT = 'transport:serial-connect';
const IPC_DISCONNECT = 'transport:serial-disconnect';
const IPC_WRITE = 'transport:serial-write';
const IPC_CLEANUP = 'transport:cleanup';
const IPC_EVENT_CHANNEL = 'transport:event';

const IPC_NETWORK_CONNECT = 'transport:network-connect';
const IPC_NETWORK_DISCONNECT = 'transport:network-disconnect';
const IPC_NETWORK_WRITE = 'transport:network-write';
const IPC_NETWORK_CLEANUP = 'transport:network-cleanup';

const IPC_READ_TEXT_FILE = 'file:read-text';
const IPC_WRITE_TEXT_FILE = 'file:write-text';
const IPC_SHOW_SAVE_DIALOG = 'file:show-save-dialog';
const IPC_SHOW_OPEN_DIALOG = 'file:show-open-dialog';
const IPC_GET_USER_DATA_PATH = 'file:get-user-data-path';

const IPC_HTTP_START_SERVER = 'http:start-server';
const IPC_HTTP_STOP_SERVER = 'http:stop-server';
const IPC_HTTP_SEND_REQUEST = 'http:send-request';
const IPC_HTTP_RESPOND = 'http:respond';
const IPC_HTTP_INCOMING_REQUEST = 'http:incoming-request';

const IPC_FTP_UPLOAD = 'ftp:upload-file';

const IPC_STORAGE_ACTIVATE = 'storage:activate';
const IPC_STORAGE_DEACTIVATE = 'storage:deactivate';
const IPC_STORAGE_GET_STATS = 'storage:get-stats';
const IPC_STORAGE_RESET = 'storage:reset';
const IPC_STORAGE_UPDATE_CONFIG = 'storage:update-config';

const IPC_WINDOW_MINIMIZE = 'window:minimize';
const IPC_WINDOW_MAXIMIZE_TOGGLE = 'window:maximize-toggle';
const IPC_WINDOW_IS_MAXIMIZED = 'window:is-maximized';
const IPC_WINDOW_CLOSE = 'window:close';
const IPC_WINDOW_MAXIMIZE_CHANGED = 'window:maximize-changed';

const eventBuffer: TransportBridgeEvent[] = [];
const eventCallbacks: ((event: TransportBridgeEvent) => void)[] = [];
const connectionTypes = new Map<string, 'serial' | 'network'>();

ipcRenderer.on(IPC_EVENT_CHANNEL, (_e, event: TransportBridgeEvent) => {
  if (event.kind === 'connected' && event.target?.role === 'tcp-server-client') {
    connectionTypes.set(event.connectionId, 'network');
  }
  if (event.kind === 'disconnected') {
    connectionTypes.delete(event.connectionId);
  }

  eventBuffer.push(event);
  for (const cb of eventCallbacks) {
    try {
      cb(event);
    } catch {
      // ignore callback errors
    }
  }
});

const transportBridge: TransportBridge = {
  async enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]> {
    return ipcRenderer.invoke(IPC_ENUMERATE);
  },

  async connect(config: TransportConnectConfig): Promise<TransportCommandResult> {
    if (config.kind === 'serial') {
      const result = await ipcRenderer.invoke(IPC_CONNECT, config);
      if (result.ok) connectionTypes.set(config.id, 'serial');
      return result;
    }
    const result = await ipcRenderer.invoke(IPC_NETWORK_CONNECT, config);
    if (result.ok) connectionTypes.set(config.id, 'network');
    return result;
  },

  async disconnect(connectionId: string): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    connectionTypes.delete(connectionId);
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_DISCONNECT, connectionId);
    }
    return ipcRenderer.invoke(IPC_NETWORK_DISCONNECT, connectionId);
  },

  async write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult> {
    const type = connectionTypes.get(connectionId);
    if (type === 'serial') {
      return ipcRenderer.invoke(IPC_WRITE, connectionId, bytes);
    }
    return ipcRenderer.invoke(IPC_NETWORK_WRITE, connectionId, bytes);
  },

  async cleanup(): Promise<TransportCommandResult> {
    connectionTypes.clear();
    const [serialResult, networkResult] = await Promise.all([
      ipcRenderer.invoke(IPC_CLEANUP),
      ipcRenderer.invoke(IPC_NETWORK_CLEANUP),
    ]);
    connectionTypes.clear();
    return {
      ok: serialResult.ok && networkResult.ok,
      events: [...serialResult.events, ...networkResult.events],
    };
  },

  drainEvents(): readonly TransportBridgeEvent[] {
    return eventBuffer.splice(0, eventBuffer.length);
  },

  onEvent(callback: (event: TransportBridgeEvent) => void): () => void {
    eventCallbacks.push(callback);
    return () => {
      const idx = eventCallbacks.indexOf(callback);
      if (idx >= 0) eventCallbacks.splice(idx, 1);
    };
  },
};

const fileBridge: FileBridge = {
  async readTextFile(filePath: string): Promise<string> {
    return ipcRenderer.invoke(IPC_READ_TEXT_FILE, filePath);
  },
  async writeTextFile(filePath: string, content: string): Promise<void> {
    return ipcRenderer.invoke(IPC_WRITE_TEXT_FILE, filePath, content);
  },
  async showSaveDialog(opts: SaveDialogOptions): Promise<string | null> {
    return ipcRenderer.invoke(IPC_SHOW_SAVE_DIALOG, opts);
  },
  async showOpenDialog(opts: OpenDialogOptions): Promise<string | null> {
    return ipcRenderer.invoke(IPC_SHOW_OPEN_DIALOG, opts);
  },
  async getUserDataPath(): Promise<string> {
    return ipcRenderer.invoke(IPC_GET_USER_DATA_PATH);
  },
};

// --- HTTP bridge ---

const httpRequestHandlers = new Map<string, (req: HttpRequest) => Promise<HttpResponse>>();

ipcRenderer.on(IPC_HTTP_INCOMING_REQUEST, (_e, { requestId, serverId, request }: {
  requestId: string;
  serverId: string;
  request: HttpRequest;
}) => {
  const handler = httpRequestHandlers.get(serverId);
  if (!handler) {
    ipcRenderer.invoke(IPC_HTTP_RESPOND, {
      requestId,
      response: { statusCode: 503, body: 'No handler registered' },
    });
    return;
  }

  handler(request)
    .then((response) => {
      return ipcRenderer.invoke(IPC_HTTP_RESPOND, { requestId, response });
    })
    .catch((err) => {
      return ipcRenderer.invoke(IPC_HTTP_RESPOND, {
        requestId,
        response: {
          statusCode: 500,
          body: err instanceof Error ? err.message : 'Internal handler error',
        },
      });
    });
});

const httpBridge: HttpBridge = {
  async startServer(config: HttpServerConfig): Promise<string> {
    return ipcRenderer.invoke(IPC_HTTP_START_SERVER, config);
  },
  async stopServer(serverId: string): Promise<void> {
    return ipcRenderer.invoke(IPC_HTTP_STOP_SERVER, serverId);
  },
  onRequest(serverId: string, handler: (req: HttpRequest) => Promise<HttpResponse>): () => void {
    httpRequestHandlers.set(serverId, handler);
    return () => { httpRequestHandlers.delete(serverId); };
  },
  async sendRequest(config: HttpClientConfig): Promise<HttpResponse> {
    return ipcRenderer.invoke(IPC_HTTP_SEND_REQUEST, config);
  },
};

const ftpBridge: FtpBridge = {
  async uploadFile(config: FtpUploadConfig): Promise<void> {
    return ipcRenderer.invoke(IPC_FTP_UPLOAD, config);
  },
};

const storageBridge: StorageBridge = {
  async activate(request: StorageActivateRequest) {
    return ipcRenderer.invoke(IPC_STORAGE_ACTIVATE, request);
  },
  async deactivate() {
    return ipcRenderer.invoke(IPC_STORAGE_DEACTIVATE);
  },
  async getStats() {
    return ipcRenderer.invoke(IPC_STORAGE_GET_STATS);
  },
  async reset() {
    return ipcRenderer.invoke(IPC_STORAGE_RESET);
  },
  async updateConfig(config: StorageConfigUpdate) {
    return ipcRenderer.invoke(IPC_STORAGE_UPDATE_CONFIG, config);
  },
};

// --- Window control bridge ---
// 最大化状态订阅:主进程在 maximize/unmaximize 时推送一次,renderer 图标跟着切。
const maximizeChangeCallbacks: ((maximized: boolean) => void)[] = [];
ipcRenderer.on(IPC_WINDOW_MAXIMIZE_CHANGED, (_e, maximized: boolean) => {
  for (const cb of maximizeChangeCallbacks) {
    try {
      cb(maximized);
    } catch {
      // ignore callback errors
    }
  }
});

const windowControlBridge: WindowControlBridge = {
  async minimize(): Promise<void> {
    return ipcRenderer.invoke(IPC_WINDOW_MINIMIZE);
  },
  async toggleMaximize(): Promise<boolean> {
    return ipcRenderer.invoke(IPC_WINDOW_MAXIMIZE_TOGGLE);
  },
  async isMaximized(): Promise<boolean> {
    return ipcRenderer.invoke(IPC_WINDOW_IS_MAXIMIZED);
  },
  async close(): Promise<void> {
    return ipcRenderer.invoke(IPC_WINDOW_CLOSE);
  },
  onMaximizeChange(callback: (maximized: boolean) => void): () => void {
    maximizeChangeCallbacks.push(callback);
    return () => {
      const idx = maximizeChangeCallbacks.indexOf(callback);
      if (idx >= 0) maximizeChangeCallbacks.splice(idx, 1);
    };
  },
};

const rewriteBridge = Object.freeze({
  getBridgeInfo: () => createRewriteBridgeInfo('0.0.0'),
  transport: transportBridge,
  file: fileBridge,
  http: httpBridge,
  ftp: ftpBridge,
  storage: storageBridge,
  windowControl: windowControlBridge,
});

contextBridge.exposeInMainWorld(REWRITE_PLATFORM_BRIDGE_KEY, rewriteBridge);
