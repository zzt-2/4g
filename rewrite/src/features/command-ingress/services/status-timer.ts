import type { CommandIngressStateWriter } from '../core/state';

export function startStatusTimer(
  stateWriter: CommandIngressStateWriter,
  intervalMs: number = 1000,
): () => void {
  const handle = setInterval(() => {
    stateWriter.tickSecond();
  }, intervalMs);

  return () => clearInterval(handle);
}
