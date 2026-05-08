import { inject, provide, type InjectionKey } from 'vue';
import { createRewriteRuntime, type RewriteRuntime } from '@/runtime';
import { getTransportFacade } from '@/platform';
import { createRealSerialAdapter } from '@/features/connection';

const rewriteRuntimeKey: InjectionKey<RewriteRuntime> = Symbol('rewrite-runtime');

export interface BootstrapResult {
  readonly runtime: RewriteRuntime;
  readonly mode: 'real' | 'noOp';
}

export function bootstrapRewriteRuntime(): BootstrapResult {
  const transportFacade = getTransportFacade();
  if (transportFacade) {
    const adapter = createRealSerialAdapter({ transport: transportFacade });
    const runtime = createRewriteRuntime({ connectionAdapter: adapter });
    return { runtime, mode: 'real' };
  }

  const runtime = createRewriteRuntime();
  return { runtime, mode: 'noOp' };
}

export function provideRewriteRuntime(runtime: RewriteRuntime = createRewriteRuntime()): RewriteRuntime {
  provide(rewriteRuntimeKey, runtime);
  return runtime;
}

export function useRewriteRuntime(): RewriteRuntime {
  const runtime = inject(rewriteRuntimeKey);
  if (!runtime) {
    throw new Error('Rewrite runtime has not been provided.');
  }

  return runtime;
}
