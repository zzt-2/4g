import type { SendRequest, SendResult } from '@/features/send';
import type { SendServiceProvider } from './ports';

export interface FakeSendServiceOptions {
  readonly results?: readonly SendResult[];
  readonly delayMs?: number;
}

export interface RecordedCall {
  readonly request: SendRequest;
  readonly index: number;
}

function defaultSentResult(): SendResult {
  return {
    kind: 'sent',
    requestRef: { frameId: 'frame-1', targetId: 'target-1', context: { source: 'task' } },
    bytesBuilt: 10,
    bytesSent: 10,
    timestamp: '2026-05-06T12:00:00.000Z',
    buildIssues: [],
  };
}

export function createFakeSendService(
  options: FakeSendServiceOptions = {},
): SendServiceProvider & { readonly calls: readonly RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const results = options.results ?? [defaultSentResult()];
  const delayMs = options.delayMs ?? 0;
  let callIndex = 0;

  return {
    get calls() {
      return calls;
    },

    async execute(request: SendRequest): Promise<SendResult> {
      const index = callIndex;
      calls.push({ request, index });
      callIndex++;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      const result = index < results.length ? results[index] : results[results.length - 1];
      return { ...result };
    },
  };
}

export function createFailingSendService(
  errorKind: string,
  errorMessage: string,
): SendServiceProvider {
  return {
    async execute(request: SendRequest): Promise<SendResult> {
      return {
        kind: 'transport-error',
        requestRef: {
          frameId: request.frameId,
          targetId: request.targetId,
          context: { ...request.context },
        },
        bytesBuilt: 0,
        bytesSent: 0,
        timestamp: new Date().toISOString(),
        error: { kind: errorKind, message: errorMessage },
        buildIssues: [],
      };
    },
  };
}
