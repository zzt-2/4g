import {
  REWRITE_PLATFORM_BRIDGE_KEY,
  type RewritePlatformBridge,
  type RewritePlatformBridgeInfo,
  type TransportBridge,
  type FileBridge,
} from '@/shared/platform-bridge';
import { createTransportFacade, type TransportFacade } from './transport';
import { createFileFacade, type FileFacade } from './files';

export type { TransportFacade } from './transport';
export type { FileFacade, FileBridge } from './files';
export type {
  SerialPortCandidate,
  TransportBridgeEvent,
  TransportCommandResult,
  TransportBridgeEventKind,
  TransportBridgeEventError,
  SerialConnectConfig,
  TransportConnectConfig,
  TcpClientConnectConfig,
  TcpServerConnectConfig,
  UdpConnectConfig,
  SaveDialogOptions,
  OpenDialogOptions,
  FileDialogFilter,
} from '@/shared/platform-bridge';

declare global {
  interface Window {
    [REWRITE_PLATFORM_BRIDGE_KEY]?: RewritePlatformBridge;
  }
}

function getBridge(): RewritePlatformBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window[REWRITE_PLATFORM_BRIDGE_KEY];
}

export function getRewritePlatformBridgeInfo(): RewritePlatformBridgeInfo | null {
  return getBridge()?.getBridgeInfo() ?? null;
}

let cachedTransportFacade: TransportFacade | null = null;

export function getTransportFacade(): TransportFacade | null {
  if (cachedTransportFacade) return cachedTransportFacade;
  const bridge = getBridge();
  if (!bridge?.transport) return null;
  cachedTransportFacade = createTransportFacade(bridge.transport as TransportBridge);
  return cachedTransportFacade;
}

export function resetTransportFacade(): void {
  cachedTransportFacade = null;
}

let cachedFileFacade: FileFacade | null = null;

export function getFileFacade(): FileFacade | null {
  if (cachedFileFacade) return cachedFileFacade;
  const bridge = getBridge();
  if (!bridge?.file) return null;
  cachedFileFacade = createFileFacade(bridge.file as FileBridge);
  return cachedFileFacade;
}

export function resetFileFacade(): void {
  cachedFileFacade = null;
}
