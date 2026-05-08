export function cloneUnknownValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneUnknownValue);
  }

  if (typeof value === 'object' && value !== null) {
    const cloned: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      cloned[key] = cloneUnknownValue(item);
    }
    return cloned;
  }

  return value;
}
