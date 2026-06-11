import type { DisplayGroupConfig } from './types';

export interface FrameGroupMapping {
  readonly groupId: string;
  readonly visibleFieldIds: ReadonlySet<string>;
}

export function buildFrameGroupLookup(
  groups: readonly DisplayGroupConfig[],
): Map<string, FrameGroupMapping> {
  const lookup = new Map<string, FrameGroupMapping>();
  for (const group of groups) {
    for (const entry of group.frames) {
      lookup.set(entry.frameId, {
        groupId: group.id,
        visibleFieldIds: new Set(entry.visibleFieldIds),
      });
    }
  }
  return lookup;
}
