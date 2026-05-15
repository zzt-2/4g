import { onUnmounted, ref } from 'vue';

export function usePolling(fn: () => void, intervalMs: number) {
  let rafId = 0;
  let lastTime = 0;
  const disposed = ref(false);

  function tick(now: number): void {
    if (disposed.value) return;
    if (now - lastTime >= intervalMs) {
      fn();
      lastTime = now;
    }
    rafId = requestAnimationFrame(tick);
  }

  function start(): void {
    if (disposed.value) return;
    stop();
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function restart(): void {
    start();
  }

  onUnmounted(() => {
    disposed.value = true;
    stop();
  });

  return { start, stop, restart };
}
