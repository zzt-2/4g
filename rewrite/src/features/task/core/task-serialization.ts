import type { TaskDefinition } from './types';

const SERIALIZATION_VERSION = 1;

export interface SerializedTaskDefinition {
  readonly _version: number;
  readonly definition: TaskDefinition;
}

export function serializeTaskDefinition(def: TaskDefinition): string {
  const wrapped: SerializedTaskDefinition = { _version: SERIALIZATION_VERSION, definition: def };
  return JSON.stringify(wrapped);
}

export function deserializeTaskDefinition(json: string): TaskDefinition {
  const parsed = JSON.parse(json) as SerializedTaskDefinition;

  if (!parsed._version || !parsed.definition) {
    throw new Error('Invalid task definition format: missing _version or definition.');
  }

  if (parsed._version > SERIALIZATION_VERSION) {
    throw new Error(`Unsupported task definition version: ${parsed._version}. Maximum supported: ${SERIALIZATION_VERSION}.`);
  }

  return parsed.definition;
}
