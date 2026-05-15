import { shallowRef } from 'vue';
import { useQuasar } from 'quasar';

export function useAsyncAction() {
  const $q = useQuasar();
  const operatingIds = shallowRef<Set<string>>(new Set());

  async function execute<T>(id: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (operatingIds.value.has(id)) return undefined;

    const next = new Set(operatingIds.value);
    next.add(id);
    operatingIds.value = next;

    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      $q.notify({ type: 'negative', message });
      return undefined;
    } finally {
      const after = new Set(operatingIds.value);
      after.delete(id);
      operatingIds.value = after;
    }
  }

  function isOperating(id: string): boolean {
    return operatingIds.value.has(id);
  }

  return { operatingIds, execute, isOperating };
}
