import {
  cloneSettingsSnapshot,
  createDefaultSettingsSnapshot,
  type ReadonlySettingsSnapshot,
  type SettingsSnapshot,
} from '../core';

export interface SettingsStateInitialValue {
  readonly snapshot?: ReadonlySettingsSnapshot;
}

export interface SettingsStateContainer {
  getSnapshot(): SettingsSnapshot;
  replaceSnapshot(snapshot: ReadonlySettingsSnapshot): SettingsSnapshot;
  resetSnapshot(snapshot?: ReadonlySettingsSnapshot): SettingsSnapshot;
}

export function createSettingsState(
  initialValue: SettingsStateInitialValue = {},
): SettingsStateContainer {
  let snapshot = initialValue.snapshot
    ? cloneSettingsSnapshot(initialValue.snapshot)
    : createDefaultSettingsSnapshot();

  return {
    getSnapshot() {
      return cloneSettingsSnapshot(snapshot);
    },

    replaceSnapshot(nextSnapshot) {
      snapshot = cloneSettingsSnapshot(nextSnapshot);
      return cloneSettingsSnapshot(snapshot);
    },

    resetSnapshot(nextSnapshot = createDefaultSettingsSnapshot()) {
      snapshot = cloneSettingsSnapshot(nextSnapshot);
      return cloneSettingsSnapshot(snapshot);
    },
  };
}
