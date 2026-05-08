import type { ASTNode } from './_internal';

export function extractDependencies(ast: ASTNode): Set<string> {
  const deps = new Set<string>();
  collectDeps(ast, deps);
  return deps;
}

function collectDeps(node: ASTNode, deps: Set<string>): void {
  switch (node.type) {
    case 'number': case 'string': case 'boolean': return;
    case 'variable': deps.add(node.name); return;
    case 'unary': collectDeps(node.operand, deps); return;
    case 'binary':
      collectDeps(node.left, deps);
      collectDeps(node.right, deps);
      return;
    case 'call':
      for (const arg of node.args) collectDeps(arg, deps);
      return;
  }
}

export function kahnSort(
  expressions: ReadonlyMap<string, ReadonlySet<string>>,
): { order: string[] } | { cycle: string[] } {
  const keys = [...expressions.keys()];
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const key of keys) {
    inDegree.set(key, 0);
    adj.set(key, []);
  }

  for (const [key, deps] of expressions) {
    for (const dep of deps) {
      if (dep !== key && expressions.has(dep)) {
        adj.get(dep)!.push(key);
        inDegree.set(key, (inDegree.get(key) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree) {
    if (deg === 0) queue.push(key);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const d = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }

  if (order.length < keys.length) {
    return { cycle: keys.filter(k => !order.includes(k)) };
  }

  return { order };
}
