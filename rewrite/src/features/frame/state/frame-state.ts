import {
  cloneFrameAsset,
  cloneFrameAssets,
  type FrameAsset,
  type ReadonlyFrameAsset,
} from '../core';

export interface FrameStateSnapshot {
  readonly frames: readonly ReadonlyFrameAsset[];
  readonly selectedFrameId?: string;
}

export interface FrameStateInitialValue {
  readonly frames?: readonly FrameAsset[];
  readonly selectedFrameId?: string;
}

export interface FrameStateContainer {
  getSnapshot(): FrameStateSnapshot;
  replaceFrames(frames: readonly FrameAsset[], selectedFrameId?: string): FrameStateSnapshot;
  upsertFrame(frame: FrameAsset): FrameStateSnapshot;
  removeFrame(frameId: string): FrameStateSnapshot;
  selectFrame(frameId: string | undefined): FrameStateSnapshot;
}

function hasFrame(frames: readonly FrameAsset[], frameId: string | undefined): boolean {
  return typeof frameId === 'string' && frames.some((frame) => frame.id === frameId);
}

function createSnapshot(
  frames: readonly FrameAsset[],
  selectedFrameId: string | undefined,
): FrameStateSnapshot {
  return {
    frames: cloneFrameAssets(frames),
    ...(selectedFrameId ? { selectedFrameId } : {}),
  };
}

export function createFrameState(initialValue: FrameStateInitialValue = {}): FrameStateContainer {
  let frames = cloneFrameAssets(initialValue.frames ?? []);
  let selectedFrameId = hasFrame(frames, initialValue.selectedFrameId)
    ? initialValue.selectedFrameId
    : undefined;

  return {
    getSnapshot() {
      return createSnapshot(frames, selectedFrameId);
    },

    replaceFrames(nextFrames, nextSelectedFrameId = selectedFrameId) {
      frames = cloneFrameAssets(nextFrames);
      selectedFrameId = hasFrame(frames, nextSelectedFrameId) ? nextSelectedFrameId : undefined;
      return createSnapshot(frames, selectedFrameId);
    },

    upsertFrame(frame) {
      const nextFrame = cloneFrameAsset(frame);
      const index = frames.findIndex((item) => item.id === frame.id);

      if (index === -1) {
        frames = [...frames, nextFrame];
      } else {
        frames = frames.map((item, itemIndex) => (itemIndex === index ? nextFrame : item));
      }

      return createSnapshot(frames, selectedFrameId);
    },

    removeFrame(frameId) {
      frames = frames.filter((frame) => frame.id !== frameId);
      if (selectedFrameId === frameId) {
        selectedFrameId = undefined;
      }

      return createSnapshot(frames, selectedFrameId);
    },

    selectFrame(frameId) {
      selectedFrameId = hasFrame(frames, frameId) ? frameId : undefined;
      return createSnapshot(frames, selectedFrameId);
    },
  };
}
