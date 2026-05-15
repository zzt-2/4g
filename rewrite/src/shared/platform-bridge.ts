export const REWRITE_PLATFORM_BRIDGE_KEY = 'dongfanghongRewritePlatform';

export type RewritePlatformCapability = 'transport' | 'file';

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

// --- Bridge root ---

export interface RewritePlatformBridge {
  getBridgeInfo(): RewritePlatformBridgeInfo;
  readonly transport: TransportBridge;
  readonly file: FileBridge;
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
