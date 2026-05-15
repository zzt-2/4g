import { ref } from 'vue';

export function useStableKeys(prefix = 'key') {
  let uid = 0;
  const keys = ref<string[]>([]);

  function syncKeys(items: readonly unknown[]): void {
    while (keys.value.length < items.length) {
      keys.value = [...keys.value, `${prefix}_${uid++}`];
    }
    if (keys.value.length > items.length) {
      keys.value = keys.value.slice(0, items.length);
    }
  }

  return { keys, syncKeys };
}
