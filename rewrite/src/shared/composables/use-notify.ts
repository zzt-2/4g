import { useQuasar } from 'quasar';

export function useNotify() {
  const $q = useQuasar();

  function success(message: string): void {
    $q.notify({ type: 'positive', message });
  }

  function error(message: string, detail?: string): void {
    $q.notify({
      type: 'negative',
      message: detail ? `${message}: ${detail}` : message,
    });
  }

  function info(message: string): void {
    $q.notify({ type: 'info', message });
  }

  function warning(message: string): void {
    $q.notify({ type: 'warning', message });
  }

  return { success, error, info, warning };
}
