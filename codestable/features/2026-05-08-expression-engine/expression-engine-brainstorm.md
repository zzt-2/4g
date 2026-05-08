---
doc_type: feature-brainstorm
feature: 2026-05-08-expression-engine
status: confirmed
summary: 表达式引擎 brainstorm：旧代码事实、真实样本分析、调用方集成评估、设计决策锁定
tags: [expression, brainstorm, parser, evaluation]
---

# expression-engine brainstorm

## 旧系统核心事实

### 实现概况（~1385 行）

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/composables/frames/useExpressionCalculator.ts` | 511 | 求值引擎、Kahn 排序 |
| `src/composables/frames/useFrameExpressionManager.ts` | 541 | 批量编排、configHash 缓存 |
| `src/utils/frames/fieldValidation.ts` | 333 | 表达式验证 |

### 求值机制
- `new Function(...keys, 'return (expression)')` 动态构造，每次创建新 Function
- 数学函数简化绑定：`abs: Math.abs`（省略 Math. 前缀）
- 条件表达式：`ConditionalExpression { condition, expression }` 多分支按序短路

### 变量系统
- 4 种 DataSourceType：`current_field` / `frame_field` / `global_stat` / `scoe_data`
- 引擎内部持有 store（`useGlobalStatsStore()`, `useScoeStore()`）— **必须消灭**
- 跨帧引用通过 `CalculationContext.allFrameData: Map<string, Map<string, unknown>>`

### Kahn 拓扑排序（可复用）
- O(V+E) 标准 BFS 实现
- 循环依赖检测 → 回退安全模式（不崩溃）
- 计算后立即更新上下文 `context.frameData.set(fieldId, processedValue)`

### 缓存机制（思路可复用）
- `configHash + timestamp` 检测配置变更
- LRU 最多 50 项，5 分钟过期

### 性能瓶颈
- 高频 receive 同步阻塞主线程
- 无预编译，每帧 new Function
- 无表达式级缓存

## 真实表达式样本（18 个配置文件）

### 复杂度分布

| 复杂度 | 示例 | 频率 |
|--------|------|------|
| 最简 | `var1` | 常见 |
| 基础算术 | `var1*2`, `var1+var2`, `var1*100+var2` | 最常见 |
| 中等 | `(var1+var2)*299.792458/10000` | 常见 |
| 复杂 | `(距离*1000-帧数*帧距-处理时钟数*处理时钟对应距离)/采样时钟对应距离` | 少量 |
| 超大常数 | `13743895344000/299792458*速度` | 极少 |

### 关键发现
1. **零函数调用** — 未发现 sin/cos/sqrt/pow 等调用，全是四则运算
2. **运算符极简** — 仅 `+ - * / ( ) > < >= <= == !=`，无三元/位运算/字符串拼接
3. **中文变量名是常态** — `速度`、`距离`、`光速`、`帧距` 等
4. **条件多分支是核心模式** — 典型 5 个 condition+expression 对，如 `速率==0 → 7674.68`, `速率==1 → 3837.34`
5. **字符串字面量** — 条件中出现了 `'RS编码'`、`'LDPC编码'`
6. **变量名是裸标识符** — `var1`/`速度`，非 `$` 前缀

### 条件表达式模式
```json
[
  { "condition": "速率==0", "expression": "7674.6869248" },
  { "condition": "速率==1", "expression": "3837.3434624" },
  { "condition": "速率==2", "expression": "1918.6717312" },
  { "condition": "速率==3", "expression": "959.3358656" },
  { "condition": "速率==4", "expression": "479.6679328" }
]
```

## 调用方集成评估

### Receive（最干净）
- **集成点**：`field-parser.ts:applyFactor`（~行 39）
- **当前**：硬编码 `value * factor`
- **接入后**：`compileExpression` 替代 `applyFactor`，3 行代码
- **变量**：rawParsedValue + 同帧其他字段值

### Task（干净，有扩展点）
- **集成点**：`condition-matcher.ts:evaluateCondition`（~行 4）
- **当前**：结构化 `WaitCondition { frameId, fieldId, operator, threshold }` + `compareValues`
- **接入后**：`compileConditional` + `evaluateConditional` 作为 WaitCondition 的超集
- **变量**：current input values + task context + latest field values
- **注意**：`ConditionRegistry.processInput` 签名需扩展传递更多上下文

### Send（干净，有设计决策）
- **集成点**：`encode.ts:buildFrame` 前
- **当前**：静态 `fieldValues: Record<string, SendFieldValue>`
- **接入后**：`compileGroup` + `evaluateGroup`，构帧前批量解析
- **注意**：send 需访问 receive 最新快照，这是跨 feature 数据流设计点

### condition-operators 共存
- `compareValues` 和表达式引擎是独立工具
- WaitCondition 可后续逐步迁移到表达式条件
- 不强行复用 `compareValues`，场景不同

## 锁定设计决策

| # | 决策 | 结论 | 依据 |
|---|------|------|------|
| D1 | 预编译 | 手写 tokenizer + recursive descent parser → AST → JS 函数 | 语法极简，可控，编译阶段免费获得依赖分析 |
| D2 | 变量解析 | 扁平 Map 输入，引擎不感知命名空间 | 纯函数约束，新增数据源零引擎改动 |
| D3 | 函数表 | FunctionTable 参数注入，默认 Math.* 简名 | 可测试、可扩展、不污染变量空间 |
| D4 | 条件表达式 | 纳入引擎核心 | 多分支是真实数据中最复杂的模式 |
| D5 | 依赖排序 | AST 提取 + Kahn 拓扑排序，编译阶段完成 | 旧系统验证可行，AST 比正则可靠 |
| D6 | 循环依赖 | 编译阶段报错，不回退 | 调用方决定降级策略 |

## Critic 审查发现的额外决策

- 一元负号语法：parser BNF 必须显式 `unary := ('-'|'+')? primary`
- 变量/函数冲突消歧：标识符后跟 `(` → 函数，否则 → 变量
- 除零：返回 `EvalResult { success: false }`，不传 Infinity
- `==`：严格语义，`5 == '5'` 为 false
- evaluateGroup 部分失败：失败 key 不设值，依赖它的也失败
- null/undefined 变量值：运行时错误，不隐式转 0
- 编译结果由调用方缓存，引擎不内置缓存
