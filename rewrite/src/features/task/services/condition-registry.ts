import type { ConditionTerm, ConditionMatchInput } from '../core';
import { evaluateConditionGroup } from '../core';

interface RegistryGroup {
  readonly id: string;
  readonly conditions: readonly ConditionTerm[];
  readonly onSatisfied: () => void;
}

export interface ConditionGroup {
  readonly _group: RegistryGroup;
}

export class ConditionRegistry {
  private groups: RegistryGroup[] = [];
  private frameIndex = new Map<string, Set<number>>();
  private nextGroupId = 1;

  registerGroup(conditions: readonly ConditionTerm[], onSatisfied: () => void): ConditionGroup {
    const id = `cg-${this.nextGroupId++}`;
    const group: RegistryGroup = { id, conditions, onSatisfied };
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

      // sourceId filter
      if (input.sourceId !== undefined) {
        const hasSourceMatch = group.conditions.some(
          (c) => c.sourceId === undefined || c.sourceId === input.sourceId,
        );
        if (!hasSourceMatch) continue;
      }

      if (evaluateConditionGroup(group.conditions, { ...input.fieldValues })) {
        group.onSatisfied();
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
