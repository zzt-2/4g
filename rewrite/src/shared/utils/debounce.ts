/**
 * 通用 debounce：返回的函数在最后一次调用后 delayMs 毫秒才真正执行 fn。
 *
 * 多次连续调用只触发最后一次，适合高频写入持久化层。
 */
export function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };
}
