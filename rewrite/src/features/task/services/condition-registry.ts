import type { WaitCondition, ConditionTerm, ConditionMatchInput } from '../core';
import { evaluateCondition, evaluateConditionGroup } from '../core';

interface RegistryGroup {
  readonly conditions: readonly ConditionTerm[];
  readonly callback: (value?: number | string) => void;
  readonly singleMode?: boolean; // legacy register() mode
}

export interface ConditionEntry {
  readonly _group: RegistryGroup;
}

export interface ConditionGroup {
  readonly _group: RegistryGroup;
}

export class ConditionRegistry {
  private groups: RegistryGroup[] = [];
  private frameIndex = new Map<string, Set<number>>();

  register(condition: WaitCondition, onMatch: (value: number | string) => void): ConditionEntry {
    const term: ConditionTerm = { ...condition };
    const group: RegistryGroup = { conditions: [term], callback: onMatch, singleMode: true };
    const idx = this.groups.length;
    this.groups.push(group);
    this.indexGroup(idx, group);
    return { _group: group };
  }

  unregister(entry: ConditionEntry): void {
    const idx = this.groups.indexOf(entry._group);
    if (idx === -1) return;
    this.groups.splice(idx, 1);
    this.rebuildIndex();
  }

  registerGroup(conditions: readonly ConditionTerm[], callback: () => void): ConditionGroup {
    const group: RegistryGroup = { conditions, callback: () => callback() };
    const idx = this.groups.length;
    this.groups.push(group);
    this.indexGroup(idx, group);
    return { _group: group };
  }

  unregisterGroup(group: ConditionGroup): void {
    const idx = this.groups.indexOf(group._group);
    if (idx === -1) return;
    this.groups.splice(idx, 1);
    this.rebuildIndex();
  }

  processInput(input: ConditionMatchInput): void {
    const candidateIndices = this.frameIndex.get(input.frameId);
    if (!candidateIndices) return;

    for (const idx of candidateIndices) {
      const group = this.groups[idx];
      if (!group) continue;

      // Check sourceId filter
      const hasSourceFilter = group.conditions.some((c) => c.sourceId !== undefined);
      if (hasSourceFilter && input.sourceId !== undefined) {
        const anyMatch = group.conditions.some(
          (c) => c.sourceId === undefined || c.sourceId === input.sourceId,
        );
        if (!anyMatch) continue;
      }

      if (group.singleMode) {
        const cond = group.conditions[0]!;
        if (evaluateCondition(cond, input)) {
          const value = input.fieldValues[cond.fieldId];
          if (value != null) {
            group.callback(value);
          }
        }
      } else {
        if (evaluateConditionGroup(group.conditions, { ...input.fieldValues })) {
          group.callback();
        }
      }
    }
  }

  clear(): void {
    this.groups = [];
    this.frameIndex.clear();
  }

  get size(): number {
    return this.groups.length;
  }

  private indexGroup(idx: number, group: RegistryGroup): void {
    for (const cond of group.conditions) {
      if (!this.frameIndex.has(cond.frameId)) {
        this.frameIndex.set(cond.frameId, new Set());
      }
      this.frameIndex.get(cond.frameId)!.add(idx);
    }
  }

  private rebuildIndex(): void {
    this.frameIndex.clear();
    for (let i = 0; i < this.groups.length; i++) {
      this.indexGroup(i, this.groups[i]!);
    }
  }
}
