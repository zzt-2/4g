import type { ReadonlyFrameAsset } from '@/features/frame';
import type { TransportTargetSnapshot } from '@/features/connection';
import type { SendResult } from '../core';

export interface SendFrameReader {
  getFrame(frameId: string): ReadonlyFrameAsset | undefined;
}

export interface SendTargetResolver {
  resolveTarget(targetId: string): TransportTargetSnapshot | undefined;
}

export interface SendTransportWriteOutcome {
  readonly ok: boolean;
  readonly bytesWritten: number;
  readonly error?: { readonly kind: string; readonly message: string };
}

export interface SendTransportWriter {
  writeBytes(connectionId: string, bytes: readonly number[]): Promise<SendTransportWriteOutcome>;
}

export interface SendResultEmitter {
  emit(result: SendResult): void;
}

export interface SendVariableProvider {
  getVariables(): Map<string, number | string | boolean>;
}

export const NOOP_VARIABLE_PROVIDER: SendVariableProvider = {
  getVariables: () => new Map(),
};
