import type { SendRequest, SendResult } from '@/features/send';
import type { ReadonlyFrameAsset } from '@/features/frame';
import type { ConditionMatchInput } from '../core';

export interface SendServiceProvider {
  execute(request: SendRequest): Promise<SendResult>;
}

export interface ReceiveEventSource {
  subscribe(handler: (input: ConditionMatchInput) => void): () => void;
}

export interface FrameReader {
  getFrameAsset(id: string): ReadonlyFrameAsset | undefined;
}
