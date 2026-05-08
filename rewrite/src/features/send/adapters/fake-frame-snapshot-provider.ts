import type { ReadonlyFrameAsset } from '@/features/frame';
import type { SendFrameReader } from './ports';

export interface FakeFrameProviderOptions {
  readonly frames?: readonly ReadonlyFrameAsset[];
}

export function createFakeFrameProvider(options: FakeFrameProviderOptions = {}): SendFrameReader {
  const frames = new Map<string, ReadonlyFrameAsset>();
  for (const frame of options.frames ?? []) {
    frames.set(frame.id, frame);
  }

  return {
    getFrame(frameId: string) {
      return frames.get(frameId);
    },
  };
}
