import { ref, watch, type Ref } from 'vue';

/**
 * 持久化 tab（或任意单选字符串）状态到 localStorage。
 *
 * 解决"切走页面组件销毁、切回重建 → tab 回初始值"（路由无 keep-alive）。
 * 比单纯 ref 多一点：连刷新/重启都记住 tab。
 *
 * 防御性读写（隐私模式/序列化失败/脏数据都不崩）：
 * - 读：getItem 抛错 / 解析失败 / 值不在 validValues → 回退 defaultValue
 * - 写：setItem 抛错 → 仅持久化失败，ref 仍更新（UI 不受影响）
 *
 * @param key          localStorage 键（调用方命名空间前缀，如 'task-' / 'ci-'）
 * @param defaultValue 不存在/非法时的回退值
 * @param validValues  合法取值集合（用于读回校验，防止脏数据/旧版本残留值生效）
 */
export function usePersistentTab<T extends string>(
  key: string,
  defaultValue: T,
  validValues: readonly T[],
): Ref<T> {
  function readStored(): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'string' && (validValues as readonly string[]).includes(parsed)
        ? (parsed as T)
        : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  const state = ref(readStored()) as Ref<T>;

  // 写入时同步持久化（flush:'sync' → 赋值即落盘，对 tab 这种轻量单值最简单可靠；
  // 持久化失败不影响 UI，仅吞错）
  watch(
    state,
    (next) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 忽略（隐私模式 / 配额超限 / 序列化失败）
      }
    },
    { flush: 'sync' },
  );

  return state;
}
