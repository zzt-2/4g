import { defaultNow } from '@/shared';
import type {
  ReceiveInputBatch,
  ReceiveInputError,
  ReceiveSourceSnapshot,
} from '../core';
import {
  cloneInputBatch,
  cloneInputError,
  cloneSource,
} from '../core/clone';
import type {
  ReceiveInputEvent,
  ReceiveInputSource,
} from '../services';

export interface FakeReceiveBytePush {
  readonly bytes: readonly number[];
  readonly source: ReceiveSourceSnapshot;
  readonly id?: string;
  readonly sequence?: number;
  readonly referenceVersion?: number;
  readonly receivedAt?: string;
}

export interface CreateFakeReceiveInputSourceOptions {
  readonly now?: () => string;
  readonly events?: readonly ReceiveInputEvent[];
}

export interface FakeReceiveInputSource extends ReceiveInputSource {
  pushBatch(batch: ReceiveInputBatch): void;
  pushBytes(input: FakeReceiveBytePush): ReceiveInputBatch;
  pushError(error: ReceiveInputError): void;
  clear(): void;
  readQueuedEvents(): ReceiveInputEvent[];
}


function cloneInputEvent(event: ReceiveInputEvent): ReceiveInputEvent {
  return event.kind === 'batch'
    ? {
        kind: 'batch',
        batch: cloneInputBatch(event.batch),
      }
    : {
        kind: 'error',
        error: cloneInputError(event.error),
      };
}

export function createFakeReceiveInputSource(
  options: CreateFakeReceiveInputSourceOptions = {},
): FakeReceiveInputSource {
  const now = options.now ?? defaultNow;
  const eventQueue = [...(options.events ?? [])].map(cloneInputEvent);
  let sequence = 0;

  function pushBatch(batch: ReceiveInputBatch): void {
    eventQueue.push({
      kind: 'batch',
      batch: cloneInputBatch(batch),
    });
  }

  return {
    async drainEvents(): Promise<readonly ReceiveInputEvent[]> {
      return eventQueue.splice(0, eventQueue.length).map(cloneInputEvent);
    },

    pushBatch,

    pushBytes(input) {
      sequence += 1;
      const batch: ReceiveInputBatch = {
        id: input.id ?? `fake-receive-${sequence}`,
        bytes: [...input.bytes],
        source: cloneSource(input.source),
        receivedAt: input.receivedAt ?? now(),
        sequence: input.sequence ?? sequence,
        ...(input.referenceVersion !== undefined
          ? { referenceVersion: input.referenceVersion }
          : {}),
      };
      pushBatch(batch);
      return cloneInputBatch(batch);
    },

    pushError(error) {
      eventQueue.push({
        kind: 'error',
        error: cloneInputError(error),
      });
    },

    clear() {
      eventQueue.splice(0, eventQueue.length);
    },

    readQueuedEvents() {
      return eventQueue.map(cloneInputEvent);
    },
  };
}
