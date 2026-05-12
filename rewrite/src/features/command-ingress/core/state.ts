import type { ScoeGlobalConfig, ScoeCommandConfig, HealthStatus, LinkTestResult } from './types';

// --- State ---

export interface CommandIngressState {
  readonly commandReceiveCount: number;
  readonly commandSuccessCount: number;
  readonly commandErrorCount: number;

  readonly loadedSatelliteId: string;
  readonly scoeFramesLoaded: boolean;
  readonly healthStatus: HealthStatus;
  readonly linkTestResult: LinkTestResult;
  readonly lastCommandCode: string;
  readonly receiveCommandSuccess: boolean;

  readonly runtimeSeconds: number;
  readonly satelliteIdRuntimeSeconds: number;
  readonly lastErrorReason: string;

  readonly globalConfig: ScoeGlobalConfig;
  readonly activeCommandConfigs: readonly ScoeCommandConfig[];
}

// --- Reader ---

export interface CommandIngressStateReader {
  getSnapshot(): CommandIngressState;
  globalConfig(): ScoeGlobalConfig;
  readonly loadedSatelliteId: string;
  readonly scoeFramesLoaded: boolean;
}

// --- Writer ---

export interface CommandIngressStateWriter {
  setLoaded(satelliteId: string, configs: readonly ScoeCommandConfig[]): void;
  resetRuntimeState(): void;
  updateStatus(patch: Partial<Omit<CommandIngressState, 'globalConfig' | 'activeCommandConfigs'>>): void;
  incrementReceiveCount(): void;
  incrementSuccessCount(): void;
  incrementErrorCount(reason: string): void;
  tickSecond(): void;
}

// --- Factory ---

export interface CommandIngressStateContainer {
  readonly reader: CommandIngressStateReader;
  readonly writer: CommandIngressStateWriter;
}

export function createCommandIngressState(
  globalConfig: ScoeGlobalConfig,
): CommandIngressStateContainer {
  let state: CommandIngressState = {
    commandReceiveCount: 0,
    commandSuccessCount: 0,
    commandErrorCount: 0,
    loadedSatelliteId: '',
    scoeFramesLoaded: false,
    healthStatus: 'unknown',
    linkTestResult: 'unknown',
    lastCommandCode: '',
    receiveCommandSuccess: false,
    runtimeSeconds: 0,
    satelliteIdRuntimeSeconds: 0,
    lastErrorReason: '',
    globalConfig,
    activeCommandConfigs: [],
  };

  const reader: CommandIngressStateReader = {
    getSnapshot() {
      return structuredClone(state);
    },
    globalConfig() {
      return state.globalConfig;
    },
    get loadedSatelliteId() {
      return state.loadedSatelliteId;
    },
    get scoeFramesLoaded() {
      return state.scoeFramesLoaded;
    },
  };

  const writer: CommandIngressStateWriter = {
    setLoaded(satelliteId, configs) {
      state = {
        ...state,
        loadedSatelliteId: satelliteId,
        scoeFramesLoaded: true,
        satelliteIdRuntimeSeconds: 0,
        activeCommandConfigs: [...configs],
      };
    },

    resetRuntimeState() {
      state = {
        ...state,
        scoeFramesLoaded: false,
        loadedSatelliteId: '',
        satelliteIdRuntimeSeconds: 0,
        commandReceiveCount: 0,
        commandSuccessCount: 0,
        commandErrorCount: 0,
        healthStatus: 'unknown',
        linkTestResult: 'unknown',
        receiveCommandSuccess: false,
        lastCommandCode: '',
        lastErrorReason: '',
        activeCommandConfigs: [],
      };
    },

    updateStatus(patch) {
      state = { ...state, ...patch };
    },

    incrementReceiveCount() {
      state = {
        ...state,
        commandReceiveCount: state.commandReceiveCount + 1,
      };
    },

    incrementSuccessCount() {
      state = {
        ...state,
        commandSuccessCount: state.commandSuccessCount + 1,
        receiveCommandSuccess: true,
      };
    },

    incrementErrorCount(reason) {
      state = {
        ...state,
        commandErrorCount: state.commandErrorCount + 1,
        lastErrorReason: reason,
        receiveCommandSuccess: false,
      };
    },

    tickSecond() {
      let next = {
        ...state,
        runtimeSeconds: state.runtimeSeconds + 1,
        receiveCommandSuccess: false,
      };

      if (!next.scoeFramesLoaded) {
        next = {
          ...next,
          commandReceiveCount: 0,
          commandSuccessCount: 0,
          commandErrorCount: 0,
          healthStatus: 'unknown',
          linkTestResult: 'unknown',
        };
      } else {
        next = {
          ...next,
          satelliteIdRuntimeSeconds: next.satelliteIdRuntimeSeconds + 1,
        };
      }

      state = next;
    },
  };

  return { reader, writer };
}
