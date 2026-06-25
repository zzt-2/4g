import type { ConditionMatchInput, ReceiveEventSource } from '@/features/task';

/**
 * 收到帧时同步维护一份「最新已知字段值」(按 fieldId 扁平索引),
 * 供 task 的 repeat.until / exitCondition 经 fieldValueProvider 查询
 * (这两个不走 push registry, 只能 pull 当前快照)。S014 接线。
 *
 * 注意:索引 key 是 fieldId(非 frameId.fieldId)。evaluateSingleCondition
 * 按 condition.fieldId 查表, 故与求值器约定一致。跨帧 fieldId 重名时会互相覆盖——
 * 这是现有 ConditionMatchInput.fieldValues 契约的固有约束(push 路径靠 registry 的
 * frameId 索引隔离, pull 路径 fieldId 需用户保证全局唯一)。
 */
export class ReceiveEventSourceBridge implements ReceiveEventSource {
  private readonly handlers = new Set<
    (input: ConditionMatchInput) => void
  >();
  private latestFieldValues: Record<string, number | string | null> = {};

  subscribe(handler: (input: ConditionMatchInput) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(inputs: readonly ConditionMatchInput[]): void {
    for (const input of inputs) {
      // 维护最新字段值快照(merge, 后到的覆盖先到的)
      Object.assign(this.latestFieldValues, input.fieldValues);
      for (const handler of this.handlers) {
        handler(input);
      }
    }
  }

  /** 返回当前所有已知字段值的快照(pull 模型用)。 */
  getLatestFieldValues(): Readonly<Record<string, number | string | null>> {
    return this.latestFieldValues;
  }

  clear(): void {
    this.handlers.clear();
    this.latestFieldValues = {};
  }
}
