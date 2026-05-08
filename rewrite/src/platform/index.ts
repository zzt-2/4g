import {
  REWRITE_PLATFORM_BRIDGE_KEY,
  type RewritePlatformBridge,
  type RewritePlatformBridgeInfo,
  type TransportBridge,
} from '@/shared/platform-bridge';
import { createTransportFacade, type TransportFacade } from './transport';

export type { TransportFacade } from './transport';
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
