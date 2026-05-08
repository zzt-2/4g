import {
  cloneStatusSnapshot,
  createDefaultStatusSnapshot,
  type ReadonlyStatusSnapshot,
  type StatusSnapshot,
} from '../core';

export interface StatusStateInitialValue {
  readonly snapshot?: ReadonlyStatusSnapshot;
}

export interface StatusStateContainer {
  getSnapshot(): StatusSnapshot;
  replaceSnapshot(snapshot: ReadonlyStatusSnapshot): StatusSnapshot;
  resetSnapshot(snapshot?: ReadonlyStatusSnapshot): StatusSnapshot;
}

export function createStatusState(
  initialValue: StatusStateInitialValue = {},
): StatusStateContainer {
  let snapshot = initialValue.snapshot
    ? cloneStatusSnapshot(initialValue.snapshot)
    : createDefaultStatusSnapshot();

  return {
    getSnapshot() {
      return cloneStatusSnapshot(snapshot);
    },

    replaceSnapshot(nextSnapshot) {
      snapshot = cloneStatusSnapshot(nextSnapshot);
      return cloneStatusSnapshot(snapshot);
    },

    resetSnapshot(nextSnapshot = createDefaultStatusSnapshot()) {
      snapshot = cloneStatusSnapshot(nextSnapshot);
      return cloneStatusSnapshot(snapshot);
    },
  };
}
