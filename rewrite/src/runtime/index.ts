import {
  type FrameAssetReader,
} from '@/features/frame';
import {
  type SettingsOperationResult,
  type SettingsResetScope,
  type SettingsService,
} from '@/features/settings';
import {
  type StorageLocalReader,
} from '@/features/storage-local-baseline';
import {
  type ConnectionTransportAdapter,
} from '@/features/connection';
import { wireFeatures, type RewriteWiredFeatures } from './feature-wiring';
import { routingTick, type RoutingTickResult } from './routing-tick';
import { createNoOpPersistence, type FeaturePersistence } from './persistence';

export type { RoutingTickResult } from './routing-tick';
export type { RewriteWiredFeatures } from './feature-wiring';
export type { FeaturePersistence } from './persistence';

export interface RewriteRuntimeOverviewSnapshot {
  readonly frame: {
    readonly totalFrames: number;
    readonly totalFields: number;
    readonly selectedFrameName: string | null;
  };
  readonly settings: {
    readonly autoStartRecording: boolean;
    readonly csvDefaultOutputPath: string;
    readonly csvSaveIntervalMinutes: number;
  };
  readonly storage: {
    readonly localRecordCount: number;
    readonly historyHourCount: number;
    readonly csvMaterialCount: number;
    readonly legacyMaterialCount: number;
    readonly lastIssue: {
      readonly code: string;
      readonly message: string;
    } | null;
  };
}

export interface RewriteRuntimeCommandResult {
  readonly ok: boolean;
  readonly issues: readonly {
    readonly severity: string;
    readonly code: string;
    readonly message: string;
  }[];
}

type FrameOverviewPort = Pick<FrameAssetReader, 'getSelectedFrame' | 'listFrames'>;
type SettingsOverviewPort = Pick<SettingsService, 'getRecordingSettings' | 'reset'>;
type StorageOverviewPort = Pick<
  StorageLocalReader,
  | 'getLastIssue'
  | 'listCsvMaterials'
  | 'listHistoryHours'
  | 'listLegacyMaterials'
  | 'listLocalRecords'
>;

export const ROUTING_TICK_DEFAULT_INTERVAL_MS = 100;

export interface RewriteRuntimeDependencies {
  readonly connectionAdapter?: ConnectionTransportAdapter;
  readonly frameReader?: FrameOverviewPort;
  readonly settingsService?: SettingsOverviewPort;
  readonly storageReader?: StorageOverviewPort;
}

export interface RewriteRuntime {
  getOverviewSnapshot(): RewriteRuntimeOverviewSnapshot;
  resetSettings(scope?: SettingsResetScope): RewriteRuntimeCommandResult;
  readonly features: RewriteWiredFeatures;
  readonly persistence: FeaturePersistence;
  routingTick(): Promise<RoutingTickResult>;
  startTickDriver(intervalMs?: number): void;
  stopTickDriver(): void;
  readonly isTickDriverRunning: boolean;
  destroy(): void;
}

function createNoOpConnectionAdapter(): ConnectionTransportAdapter {
  const accepted = { ok: true as const, events: [] as const };
  return {
    connect: async () => accepted,
    disconnect: async () => accepted,
    write: async () => accepted,
    cleanup: async () => accepted,
    drainEvents: async () => [] as const,
  };
}

function toRuntimeCommandResult(result: SettingsOperationResult): RewriteRuntimeCommandResult {
  return {
    ok: result.ok,
    issues: result.validation.issues.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })),
  };
}

export function createRewriteRuntime(
  dependencies: RewriteRuntimeDependencies = {},
  persistence?: FeaturePersistence,
): RewriteRuntime {
  const adapter = dependencies.connectionAdapter ?? createNoOpConnectionAdapter();
  const wiredFeatures = wireFeatures({ connectionAdapter: adapter });

  const frameReader = dependencies.frameReader ?? wiredFeatures.frameReader;
  const settingsService = dependencies.settingsService ?? wiredFeatures.settingsService;
  const storageReader = dependencies.storageReader ?? wiredFeatures.storageReader;

  let destroyed = false;
  let tickIntervalId: ReturnType<typeof setInterval> | null = null;

  function stopTick(): void {
    if (tickIntervalId !== null) {
      clearInterval(tickIntervalId);
      tickIntervalId = null;
    }
  }

  return {
    features: wiredFeatures,
    persistence: persistence ?? createNoOpPersistence(),

    getOverviewSnapshot() {
      const frameSummaries = frameReader.listFrames();
      const selectedFrame = frameReader.getSelectedFrame();
      const recordingSettings = settingsService.getRecordingSettings();
      const storageIssue = storageReader.getLastIssue();

      return {
        frame: {
          totalFrames: frameSummaries.length,
          totalFields: frameSummaries.reduce((sum, frame) => sum + frame.fieldCount, 0),
          selectedFrameName: selectedFrame?.name ?? null,
        },
        settings: {
          autoStartRecording: recordingSettings.autoStartRecording,
          csvDefaultOutputPath: recordingSettings.csvDefaultOutputPath,
          csvSaveIntervalMinutes: recordingSettings.csvSaveIntervalMinutes,
        },
        storage: {
          localRecordCount: storageReader.listLocalRecords().length,
          historyHourCount: storageReader.listHistoryHours().length,
          csvMaterialCount: storageReader.listCsvMaterials().length,
          legacyMaterialCount: storageReader.listLegacyMaterials().length,
          lastIssue: storageIssue
            ? {
                code: storageIssue.code,
                message: storageIssue.message,
              }
            : null,
        },
      };
    },

    resetSettings(scope = 'all') {
      return toRuntimeCommandResult(settingsService.reset(scope));
    },

    routingTick() {
      return routingTick(wiredFeatures);
    },

    startTickDriver(intervalMs = ROUTING_TICK_DEFAULT_INTERVAL_MS) {
      if (tickIntervalId !== null || destroyed) return;
      // 并发保护（D013）：setInterval 不等 async 回调完成就触发下一次，单次 tick 一旦
      // 超过 intervalMs（如 display fan-out 重），下一 tick 照样起，并发 tick 各自抢
      // 主线程 → 雪崩冻屏。用 in-flight flag 拦：上一 tick 未完成则跳过本次触发。
      // 代价：tick 实际节奏可能慢于 intervalMs（被慢 tick 拖），但接受——绝不并发。
      let tickInFlight = false;
      tickIntervalId = setInterval(() => {
        if (tickInFlight || destroyed) return;
        tickInFlight = true;
        routingTick(wiredFeatures)
          .catch((err) => console.error('[routingTick]', err))
          .finally(() => { tickInFlight = false; });
      }, intervalMs);
    },

    stopTickDriver() {
      stopTick();
    },

    get isTickDriverRunning() {
      return tickIntervalId !== null;
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTick();
      // routingTick 不再写 storage records（D013），destroy 无需 flush。
      void wiredFeatures.northboundService.stop();
      void wiredFeatures.highSpeedStorageService.deactivate();
      // H014/S012:销毁时停止录制(flush 写盘流 + 关文件)。best-effort,失败不阻塞 teardown。
      void wiredFeatures.recordingService.stop().catch(() => { /* teardown best-effort */ });
      wiredFeatures.commandIngressService.dispose();
      wiredFeatures.connectionService.cleanup();
      wiredFeatures.receiveEventSourceBridge.clear();
    },
  };
}

