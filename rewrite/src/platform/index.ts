import {
  REWRITE_PLATFORM_BRIDGE_KEY,
  type RewritePlatformBridge,
  type RewritePlatformBridgeInfo,
  type TransportBridge,
  type FileBridge,
  type HttpBridge,
  type FtpBridge,
  type StorageBridge,
} from '@/shared/platform-bridge';
import { createTransportFacade, type TransportFacade } from './transport';
import { createFileFacade, type FileFacade } from './files';
import { createHttpFacade, type HttpFacade } from './http';
import { createFtpFacade, type FtpPlatformFacade } from './ftp';
import { createStorageFacade, type StoragePlatformFacade } from './storage';

export type { TransportFacade } from './transport';
export type { FileFacade, FileBridge } from './files';
export type { HttpFacade, HttpBridge } from './http';
export type { FtpPlatformFacade } from './ftp';
export type { StoragePlatformFacade } from './storage';
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

let cachedHttpFacade: HttpFacade | null = null;

export function getHttpFacade(): HttpFacade | null {
  if (cachedHttpFacade) return cachedHttpFacade;
  const bridge = getBridge();
  if (!bridge?.http) return null;
  cachedHttpFacade = createHttpFacade(bridge.http as HttpBridge);
  return cachedHttpFacade;
}

export function resetHttpFacade(): void {
  cachedHttpFacade = null;
}

let cachedFtpFacade: FtpPlatformFacade | null = null;

export function getFtpFacade(): FtpPlatformFacade | null {
  if (cachedFtpFacade) return cachedFtpFacade;
  const bridge = getBridge();
  if (!bridge?.ftp) return null;
  cachedFtpFacade = createFtpFacade(bridge.ftp as FtpBridge);
  return cachedFtpFacade;
}

export function resetFtpFacade(): void {
  cachedFtpFacade = null;
}

let cachedStorageFacade: StoragePlatformFacade | null = null;

export function getStorageFacade(): StoragePlatformFacade | null {
  if (cachedStorageFacade) return cachedStorageFacade;
  const bridge = getBridge();
  if (!bridge?.storage) return null;
  cachedStorageFacade = createStorageFacade(bridge.storage as StorageBridge);
  return cachedStorageFacade;
}

export function resetStorageFacade(): void {
  cachedStorageFacade = null;
}
