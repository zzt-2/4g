import { ref, shallowRef } from 'vue';
import { defaultNow } from '@/shared';
import type { SendFrameInstance, SendFieldValue } from '../core';

let nextInstanceId = 0;

function generateInstanceId(): string {
  return `si_${Date.now()}_${nextInstanceId++}`;
}

// Module-level state: survives page navigation (component unmount/remount)
const instances = shallowRef<SendFrameInstance[]>([]);
const selectedInstanceId = ref<string | null>(null);
const selectedTargetId = ref<string | null>(null);

export function restoreSendInstances(saved: readonly SendFrameInstance[]): void {
  instances.value = [...saved];
  nextInstanceId = saved.reduce((max, inst) => {
    const match = inst.instanceId.match(/si_\d+_(\d+)/);
    return match ? Math.max(max, Number(match[1]) + 1) : max;
  }, 0);
}

export function getSendInstancesSnapshot(): readonly SendFrameInstance[] {
  return [...instances.value];
}

export function useSendInstances() {
  function createInstance(
    frameId: string,
    frameName: string,
    userFieldValues?: Record<string, SendFieldValue>,
    description?: string,
  ): SendFrameInstance {
    const now = defaultNow();
    const instance: SendFrameInstance = {
      instanceId: generateInstanceId(),
      frameId,
      name: frameName,
      description,
      userFieldValues: userFieldValues ? { ...userFieldValues } : {},
      sendCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    instances.value = [...instances.value, instance];
    return instance;
  }

  function updateInstance(
    instanceId: string,
    updates: Partial<Pick<SendFrameInstance, 'name' | 'description' | 'userFieldValues'>>,
  ): SendFrameInstance | undefined {
    const idx = instances.value.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return undefined;
    const existing = instances.value[idx]!;
    const updated: SendFrameInstance = {
      ...existing,
      ...updates,
      userFieldValues: updates.userFieldValues
        ? { ...updates.userFieldValues }
        : existing.userFieldValues,
      updatedAt: defaultNow(),
    };
    const newArr = [...instances.value];
    newArr[idx] = updated;
    instances.value = newArr;
    return updated;
  }

  function removeInstance(instanceId: string): void {
    instances.value = instances.value.filter((i) => i.instanceId !== instanceId);
    if (selectedInstanceId.value === instanceId) {
      selectedInstanceId.value = null;
    }
  }

  function cloneInstance(instanceId: string): SendFrameInstance | undefined {
    const existing = instances.value.find((i) => i.instanceId === instanceId);
    if (!existing) return undefined;
    const now = defaultNow();
    const cloned: SendFrameInstance = {
      ...existing,
      instanceId: generateInstanceId(),
      name: `${existing.name} (副本)`,
      sendCount: 0,
      lastSendAt: undefined,
      createdAt: now,
      updatedAt: now,
      userFieldValues: { ...existing.userFieldValues },
    };
    instances.value = [...instances.value, cloned];
    return cloned;
  }

  /**
   * 批量追加实例（导入用）。每条重新生成 instanceId 避免冲突，
   * 重置 sendCount / 时间戳；保留 frameId / name / userFieldValues / description。
   * 返回新增的数量。
   */
  function appendInstances(items: readonly SendFrameInstance[]): number {
    if (items.length === 0) return 0;
    const now = defaultNow();
    const normalized: SendFrameInstance[] = items.map((item) => ({
      instanceId: generateInstanceId(),
      frameId: item.frameId,
      name: item.name,
      description: item.description,
      userFieldValues: { ...item.userFieldValues },
      sendCount: 0,
      lastSendAt: undefined,
      createdAt: now,
      updatedAt: now,
    }));
    instances.value = [...instances.value, ...normalized];
    return normalized.length;
  }

  function incrementSendCount(instanceId: string): void {
    const idx = instances.value.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return;
    const existing = instances.value[idx]!;
    const updated: SendFrameInstance = {
      ...existing,
      sendCount: existing.sendCount + 1,
      lastSendAt: defaultNow(),
      updatedAt: defaultNow(),
    };
    const newArr = [...instances.value];
    newArr[idx] = updated;
    instances.value = newArr;
  }

  function moveInstanceUp(instanceId: string): void {
    const idx = instances.value.findIndex((i) => i.instanceId === instanceId);
    if (idx <= 0) return;
    const newArr = [...instances.value];
    [newArr[idx - 1], newArr[idx]] = [newArr[idx]!, newArr[idx - 1]!];
    instances.value = newArr;
  }

  function moveInstanceDown(instanceId: string): void {
    const idx = instances.value.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1 || idx >= instances.value.length - 1) return;
    const newArr = [...instances.value];
    [newArr[idx], newArr[idx + 1]] = [newArr[idx + 1]!, newArr[idx]!];
    instances.value = newArr;
  }

  function selectInstance(instanceId: string | null): void {
    selectedInstanceId.value = instanceId;
  }

  return {
    instances,
    selectedInstanceId,
    selectedTargetId,
    createInstance,
    updateInstance,
    removeInstance,
    cloneInstance,
    appendInstances,
    incrementSendCount,
    moveInstanceUp,
    moveInstanceDown,
    selectInstance,
  };
}
