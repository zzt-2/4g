import type { SendVariableProvider } from './ports';
import type { VariableMap } from '@/shared/expression/types';

export interface FakeVariableProviderOptions {
  readonly variables?: ReadonlyMap<string, number | string | boolean>;
}

export function createFakeVariableProvider(
  options: FakeVariableProviderOptions = {},
): SendVariableProvider {
  const vars = options.variables ?? new Map();
  return {
    getVariables(): VariableMap {
      return vars;
    },
  };
}
