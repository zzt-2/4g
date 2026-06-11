---
doc_type: reference
type: rewrite-frontend-quickref
status: active
date: 2026-05-14
summary: 前端速查卡——写新页面/新组件前花 30 秒扫一遍。含 shared/ 完整 API 索引 + 规范红线 + 新页面检查清单。
tags:
  - rewrite
  - frontend
  - quickref
---

# Rewrite 前端速查卡

> 写新页面/新组件前先看。详细规则见 `rewrite-frontend-conventions.md`。
> shared/ 所有 API 从 `@/shared` 或 `@/shared/composables` 导入。shared 不 import 任何 feature。

## composables — 页面必用

| composable | 用途 | 替代什么 |
|-----------|------|----------|
| `useAsyncAction()` | 异步操作防重 + 自动错误通知 | 手写 operatingIds + try/finally |
| `usePolling(fn, ms)` | rAF 轮询 + 自动清理 | 手写 rAF / disposed / 节流 |
| `useNotify()` | 统一消息通知 | 散落 `$q.notify()` |
| `useStableKeys(prefix?)` | v-for 稳定 key 生成 | index key |

```typescript
const { execute, isOperating } = useAsyncAction()          // execute: 加锁→执行→解锁→失败 notify
const { start, stop } = usePolling(() => refresh(), 1000)  // 自动 onUnmounted 清理
const notify = useNotify()                                  // success / error / info / warning
const { keys, syncKeys } = useStableKeys('step')            // keys.value[i] 始终稳定
```

## utils/ — 纯工具函数

写新代码前先查，避免重复造轮子。

| 函数 | 签名 | 用途 |
|------|------|------|
| `deepClone` | `<T>(value: T) → T` | structuredClone 封装 |
| `cloneUnknownValue` | `(value: unknown) → unknown` | 递归拷贝（不依赖 structuredClone） |
| `formatElapsed` | `(ms: number) → string` | 毫秒 → "Xms" / "Xs" / "Xm Ys" / "Xh Ym" |
| `defaultNow` | `() → string` | ISO 8601 时间戳 |

## expression/ — 表达式编译与求值

| 函数 | 签名 | 用途 |
|------|------|------|
| `compileExpression` | `(text, functions?) → CompileResult` | 编译单条表达式 |
| `compileConditional` | `(branches, fallback?, functions?) → ConditionalCompileResult` | 编译条件分支 |
| `compileGroup` | `(expressions, functions?) → GroupCompileResult` | 编译表达式组（含依赖排序） |
| `evaluate` | `(compiled, variables) → EvalResult` | 求值单条表达式 |
| `evaluateConditional` | `(compiled, variables) → ConditionalEvalResult` | 求值条件分支 |
| `evaluateGroup` | `(group, variables) → GroupEvalResult` | 求值表达式组 |
| `defaultMathFunctions` | `FunctionTable` | 内置数学函数（abs/floor/ceil/round/min/max/sqrt/pow/sin/cos/tan/log/exp） |

**依赖分析**: `extractDependencies(ast) → Set<string>`, `kahnSort(expressions) → { order } | { cycle }`

**核心类型**: `VariableMap = ReadonlyMap<string, VariableValue>`, `VariableValue = number | string | boolean`, `FunctionTable = ReadonlyMap<string, (...args: number[]) => number>`

## condition-operators/ — 条件匹配

| 函数 | 签名 | 用途 |
|------|------|------|
| `compareValues` | `(actual, threshold, operator) → boolean` | 通用值比较 |

**运算符**: `eq` `neq` `gt` `lt` `gte` `lte` `contains` `change` `any`

**类型**: `ComparisonOperator` — 上述运算符的联合类型

## timer/ — 定时器管理

| 类 | 用途 |
|----|------|
| `TimerRegistry` | 分组定时器注册表，全局暂停/恢复 |

```typescript
const timers = new TimerRegistry()
timers.register('tick', () => poll(), 1000, 'polling')
timers.pauseAll()
timers.resumeAll()
timers.clearGroup('polling')
```

## types/ — 共享类型

| 类型 | 用途 |
|------|------|
| `ReadonlyDeep<T>` | 递归将 T 及嵌套属性设为 readonly |
| `ValidationIssue` | `{ severity: 'error' | 'warning', code, path, message }` |
| `ValidationResult` | `{ valid, issues: readonly ValidationIssue[] }` |

## platform-bridge.ts — 平台能力接口

定义 renderer 与桌面平台通信的 typed 接口。**不直接消费**，通过 `rewrite/src/platform` facade 间接使用。

- `TransportBridge` — 串口/TCP/UDP 连接、写入、事件
- `FileBridge` — 文件读写、对话框
- `RewritePlatformBridge` — 组合接口

---

## 语义 class（不用 inline style 消费 token）

```
文本：rw-text-label / rw-text-value / rw-text-desc / rw-text-error / rw-text-warn
边框：rw-divider-b / rw-divider-t / rw-divider-l
面板：rw-panel-base
弹窗：rw-dialog-sm / rw-dialog-md / rw-dialog-lg / rw-dialog-xl
滚动：rw-dialog-scroll-body
```

完整表见 conventions §6 C4。

## 绝对禁止

- `catch {}` / `catch () {}` 空错误吞没（O2）
- `style="color: var(--rw-color-...)"` inline token → 用语义 class（C4）
- `style="width: Npx"` 硬编码像素 → 用 UnoCSS class 或 rw-dialog-*（C4/D2）
- `v-for ... :key="i"` index key → 用稳定 ID（P6）
- 组件超 300 行不拆
- 选项数组/标签映射写在 setup 内 → 放模块级或常量文件（O4）
- 同一逻辑出现 2+ 处不提取（O3）
- `any` 类型（D6）

## 状态声明顺序（O1）

```
Service 引用 → 业务数据 → 查询/筛选 → UI 状态 → 派生数据 → 操作
```

## 新页面检查清单

1. composable 用了没？（useAsyncAction / usePolling / useNotify）
2. shared/ 已有工具函数查了没？（deepClone / formatElapsed / compareValues）
3. 标签/选项提取了没？（模块级常量文件，O3/O4）
4. 语义 class 用了没？（grep `style=".*var(--rw-` 和 `style="width: \d`)
5. v-for key 稳定吗？（grep `:key="i"` / `:key="idx"`）
6. catch 都有处理吗？（grep `catch {}` / `catch () {}`）
7. 组件超 300 行吗？该拆吗？
8. shallowRef 用对了吗？（>50 元素数组必须用，P2）
