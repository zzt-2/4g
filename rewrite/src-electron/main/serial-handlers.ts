import { ipcMain, type BrowserWindow } from 'electron';
import { SerialPort } from 'serialport';
import type {
  SerialPortCandidate,
  SerialConnectConfig,
  TransportBridgeEvent,
  TransportBridgeEventError,
  TransportCommandResult,
} from '../../src/shared/platform-bridge';
import { storageFilter } from './storage-filter';

const IPC_ENUMERATE = 'transport:enumerate-serial-ports';
const IPC_CONNECT = 'transport:serial-connect';
const IPC_DISCONNECT = 'transport:serial-disconnect';
const IPC_WRITE = 'transport:serial-write';
const IPC_CLEANUP = 'transport:cleanup';
const IPC_EVENT_CHANNEL = 'transport:event';

interface ManagedSerialPort {
  port: SerialPort;
  config: SerialConnectConfig;
  batchBuffer: number[];
  batchTimer: ReturnType<typeof setTimeout> | null;
}

interface BatchConfig {
  readonly maxBatchBytes: number;
  readonly maxBatchWindowMs: number;
  readonly maxQueueDepth: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchBytes: 4096,
  maxBatchWindowMs: 50,
  maxQueueDepth: 100,
};

let connections = new Map<string, ManagedSerialPort>();
let eventQueue: TransportBridgeEvent[] = [];
let batchConfig: BatchConfig = DEFAULT_BATCH_CONFIG;
const intentionalDisconnect = new Set<string>();

function now(): string {
  return new Date().toISOString();
}

function emitToRenderer(win: BrowserWindow, event: TransportBridgeEvent): void {
  if (eventQueue.length >= batchConfig.maxQueueDepth) {
    eventQueue.shift();
  }
  eventQueue.push(event);
  try {
    win.webContents.send(IPC_EVENT_CHANNEL, event);
  } catch {
    // webContents may be destroyed during shutdown
  }
}

function flushBatch(conn: ManagedSerialPort, win: BrowserWindow): void {
  if (conn.batchBuffer.length === 0) return;
  const bytes = conn.batchBuffer;
  conn.batchBuffer = [];

  if (conn.batchTimer !== null) {
    clearTimeout(conn.batchTimer);
    conn.batchTimer = null;
  }

  emitToRenderer(win, {
    kind: 'data',
    connectionId: conn.config.id,
    occurredAt: now(),
    bytes,
    byteLength: bytes.length,
  });
}

function scheduleBatchFlush(conn: ManagedSerialPort, win: BrowserWindow): void {
  if (conn.batchBuffer.length >= batchConfig.maxBatchBytes) {
    flushBatch(conn, win);
    return;
  }
  if (conn.batchTimer !== null) return;
  conn.batchTimer = setTimeout(() => {
    conn.batchTimer = null;
    flushBatch(conn, win);
  }, batchConfig.maxBatchWindowMs);
}

function toError(err: unknown): TransportBridgeEventError {
  if (err instanceof Error) {
    return { kind: 'open-failed', message: err.message, recoverable: true };
  }
  return { kind: 'open-failed', message: String(err), recoverable: true };
}

function cleanupConnection(conn: ManagedSerialPort): void {
  if (conn.batchBuffer.length > 0) {
    conn.batchBuffer = [];
  }
  if (conn.batchTimer !== null) {
    clearTimeout(conn.batchTimer);
    conn.batchTimer = null;
  }
}

function wirePortEvents(conn: ManagedSerialPort, win: BrowserWindow): void {
  const { port, config } = conn;

  port.on('data', (chunk: Buffer) => {
    if (storageFilter.shouldStore(config.id, chunk)) {
      storageFilter.storeData(chunk);
      return;
    }
    for (let i = 0; i < chunk.length; i++) {
      conn.batchBuffer.push(chunk[i] as number);
    }
    scheduleBatchFlush(conn, win);
  });

  port.on('close', () => {
    cleanupConnection(conn);
    connections.delete(config.id);
    // Only push disconnected event for unexpected closes (device unplug, etc.)
    // User-initiated disconnect returns the event directly from the handler
    if (!intentionalDisconnect.has(config.id)) {
      emitToRenderer(win, {
        kind: 'disconnected',
        connectionId: config.id,
        occurredAt: now(),
      });
    }
    intentionalDisconnect.delete(config.id);
  });

  port.on('error', (err: Error) => {
    emitToRenderer(win, {
      kind: 'error',
      connectionId: config.id,
      occurredAt: now(),
      error: { kind: 'resource-unavailable', message: err.message, recoverable: true },
    });
  });
}

// --- IPC Handlers ---

async function handleEnumerateSerialPorts(): Promise<SerialPortCandidate[]> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    pnpId: p.pnpId,
    vendorId: p.vendorId,
    productId: p.productId,
  }));
}

async function handleSerialConnect(
  config: SerialConnectConfig,
  win: BrowserWindow,
): Promise<TransportCommandResult> {
  if (connections.has(config.id)) {
    return {
      ok: false,
      events: [],
      error: { kind: 'invalid-config', message: `Connection already open: ${config.id}`, recoverable: true },
    };
  }

  return new Promise<TransportCommandResult>((resolve) => {
    let settled = false;

    const port = new SerialPort({
      path: config.portPath,
      baudRate: config.baudRate,
      autoOpen: false,
    });

    const conn: ManagedSerialPort = {
      port,
      config,
      batchBuffer: [],
      batchTimer: null,
    };

    port.on('open', () => {
      if (settled) return;
      settled = true;
      connections.set(config.id, conn);
      wirePortEvents(conn, win);

      const connectedEvent: TransportBridgeEvent = {
        kind: 'connected',
        connectionId: config.id,
        occurredAt: now(),
        target: {
          targetId: `serial:${config.portPath}`,
          label: config.portPath,
          role: 'serial-port',
          kind: 'serial',
          routeLabel: `${config.portPath}@${config.baudRate}`,
        },
      };
      emitToRenderer(win, connectedEvent);
      resolve({ ok: true, events: [connectedEvent] });
    });

    port.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        events: [],
        error: toError(err),
      });
    });

    port.open((err?: Error | null) => {
      if (err && !settled) {
        settled = true;
        resolve({
          ok: false,
          events: [],
          error: toError(err),
        });
      }
    });
  });
}

async function handleSerialDisconnect(connectionId: string): Promise<TransportCommandResult> {
  const conn = connections.get(connectionId);
  if (!conn) {
    return {
      ok: true,
      events: [{ kind: 'disconnected', connectionId, occurredAt: now() }],
    };
  }

  intentionalDisconnect.add(connectionId);
  cleanupConnection(conn);

  return new Promise<TransportCommandResult>((resolve) => {
    conn.port.close((err?: Error | null) => {
      if (err) {
        connections.delete(connectionId);
      }
      // close event handler cleans up; we return the result directly
      resolve({
        ok: true,
        events: [{ kind: 'disconnected', connectionId, occurredAt: now() }],
      });
    });
  });
}

async function handleSerialWrite(
  connectionId: string,
  bytes: number[],
): Promise<TransportCommandResult> {
  const conn = connections.get(connectionId);
  if (!conn) {
    return {
      ok: false,
      events: [],
      error: {
        kind: 'resource-unavailable',
        message: `Connection is not open: ${connectionId}`,
        recoverable: true,
      },
    };
  }

  return new Promise<TransportCommandResult>((resolve) => {
    const buf = Buffer.from(bytes);
    conn.port.write(buf, (writeErr?: Error | null) => {
      if (writeErr) {
        resolve({
          ok: false,
          events: [],
          error: { kind: 'write-failed', message: writeErr.message, recoverable: true },
        });
        return;
      }
      conn.port.drain(() => {
        resolve({ ok: true, events: [] });
      });
    });
  });
}

async function handleCleanup(): Promise<TransportCommandResult> {
  const events: TransportBridgeEvent[] = [];
  const ids = Array.from(connections.keys());

  for (const id of ids) {
    const conn = connections.get(id)!;
    intentionalDisconnect.add(id);
    cleanupConnection(conn);
    try {
      conn.port.close();
    } catch {
      // ignore close errors during cleanup
    }
    connections.delete(id);
    events.push({ kind: 'disconnected', connectionId: id, occurredAt: now() });
  }

  eventQueue = [];
  return { ok: true, events };
}

// --- Registration ---

export function registerSerialHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_ENUMERATE, () => handleEnumerateSerialPorts());
  ipcMain.handle(IPC_CONNECT, (_e, config: SerialConnectConfig) =>
    handleSerialConnect(config, mainWindow),
  );
  ipcMain.handle(IPC_DISCONNECT, (_e, connectionId: string) =>
    handleSerialDisconnect(connectionId),
  );
  ipcMain.handle(IPC_WRITE, (_e, connectionId: string, bytes: number[]) =>
    handleSerialWrite(connectionId, bytes),
  );
  ipcMain.handle(IPC_CLEANUP, () => handleCleanup());
}

export function cleanupSerialHandlers(): void {
  for (const conn of connections.values()) {
    cleanupConnection(conn);
    try {
      conn.port.close();
    } catch {
      // ignore
    }
  }
  connections = new Map();
  eventQueue = [];
  intentionalDisconnect.clear();
}

export function configureBatch(config: Partial<BatchConfig>): void {
  batchConfig = { ...batchConfig, ...config };
}
