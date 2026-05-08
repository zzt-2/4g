import type { TransportTargetSnapshot } from '@/features/connection';
import type { SendTargetResolver, SendTransportWriteOutcome, SendTransportWriter } from './ports';

export interface FakeConnectionWriterOptions {
  readonly targets?: readonly TransportTargetSnapshot[];
  readonly defaultWriteOutcome?: SendTransportWriteOutcome;
}

export interface RecordedWrite {
  readonly connectionId: string;
  readonly bytes: readonly number[];
}

export function createFakeConnectionWriter(
  options: FakeConnectionWriterOptions = {},
): SendTargetResolver & SendTransportWriter & { readonly recordedWrites: readonly RecordedWrite[] } {
  const targets = new Map<string, TransportTargetSnapshot>();
  for (const t of options.targets ?? []) {
    targets.set(t.targetId, t);
  }

  const recordedWrites: RecordedWrite[] = [];
  const defaultOutcome = options.defaultWriteOutcome ?? { ok: true, bytesWritten: 0 };

  return {
    get recordedWrites() {
      return recordedWrites;
    },

    resolveTarget(targetId: string) {
      return targets.get(targetId);
    },

    async writeBytes(connectionId: string, bytes: readonly number[]): Promise<SendTransportWriteOutcome> {
      recordedWrites.push({ connectionId, bytes: [...bytes] });
      return { ...defaultOutcome, bytesWritten: bytes.length };
    },
  };
}

export function createFailingWriter(errorKind: string, errorMessage: string): SendTransportWriter {
  return {
    async writeBytes(): Promise<SendTransportWriteOutcome> {
      return { ok: false, bytesWritten: 0, error: { kind: errorKind, message: errorMessage } };
    },
  };
}
