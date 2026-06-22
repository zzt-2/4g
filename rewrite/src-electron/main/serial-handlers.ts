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
  frameBuffer: number[]; // FIXME: TEMPORARY sticky packet patch
}

// FIXME: TEMPORARY sticky packet patch — delete once FPGA handles framing.
// 串口和 TCP 共用同一套帧格式(同步字 0x1ACFFC1D)。FPGA 端尚未做帧定界时,
// 串口侧也会粘包(一个 'data' 事件里可能含多帧或半帧),这里做客户端拆帧。
// 逻辑与 network-handlers.ts 的 TCP 拆帧保持一致,避免两路径行为漂移。
const SYNC_WORD = [0x1A, 0xCF, 0xFC, 0x1D] as const;

function splitBySyncWord(
  frameBuffer: number[],
  chunk: Buffer,
): { frames: number[][]; remaining: number[] } {
  for (let i = 0; i < chunk.length; i++) {
    frameBuffer.push(chunk[i] as number);
  }

  const positions: number[] = [];
  for (let i = 0; i <= frameBuffer.length - 4; i++) {
    if (
      frameBuffer[i] === SYNC_WORD[0] &&
      frameBuffer[i + 1] === SYNC_WORD[1] &&
      frameBuffer[i + 2] === SYNC_WORD[2] &&
      frameBuffer[i + 3] === SYNC_WORD[3]
    ) {
      positions.push(i);
    }
  }

  if (positions.length < 2) {
    return { frames: [], remaining: frameBuffer };
  }

  const frames: number[][] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    frames.push(frameBuffer.slice(positions[i], positions[i + 1]));
  }
  return { frames, remaining: frameBuffer.slice(positions[positions.length - 1]) };
}
// END FIXME

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

// 语义层 flowControl(none/hardware/software) → serialport v13 的独立布尔 flags。
// v13 不再有单一 flowControl 字段,拆成 rtscts(硬件)/xon+xoff(软件)。
function toFlowControlFlags(flowControl?: 'none' | 'hardware' | 'software'): {
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
} {
  if (flowControl === 'hardware') return { rtscts: true };
  if (flowControl === 'software') return { xon: true, xoff: true };
  return {};
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
    // FIXME: TEMPORARY sticky packet patch — split by sync word
    // 串口和 TCP 一样会粘包:一次 'data' 可能含多帧或半帧。
    // 用同步字把流切成完整帧,每帧单独 emit,让下游 receive 管线逐帧解析。
    const { frames, remaining } = splitBySyncWord(conn.frameBuffer, chunk);
    conn.frameBuffer = remaining;
    for (const frame of frames) {
      emitToRenderer(win, {
        kind: 'data',
        connectionId: config.id,
        occurredAt: now(),
        bytes: frame,
        byteLength: frame.length,
      });
    }
    // END FIXME
  });

  port.on('close', () => {
    console.warn('[serial] port closed unexpectedly:', config.id, config.portPath);
    conn.frameBuffer = []; // FIXME: TEMPORARY sticky packet patch
    cleanupConnection(conn);
    connections.delete(config.id);
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
    console.error('[serial] port error:', config.id, config.portPath, err.message);
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
  try {
    const ports = await SerialPort.list();
    console.log('[serial] enumerated ports:', ports.length, ports.map((p: { path: string }) => p.path));
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      pnpId: p.pnpId,
      vendorId: p.vendorId,
      productId: p.productId,
    }));
  } catch (err) {
    // 不再静默吞错:return [] 会让前端把"加载失败"误判为"无设备"。
    // throw 让 ipcRenderer.invoke 的 Promise reject,错误冒泡到 renderer 的 refreshResources,
    // 在 renderer DevTools console + Notify 可见(打包后用户在目标机只能看 devtool)。
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error('[serial] enumerate failed:', detail);
    throw new Error(`串口枚举失败: ${detail}`);
  }
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
      // serialport v13:dataBits/stopBits/parity 传 undefined 时用默认 8/1/none;
      // flowControl 语义层(none/hardware/software)转布尔 flags。
      dataBits: config.dataBits,
      stopBits: config.stopBits,
      parity: config.parity,
      ...toFlowControlFlags(config.flowControl),
    });

    const conn: ManagedSerialPort = {
      port,
      config,
      batchBuffer: [],
      batchTimer: null,
      frameBuffer: [], // FIXME: TEMPORARY sticky packet patch
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
