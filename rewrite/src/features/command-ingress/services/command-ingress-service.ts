import type { TaskService } from '@/features/task';
import type { SendService } from '@/features/send';
import type { ConnectionService, ConnectionStateSnapshot } from '@/features/connection';
import type { FrameAssetReader } from '@/features/frame';
import type { ProtocolAdapter } from '../core/protocol-adapter';
import type { CommandContext, CommandHandler, CommandResult } from '../core/handler';
import type { ScoeCommandFunction, SatelliteConfig, ScoeStatisticsSnapshot, ScoeRuntimeStatus } from '../core/types';
import type { CommandIngressStateReader, CommandIngressStateWriter } from '../core/state';
import type { ScoeProtocolAdapterOptions } from '../adapters/scoe-protocol-adapter';
import type { CommandLogEntry } from '../core/command-log';
import type { DataRecorder } from './data-recorder';
import { dispatchCommand } from '../core/handler';
import { createScoeProtocolAdapter } from '../adapters/scoe-protocol-adapter';
import { hexToBytes } from '../core/utils';
import { createHandleLoadSatelliteId } from '../handlers/handle-load';
import { handleUnloadSatelliteId } from '../handlers/handle-unload';
import { handleHealthCheck } from '../handlers/handle-health-check';
import { handleLinkCheck } from '../handlers/handle-link-check';
import { handleSendFrame } from '../handlers/handle-send-frame';
import { handleReadFileAndSend } from '../handlers/handle-read-file-and-send';
import { sendAckFrame } from '../handlers/send-ack-frame';
import { createCommandLogRecorder } from '../core/command-log';
import { createDataRecorder } from './data-recorder';

export interface CommandIngressServiceOptions {
  readonly globalConfig: ScoeProtocolAdapterOptions['globalConfig'];
  readonly commandConfigs: ScoeProtocolAdapterOptions['commandConfigs'];
  readonly satelliteConfigs: readonly SatelliteConfig[];
  readonly taskService: TaskService;
  readonly sendService: SendService;
  readonly frameReader: FrameAssetReader;
  readonly connectionService: ConnectionService;
  readonly connectionSnapshot: () => ConnectionStateSnapshot;
  readonly receiveSnapshot: () => unknown;
  readonly platformFileReader: (path: string) => Promise<string[]>;
  readonly stateReader: CommandIngressStateReader;
  readonly stateWriter: CommandIngressStateWriter;
}

export interface CommandIngressService {
  readonly adapter: ProtocolAdapter;
  loadSatellite(satelliteId: string): Promise<CommandResult>;
  unloadSatellite(): Promise<CommandResult>;
  getScoeStatistics(): ScoeStatisticsSnapshot;
  getScoeRuntimeStatus(): ScoeRuntimeStatus;
  getLoadedSatelliteId(): string;
  isScoeFramesLoaded(): boolean;
  getCommandLog(): readonly CommandLogEntry[];
  clearCommandLog(): void;
  getTestDataRecorder(): DataRecorder;
  sendTestData(hex: string, connectionId: string): Promise<void>;
  dispose(): void;
}

export function createCommandIngressService(
  options: CommandIngressServiceOptions,
): CommandIngressService {
  const {
    satelliteConfigs,
    taskService,
    sendService,
    frameReader,
    connectionService,
    connectionSnapshot,
    receiveSnapshot,
    platformFileReader,
    stateReader,
    stateWriter,
  } = options;

  // Tracking: connectionId → taskInstanceIds
  const trackingMap = new Map<string, Set<string>>();

  // C1: Command log recorder
  const logRecorder = createCommandLogRecorder();

  // C2: Test data recorder
  const testDataRecorder = createDataRecorder();

  // Handler map
  const handlerMap = new Map<ScoeCommandFunction, CommandHandler>([
    ['load_satellite_id', createHandleLoadSatelliteId(satelliteConfigs)],
    ['unload_satellite_id', handleUnloadSatelliteId],
    ['health_check', handleHealthCheck],
    ['link_check', handleLinkCheck],
    ['send_frame', handleSendFrame],
    ['read_file_and_send', handleReadFileAndSend],
  ]);

  const ctx: CommandContext = {
    taskService,
    sendService,
    frameReader,
    connectionService,
    connectionSnapshot,
    receiveSnapshot,
    platformFileReader,
    stateReader,
    stateWriter,
  };

  // onCommand: dispatch parsed commands, track tasks, monitor settlement
  async function onCommand(parsed: Parameters<typeof dispatchCommand>[0]): Promise<void> {
    stateWriter.updateStatus({ lastCommandCode: parsed.commandCode });

    const logEntry = logRecorder.record({
      timestamp: new Date().toISOString(),
      commandCode: parsed.commandCode,
      result: 'pending',
    });

    const result = await dispatchCommand(parsed, handlerMap, ctx);

    if (result.taskId) {
      trackTask(parsed.connectionId, result.taskId, parsed, logEntry.id);
    } else {
      logRecorder.complete(logEntry.id, {
        result: result.success ? 'success' : 'error',
        error: result.error,
      });
    }

    cleanupDisconnectedConnections();
  }

  // Create protocol adapter with onCommand dispatch
  const adapter = createScoeProtocolAdapter({
    globalConfig: options.globalConfig,
    commandConfigs: options.commandConfigs,
    stateReader,
    onCommand,
    onConsume: (bytes) => testDataRecorder.record(bytes),
  });

  // Start status timer (inlined from status-timer.ts)
  const timerHandle = setInterval(() => {
    stateWriter.tickSecond();
  }, 1000);

  function trackTask(
    connectionId: string,
    taskId: string,
    command: Parameters<typeof dispatchCommand>[0],
    logEntryId: string,
  ): void {
    let set = trackingMap.get(connectionId);
    if (!set) {
      set = new Set();
      trackingMap.set(connectionId, set);
    }
    set.add(taskId);

    // Single consolidated settlement monitor: cleanup tracking + ack frame + counters
    taskService.onSettled(taskId)
      .then(async () => {
        const inst = taskService.getInstance(taskId);
        if (inst?.lifecycle === 'completed') {
          try {
            await sendAckFrame(command, ctx);
          } catch (err) {
            // Ack frame send failure — don't crash, just count as error
            console.warn('Ack frame send failed', err);
          }
          stateWriter.incrementSuccessCount();
          logRecorder.complete(logEntryId, {
            result: 'success',
            durationMs: inst.completedAt && inst.startedAt
              ? new Date(inst.completedAt).getTime() - new Date(inst.startedAt).getTime()
              : undefined,
          });
        } else {
          stateWriter.incrementErrorCount(inst?.error ?? 'task failed');
          logRecorder.complete(logEntryId, {
            result: 'error',
            error: inst?.error ?? 'task failed',
          });
        }

        // Re-lookup Set from trackingMap (avoids stale closure reference)
        const current = trackingMap.get(connectionId);
        if (!current) return;
        current.delete(taskId);
        if (current.size === 0) {
          trackingMap.delete(connectionId);
        }
      })
      .catch((err) => {
        stateWriter.incrementErrorCount(
          err instanceof Error ? err.message : 'settlement tracking failed',
        );
        // Still cleanup tracking
        const current = trackingMap.get(connectionId);
        if (current) {
          current.delete(taskId);
          if (current.size === 0) trackingMap.delete(connectionId);
        }
      });
  }

  function cleanupDisconnectedConnections(): void {
    for (const [connId, taskIds] of trackingMap) {
      const fact = connectionService.getConnectionFact(connId);
      if (!fact || fact.lifecycle === 'disconnected') {
        for (const taskId of taskIds) {
          try {
            taskService.stopTask(taskId);
          } catch (err) {
            // Task may already be settled
            console.warn('Failed to stop task during cleanup', taskId, err);
          }
        }
        trackingMap.delete(connId);
      }
    }
  }

  function dispose(): void {
    clearInterval(timerHandle);
    for (const [, taskIds] of trackingMap) {
      for (const taskId of taskIds) {
        try {
          taskService.stopTask(taskId);
        } catch (err) {
          // Ignore errors during cleanup
          console.warn('Failed to stop task during dispose', taskId, err);
        }
      }
    }
    trackingMap.clear();
  }

  // CI-R2: delegate loadSatellite to handler logic
  async function loadSatellite(satelliteId: string): Promise<CommandResult> {
    if (stateReader.loadedSatelliteId !== '') {
      return { success: false, error: 'Satellite already loaded' };
    }
    const satConfig = satelliteConfigs.find((s) => s.satelliteId === satelliteId);
    if (!satConfig) {
      return { success: false, error: `Unknown satellite ID: ${satelliteId}` };
    }
    stateWriter.setLoaded(satelliteId, satConfig.commandConfigs);
    return { success: true };
  }

  async function unloadSatellite(): Promise<CommandResult> {
    if (!stateReader.scoeFramesLoaded) {
      return { success: false, error: 'No satellite loaded' };
    }
    stateWriter.resetRuntimeState();
    return { success: true };
  }

  // CI-R5: Reader methods replacing deleted selectors
  function getScoeStatistics(): ScoeStatisticsSnapshot {
    const s = stateReader.getSnapshot();
    return {
      commandReceiveCount: s.commandReceiveCount,
      commandSuccessCount: s.commandSuccessCount,
      commandErrorCount: s.commandErrorCount,
      runtimeSeconds: s.runtimeSeconds,
      satelliteIdRuntimeSeconds: s.satelliteIdRuntimeSeconds,
      lastErrorReason: s.lastErrorReason,
    };
  }

  function getScoeRuntimeStatus(): ScoeRuntimeStatus {
    const s = stateReader.getSnapshot();
    return {
      loadedSatelliteId: s.loadedSatelliteId,
      scoeFramesLoaded: s.scoeFramesLoaded,
      healthStatus: s.healthStatus,
      linkTestResult: s.linkTestResult,
      lastCommandCode: s.lastCommandCode,
      receiveCommandSuccess: s.receiveCommandSuccess,
    };
  }

  function getLoadedSatelliteId(): string {
    return stateReader.loadedSatelliteId;
  }

  function isScoeFramesLoaded(): boolean {
    return stateReader.scoeFramesLoaded;
  }

  function getCommandLog(): readonly CommandLogEntry[] {
    return logRecorder.getAll();
  }

  function clearCommandLog(): void {
    logRecorder.clear();
  }

  function getTestDataRecorder(): DataRecorder {
    return testDataRecorder;
  }

  async function sendTestData(hex: string, connectionId: string): Promise<void> {
    const bytes = hexToBytes(hex);
    await connectionService.write({ connectionId, bytes });
  }

  return {
    adapter,
    loadSatellite,
    unloadSatellite,
    getScoeStatistics,
    getScoeRuntimeStatus,
    getLoadedSatelliteId,
    isScoeFramesLoaded,
    getCommandLog,
    clearCommandLog,
    getTestDataRecorder,
    sendTestData,
    dispose,
  };
}

