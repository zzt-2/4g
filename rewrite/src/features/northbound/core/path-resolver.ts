/**
 * 点 + 方括号路径解析器(encode/decode 共用)。
 * 支持: `a.b.c` / `arr[0].x` / `step.send.userFieldValues.power`
 *
 * 不引 lodash,自写轻量实现。encode(取值)和 decode(设值)必须共用本模块,
 * 保证两端语法一致。
 */

/** 把路径字符串拆成段: 'a.b[0].c' -> ['a','b','0','c'] */
export function parsePath(path: string): string[] {
  const segments: string[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) segments.push(m[1]);
    else if (m[2] !== undefined) segments.push(m[2]);
  }
  return segments;
}

/** 按路径取值。找不到返回 undefined。 */
export function getPathValue(obj: unknown, path: string): unknown {
  const segs = parsePath(path);
  let cur: unknown = obj;
  for (const seg of segs) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 按路径设值(不可变,返回新对象)。路径不存在返回原对象。 */
export function setPathValue<T>(obj: T, path: string, value: unknown): T {
  const segs = parsePath(path);
  if (segs.length === 0) return obj;

  function recurse(cur: unknown, idx: number): unknown {
    if (idx === segs.length) return value;
    if (cur == null || typeof cur !== 'object') return cur;
    const seg = segs[idx];
    const isArr = Array.isArray(cur);
    const next = isArr ? [...(cur as unknown[])] : { ...(cur as Record<string, unknown>) };
    const child = recurse((cur as Record<string, unknown>)[seg], idx + 1);
    if (child === undefined && idx + 1 < segs.length) return cur; // 子路径不存在,不创建
    (next as Record<string, unknown>)[seg] = child;
    return next;
  }

  return recurse(obj, 0) as T;
}
