import type { SendFrameInstance } from '../core';

const EXPORT_SCHEMA_VERSION = 1;

interface ExportedPayload {
  readonly version: number;
  readonly instances: readonly SendFrameInstance[];
}

export interface SendInstancesDeserializeResult {
  readonly ok: boolean;
  readonly instances: SendFrameInstance[];
  readonly issues: readonly { readonly message: string }[];
}

/**
 * 把发送实例列表序列化为可下载的 JSON 字符串（pretty print）。
 */
export function serializeSendInstances(instances: readonly SendFrameInstance[]): string {
  const payload: ExportedPayload = {
    version: EXPORT_SCHEMA_VERSION,
    instances,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * 解析导入的 JSON 文本，返回 instances 数组。
 *
 * 校验：version 不匹配 / instances 不是数组 / 单项缺少必要字段 -> 失败。
 * 冲突处理（同 instanceId 已存在）由调用方决定策略。
 */
export function deserializeSendInstances(text: string): SendInstancesDeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      instances: [],
      issues: [{ message: 'JSON 格式错误，无法解析' }],
    };
  }

  if (!isExportedPayload(parsed)) {
    return {
      ok: false,
      instances: [],
      issues: [{ message: '不支持的发送实例文件格式，需要 version: 1 且 instances 为数组' }],
    };
  }

  return { ok: true, instances: [...parsed.instances], issues: [] };
}

function isExportedPayload(value: unknown): value is ExportedPayload {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.version !== EXPORT_SCHEMA_VERSION) return false;
  if (!Array.isArray(record.instances)) return false;
  return record.instances.every(isSendFrameInstanceLike);
}

function isSendFrameInstanceLike(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.instanceId === 'string' &&
    typeof record.frameId === 'string' &&
    typeof record.name === 'string' &&
    typeof record.userFieldValues === 'object' &&
    record.userFieldValues !== null
  );
}
