import type {
  HttpBridge,
  HttpServerConfig,
  HttpClientConfig,
  HttpRequest,
  HttpResponse,
} from '@/shared/platform-bridge';

export type { HttpBridge, HttpServerConfig, HttpClientConfig, HttpRequest, HttpResponse };

export interface HttpFacade {
  startServer(config: HttpServerConfig): Promise<string>;
  stopServer(serverId: string): Promise<void>;
  onRequest(serverId: string, handler: (req: HttpRequest) => Promise<HttpResponse>): () => void;
  sendRequest(config: HttpClientConfig): Promise<HttpResponse>;
}

export function createHttpFacade(bridge: HttpBridge): HttpFacade {
  return {
    startServer: (config) => bridge.startServer(config),
    stopServer: (serverId) => bridge.stopServer(serverId),
    onRequest: (serverId, handler) => bridge.onRequest(serverId, handler),
    sendRequest: (config) => bridge.sendRequest(config),
  };
}
