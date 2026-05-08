import type { WaitCondition, ConditionMatchInput } from '../core';
import { evaluateCondition } from '../core';

// --- Condition registry ---

export interface ConditionEntry {
  readonly condition: WaitCondition;
  readonly onMatch: (value: number | string) => void;
}

export class ConditionRegistry {
  private entries = new Map<string, Set<ConditionEntry>>();

  register(condition: WaitCondition, onMatch: (value: number | string) => void): ConditionEntry {
    const entry: ConditionEntry = { condition, onMatch };
    const key = condition.frameId;
    if (!this.entries.has(key)) {
      this.entries.set(key, new Set());
    }
    this.entries.get(key)!.add(entry);
    return entry;
  }

  unregister(entry: ConditionEntry): void {
    const key = entry.condition.frameId;
    const set = this.entries.get(key);
    if (set) {
      set.delete(entry);
      if (set.size === 0) {
        this.entries.delete(key);
      }
    }
  }

  processInput(input: ConditionMatchInput): void {
    const set = this.entries.get(input.frameId);
    if (!set) return;
    for (const entry of set) {
      if (evaluateCondition(entry.condition, input)) {
        entry.onMatch(input.value as number | string);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    let total = 0;
    for (const set of this.entries.values()) {
      total += set.size;
    }
    return total;
  }
}
