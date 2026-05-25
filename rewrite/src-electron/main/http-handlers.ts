import { ipcMain, BrowserWindow } from 'electron';
import http from 'node:http';
import type { HttpServerConfig, HttpClientConfig, HttpRequest, HttpResponse } from '../../src/shared/platform-bridge';

const IPC_START_SERVER = 'http:start-server';
const IPC_STOP_SERVER = 'http:stop-server';
const IPC_SEND_REQUEST = 'http:send-request';
const IPC_RESPOND = 'http:respond';
const IPC_INCOMING_REQUEST = 'http:incoming-request';

const activeServers = new Map<string, http.Server>();
const pendingRequests = new Map<string, { res: http.ServerResponse; timer: ReturnType<typeof setTimeout> }>();
let nextServerId = 1;
let nextRequestId = 1;

function toHttpRequest(req: http.IncomingMessage, body: string): HttpRequest {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  return {
    method: req.method ?? 'GET',
    url: req.url ?? '/',
    headers,
    body,
    remoteAddress: req.socket.remoteAddress,
  };
}

function collectBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function handleStartServer(
  _e: Electron.IpcMainInvokeEvent,
  config: HttpServerConfig,
): Promise<string> {
  const serverId = `http-server-${nextServerId++}`;

  const server = http.createServer(async (req, res) => {
    try {
      const body = await collectBody(req);
      const httpReq = toHttpRequest(req, body);
      const requestId = `http-req-${nextRequestId++}`;

      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        res.writeHead(500);
        res.end('No renderer available');
        return;
      }

      // Store pending response and forward request to renderer
      const timer = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          res.writeHead(504);
          res.end('Request timeout');
        }
      }, 30_000);

      pendingRequests.set(requestId, { res, timer });
      win.webContents.send(IPC_INCOMING_REQUEST, { requestId, serverId, request: httpReq });
    } catch (err) {
      res.writeHead(500);
      res.end(err instanceof Error ? err.message : 'Internal error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(config.port, config.host, () => resolve());
  });

  activeServers.set(serverId, server);
  return serverId;
}

async function handleStopServer(
  _e: Electron.IpcMainInvokeEvent,
  serverId: string,
): Promise<void> {
  const server = activeServers.get(serverId);
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  activeServers.delete(serverId);
}

function handleRespond(
  _e: Electron.IpcMainInvokeEvent,
  { requestId, response }: { requestId: string; response: HttpResponse },
): void {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  clearTimeout(pending.timer);
  pendingRequests.delete(requestId);
  pending.res.writeHead(response.statusCode, response.headers ?? {});
  pending.res.end(response.body);
}

async function handleSendRequest(
  _e: Electron.IpcMainInvokeEvent,
  config: HttpClientConfig,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(config.url);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: config.method,
      headers: config.headers as Record<string, string> | undefined,
    };

    const req = http.request(options, (res) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(res.headers)) {
        if (typeof value === 'string') headers[key] = value;
        else if (Array.isArray(value)) headers[key] = value.join(', ');
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode ?? 200,
          headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });

    req.on('error', reject);
    if (config.body) req.write(config.body);
    req.end();
  });
}

export function registerHttpHandlers(): void {
  ipcMain.handle(IPC_START_SERVER, handleStartServer);
  ipcMain.handle(IPC_STOP_SERVER, handleStopServer);
  ipcMain.handle(IPC_SEND_REQUEST, handleSendRequest);
  ipcMain.handle(IPC_RESPOND, handleRespond);
}

export function cleanupHttpHandlers(): void {
  for (const pending of pendingRequests.values()) {
    clearTimeout(pending.timer);
  }
  pendingRequests.clear();
  for (const [id, server] of activeServers) {
    server.close();
    activeServers.delete(id);
  }
  ipcMain.removeHandler(IPC_START_SERVER);
  ipcMain.removeHandler(IPC_STOP_SERVER);
  ipcMain.removeHandler(IPC_SEND_REQUEST);
  ipcMain.removeHandler(IPC_RESPOND);
}
