/**
 * Recursively makes all properties of T readonly, including nested arrays and objects.
 * Shared across all features to avoid duplicate definitions.
 */
export type ReadonlyDeep<T> = T extends readonly (infer Item)[]
  ? readonly ReadonlyDeep<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
    : T;
