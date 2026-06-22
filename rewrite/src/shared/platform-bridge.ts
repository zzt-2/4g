export const REWRITE_PLATFORM_BRIDGE_KEY = 'dongfanghongRewritePlatform';

export type RewritePlatformCapability = 'transport' | 'file' | 'http' | 'ftp' | 'storage';

export interface RewritePlatformBridgeInfo {
  readonly name: 'dongfanghong-rewrite-platform';
  readonly version: string;
  readonly capabilities: readonly RewritePlatformCapability[];
}

// --- Transport bridge types ---

export interface SerialPortCandidate {
  readonly path: string;
  readonly manufacturer?: string;
  readonly serialNumber?: string;
  readonly pnpId?: string;
  readonly vendorId?: string;
  readonly productId?: string;
}

export type TransportBridgeEventKind =
  | 'connected'
  | 'disconnected'
  | 'data'
  | 'error';

export interface TransportBridgeEventTarget {
  readonly targetId: string;
  readonly label: string;
  readonly role: string;
  readonly kind: string;
  readonly routeLabel: string;
}

export interface TransportBridgeEventError {
  readonly kind: string;
  readonly message: string;
  readonly recoverable?: boolean;
}

export interface TransportBridgeEvent {
  readonly kind: TransportBridgeEventKind;
  readonly connectionId: string;
  readonly occurredAt: string;
  readonly bytes?: readonly number[];
  readonly byteLength?: number;
  readonly error?: TransportBridgeEventError;
  readonly target?: TransportBridgeEventTarget;
}

export interface TransportCommandResult {
  readonly ok: boolean;
  readonly events: readonly TransportBridgeEvent[];
  readonly error?: TransportBridgeEventError;
}

export interface SerialConnectConfig {
  readonly kind: 'serial';
  readonly id: string;
  readonly portPath: string;
  readonly baudRate: number;
  readonly dataBits?: 5 | 6 | 7 | 8;
  readonly stopBits?: 1 | 1.5 | 2;
  readonly parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  readonly flowControl?: 'none' | 'hardware' | 'software';
}

export interface TcpClientConnectConfig {
  readonly kind: 'tcp-client';
  readonly id: string;
  readonly host: string;
  readonly port: number;
}

export interface TcpServerConnectConfig {
  readonly kind: 'tcp-server';
  readonly id: string;
  readonly host: string;
  readonly port: number;
}

export interface UdpConnectConfig {
  readonly kind: 'udp';
  readonly id: string;
  readonly localHost: string;
  readonly localPort: number;
  readonly remoteHost?: string;
  readonly remotePort?: number;
}

export type TransportConnectConfig =
  | SerialConnectConfig
  | TcpClientConnectConfig
  | TcpServerConnectConfig
  | UdpConnectConfig;

export interface TransportBridge {
  enumerateSerialPorts(): Promise<readonly SerialPortCandidate[]>;
  connect(config: TransportConnectConfig): Promise<TransportCommandResult>;
  disconnect(connectionId: string): Promise<TransportCommandResult>;
  write(connectionId: string, bytes: readonly number[]): Promise<TransportCommandResult>;
  cleanup(): Promise<TransportCommandResult>;
  drainEvents(): readonly TransportBridgeEvent[];
  onEvent(callback: (event: TransportBridgeEvent) => void): () => void;
}

// --- File bridge types ---

export interface SaveDialogOptions {
  readonly title?: string;
  readonly defaultPath?: string;
  readonly filters?: readonly FileDialogFilter[];
}

export interface OpenDialogOptions {
  readonly title?: string;
  readonly defaultPath?: string;
  readonly filters?: readonly FileDialogFilter[];
  readonly multiple?: boolean;
}

export interface FileDialogFilter {
  readonly name: string;
  readonly extensions: readonly string[];
}

export interface FileBridge {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  showSaveDialog(opts: SaveDialogOptions): Promise<string | null>;
  showOpenDialog(opts: OpenDialogOptions): Promise<string | null>;
  getUserDataPath(): Promise<string>;
}

// --- HTTP bridge types ---

export interface HttpServerConfig {
  readonly host: string;
  readonly port: number;
  readonly tls?: { readonly cert: string; readonly key: string };
}

export interface HttpClientConfig {
  readonly url: string;
  readonly method: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly tls?: { readonly cert: string; readonly key: string; readonly ca?: string };
}

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly remoteAddress?: string;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface HttpBridge {
  startServer(config: HttpServerConfig): Promise<string>;
  stopServer(serverId: string): Promise<void>;
  onRequest(serverId: string, handler: (req: HttpRequest) => Promise<HttpResponse>): () => void;
  sendRequest(config: HttpClientConfig): Promise<HttpResponse>;
}

// --- FTP bridge types ---

export interface FtpUploadConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly remotePath: string;
  readonly content: string;
}

export interface FtpBridge {
  uploadFile(config: FtpUploadConfig): Promise<void>;
}

// --- Storage bridge types ---

export interface StorageActivateRequest {
  readonly connectionId: string;
  readonly compiledPatterns: readonly (readonly number[])[];
  readonly fileConfig: {
    readonly maxFileSize: number;
    readonly enableRotation: boolean;
    readonly rotationCount: number;
  };
}

export interface StorageStats {
  readonly totalFramesStored: number;
  readonly totalBytesStored: number;
  readonly currentFileSize: number;
  readonly storageStartTime: string | null;
  readonly lastStorageTime: string | null;
  readonly isStorageActive: boolean;
}

export interface StorageConfigUpdate {
  readonly maxFileSize?: number;
  readonly enableRotation?: boolean;
  readonly rotationCount?: number;
}

export interface StorageBridge {
  activate(request: StorageActivateRequest): Promise<{ readonly ok: boolean; readonly error?: string }>;
  deactivate(): Promise<{ readonly ok: boolean; readonly error?: string }>;
  getStats(): Promise<StorageStats>;
  reset(): Promise<{ readonly ok: boolean; readonly error?: string }>;
  updateConfig(config: StorageConfigUpdate): Promise<{ readonly ok: boolean; readonly error?: string }>;
}

// --- Window control bridge types ---
// 无边框窗口(frame:false)的最小化/最大化/关闭控制 + 最大化状态同步。
// renderer 侧自画三按钮,点击调本接口;最大化图标随 onMaximizeChange 事件切换。

export interface WindowControlBridge {
  minimize(): Promise<void>;
  /** 切换最大化/还原,返回切换后的最大化状态(供点击时即时反馈)。 */
  toggleMaximize(): Promise<boolean>;
  /** 当前是否最大化(组件初始化时取初始图标态)。 */
  isMaximized(): Promise<boolean>;
  close(): Promise<void>;
  /** 订阅最大化状态变化(系统 Snap/双击标题栏或按钮触发都推送),返回取消订阅。 */
  onMaximizeChange(callback: (maximized: boolean) => void): () => void;
}

// --- Bridge root ---

export interface RewritePlatformBridge {
  getBridgeInfo(): RewritePlatformBridgeInfo;
  readonly transport: TransportBridge;
  readonly file: FileBridge;
  readonly http?: HttpBridge;
  readonly ftp?: FtpBridge;
  readonly storage?: StorageBridge;
  readonly windowControl?: WindowControlBridge;
}

export function createRewriteBridgeInfo(
  version = '0.0.0',
  capabilities: readonly RewritePlatformCapability[] = ['transport'],
): RewritePlatformBridgeInfo {
  return {
    name: 'dongfanghong-rewrite-platform',
    version,
    capabilities,
  };
}
