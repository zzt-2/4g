---
doc_type: learning
track: pitfall-and-pattern
status: current
created: 2026-05-08
---

# 表达式引擎实现要点

## 旧系统表达式真实模式

从 18 个生产配置文件（`public/data/frames/configs/`）中提取的事实：

1. **零数学函数调用** — 所有表达式只用四则运算，没有 sin/cos/sqrt/pow。但引擎仍应提供 Math.* 函数表，未来可能用到。
2. **中文变量名是常态** — `速度`、`距离`、`光速`、`帧距`、`处理时钟对应距离` 等。tokenizer 必须用 `\p{ID_Start}`/`\p{ID_Continue}` Unicode 属性。
3. **条件多分支是核心模式** — 典型 5 个 `{condition, expression}` 对按序短路求值。这必须纳入引擎核心，不能散给调用方。
4. **变量名是裸标识符** — 旧系统用 `var1`/`速度`，不是 `$遥测.温度` 这种前缀形式。新系统的命名空间约定是帧定义层面的，引擎只认扁平 Map。
5. **大数常数常见** — `13743895344000`（~2^37*125）、`299792458`（光速）、`4294967295`（uint32 max）。IEEE 754 double 精度足够，不需要 BigInt。

## 手写 parser 的关键陷阱

1. **一元负号** — `primary := NUMBER | IDENT | '(' expr ')'` 不够，必须加 `unary := ('-'|'+')? primary`。否则 `-5`、`(-速度)` 解析失败。
2. **变量/函数名冲突** — 用户可能创建名为 `abs` 的变量。解法：语法消歧（标识符后跟 `(` → 函数调用，否则 → 变量查找）。
3. **中文标识符 + 运算符** — tokenizer 用 Unicode 属性匹配标识符，不会和 ASCII 运算符冲突。`\p{ID_Start}` 不含 `+-*/()><=!&|'` 这些字符。

## tsc strictNullChecks 常见陷阱

数组索引访问 `arr[i]` 在 strict 模式下返回 `T | undefined`，即使在 `i < arr.length` 守卫之后。解法：
- 外层取值用 `arr[i]!` 非空断言（在已守卫的上下文中）
- 循环内用 `const last = arr[arr.length - 1]!` 预取 fallback

## 内部类型封装模式

TypeScript 模块中 `export` 的类型对外部可达，即使不重导出。解法：
- 内部共享类型放 `_internal.ts`（下划线前缀约定"不要直接 import"）
- `index.ts` 不导入/重导出 `_internal`
- 功能模块从 `_internal` import 类型，对外只暴露公共 API

## 性能实测

- 手写 parser + 编译为 JS 闭包：单表达式预编译后求值 < 1μs
- 50 表达式批量拓扑求值 < 20μs
- 高频 receive 场景完全够用，不需要 Web Worker
