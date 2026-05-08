import {
  cloneDisplaySnapshot,
  createDefaultDisplaySnapshot,
  type ReadonlyDisplaySnapshot,
  type DisplaySnapshot,
} from '../core';

export interface DisplayStateInitialValue {
  readonly snapshot?: ReadonlyDisplaySnapshot;
}

export interface DisplayStateContainer {
  getSnapshot(): DisplaySnapshot;
  replaceSnapshot(snapshot: ReadonlyDisplaySnapshot): DisplaySnapshot;
  resetSnapshot(snapshot?: ReadonlyDisplaySnapshot): DisplaySnapshot;
}

export function createDisplayState(
  initialValue: DisplayStateInitialValue = {},
): DisplayStateContainer {
  let snapshot = initialValue.snapshot
    ? cloneDisplaySnapshot(initialValue.snapshot)
    : createDefaultDisplaySnapshot();

  return {
    getSnapshot() {
      return cloneDisplaySnapshot(snapshot);
    },

    replaceSnapshot(nextSnapshot) {
      snapshot = cloneDisplaySnapshot(nextSnapshot);
      return cloneDisplaySnapshot(snapshot);
    },

    resetSnapshot(nextSnapshot = createDefaultDisplaySnapshot()) {
      snapshot = cloneDisplaySnapshot(nextSnapshot);
      return cloneDisplaySnapshot(snapshot);
    },
  };
}
