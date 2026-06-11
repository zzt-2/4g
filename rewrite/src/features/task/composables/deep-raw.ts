import { toRaw } from 'vue';

/**
 * Composable 边界工具：递归把 Vue reactive Proxy / Ref 解包成 plain object。
 *
 * Why: reactive ref.value 传给 service 后，内部 deepClone = structuredClone，
 * 而 structuredClone 无法克隆 Vue Proxy，会抛 DataCloneError。
 * 修在 composable 出口，避免在 shared/deep-clone.ts 引 Vue 依赖。
 */
export function deepToRaw<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  const current = toRaw(value as object) as Record<string, unknown> | unknown[];

  if (Array.isArray(current)) {
    return current.map((item) => deepToRaw(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(current)) {
    const v = current[key];
    result[key] = v && typeof v === 'object' ? deepToRaw(v) : v;
  }
  return result as unknown as T;
}
