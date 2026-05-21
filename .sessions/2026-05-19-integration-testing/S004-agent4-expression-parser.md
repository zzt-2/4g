# [S004] 旧系统表达式引擎与帧解析行为调研

> 2026-05-19 | 调研 | 完成

## 目标

调研旧系统的表达式引擎和帧解析行为，提取所有必须保留的可观测业务行为。只做事实提取，不做设计或实施。

---

## 一、旧表达式引擎核心行为

### 1.1 表达式计算模型

**旧行为描述**：表达式引擎采用"条件表达式列表 + 变量映射"模型。每个字段的 `expressionConfig` 包含一组 `ConditionalExpression[]`（条件 + 表达式对）和一组 `VariableMapping[]`（变量标识符到数据源的映射）。计算时按列表顺序逐条评估条件，第一个条件为真的表达式被执行并返回结果；若所有条件均不满足，返回默认值 `0`。

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:189-264`（`calculateConditionalExpression` + `calculateExpression`）
- **新系统对应**：`shared/` 表达式引擎（纯 TypeScript）
- **Oracle 来源**：`public/data/frames/configs/3.json`（包含多条件表达式的接收帧配置，含 `var1*2`、`var1+var2` 等）
- **保留建议**：必须保留。条件-表达式对、顺序评估、默认值 0 的语义是核心业务行为。

### 1.2 安全求值机制

**旧行为描述**：使用 `new Function(...keys, 'return (expression)')` 构造受限执行环境。将变量和数学函数注入作用域，用户表达式在沙盒化的上下文中执行。

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:151-186`（`safeEvaluate`）
- **新系统对应**：`shared/` 表达式引擎
- **Oracle 来源**：代码逻辑本身
- **保留建议**：保留"受限求值"语义。新系统可用 AST 解析或 mathjs 替代 `new Function`，但必须保持等价的函数和变量注入能力。

### 1.3 支持的运算符和函数

**旧行为描述**：因为使用 `new Function` + JavaScript 表达式语法，实际支持 JavaScript 所有运算符（算术、比较、逻辑、三元、位运算等）。注入的数学函数有：
- `Math` 对象（完整）
- `abs`, `ceil`, `floor`, `round`, `max`, `min`
- `sin`, `cos`, `tan`
- `sqrt`, `log`, `exp`, `pow`

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:155-170`
- **新系统对应**：`shared/` 表达式引擎
- **Oracle 来源**：代码；配置样本 `3.json` 中使用 `var1*2`、`var1+var2`
- **保留建议**：必须保留全部数学函数。新系统若改用白名单机制，需确保以上函数全部在白名单内。

### 1.4 变量解析 — 四种数据源

**旧行为描述**：变量通过 `VariableMapping` 从四种数据源解析：
1. **`CURRENT_FIELD`**：当前帧的其他字段（通过 `sourceId` 指定字段 ID）
2. **`FRAME_FIELD`**：其他帧的字段（通过 `frameId` + `fieldId`）——如果是同帧字段则走当前帧数据
3. **`GLOBAL_STAT`**：全局统计数据（通过 `globalStatsStore.getStatValue`）
4. **`SCOE_DATA`**：SCOE 配置/状态数据（通过路径解析 `status.xxx` / `config.xxx`）

未解析成功的变量默认值为 `0`。

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:56-148`（`resolveVariableValue` + `resolveAllVariables`）
- **新系统对应**：`shared/` 表达式引擎的变量解析；数据源来自各 feature public API
- **Oracle 来源**：`public/data/frames/configs/3.json` 中 `sourceType: "current_field"` 的变量映射
- **保留建议**：`CURRENT_FIELD` 和 `FRAME_FIELD` 必须保留。`GLOBAL_STAT` 需评估（新系统全局统计 feature 是否保留）。`SCOE_DATA` 属于 SCOE 专有，归入 SCOE/指令接入 feature 处理。

### 1.5 依赖排序（拓扑排序）

**旧行为描述**：表达式字段之间可能存在依赖（字段 A 的表达式引用字段 B 的值）。系统通过以下流程处理：
1. 从表达式和变量映射中提取当前帧字段引用（`extractFieldReferences`）
2. 构建依赖图（`analyzeDependencies`）
3. Kahn 算法拓扑排序（`topologicalSort`）
4. 按排序结果依次计算，每计算完一个字段立即更新上下文数据

循环依赖检测：若排序失败（存在环），所有表达式字段返回错误，不执行计算。

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:348-467`（依赖分析 + 拓扑排序）；`src/composables/frames/useFrameExpressionManager.ts:154-274`（`calculateWithDependencies` 按序执行）
- **新系统对应**：`shared/` 表达式引擎
- **Oracle 来源**：`public/data/frames/configs/3.json` 中字段 `340LYOzVTf81_koKFk61G` 的变量 `var2` 引用了自身（`sourceId` 指向自身），测试自引用场景
- **保留建议**：必须保留。依赖排序和循环检测是表达式引擎的核心正确性保证。

### 1.6 依赖缓存

**旧行为描述**：`useFrameExpressionManager` 维护了一个 `dependencyCache`（Map），缓存依赖分析和排序结果。缓存键为 `frameId + 表达式数量`。缓存有效期 5 分钟，且配置哈希不变时才命中。缓存上限 50 条，LRU 淘汰。

- **代码位置**：`src/composables/frames/useFrameExpressionManager.ts:26-119`
- **新系统对应**：`shared/` 表达式引擎（缓存属于实现细节，非可观测行为）
- **Oracle 来源**：代码逻辑
- **保留建议**：缓存是性能优化而非可观测行为，新系统可自行决定缓存策略。但拓扑排序结果必须确定且可复现。

### 1.7 类型处理 — 下取整规则

**旧行为描述**：表达式计算结果在写回帧数据时，会根据字段数据类型处理：
- `float` / `double`：保持原值
- 其他数字类型（`uint8/16/32/64`, `int8/16/32/64`）：`Math.floor()` 向下取整
- 非数字类型：保持原值

- **代码位置**：`src/composables/frames/useFrameExpressionManager.ts:127-145`（`processValueByDataType`）
- **新系统对应**：`shared/` 表达式引擎或 frame feature
- **Oracle 来源**：代码逻辑
- **保留建议**：必须保留。这个取整行为直接影响表达式字段的最终值，是用户可感知的业务行为。

### 1.8 表达式计算时机

**旧行为描述**：
- **接收帧**：每次收到匹配的帧数据后，表达式在数据解析完成后立即计算（`calculateAndApplyReceiveFrame`），更新对应的 dataItem 值。
- **发送帧**：在发送前计算表达式（`calculateAndApplySendFrame`），更新实例字段值后再组帧。

- **代码位置**：`src/composables/frames/useFrameExpressionManager.ts:502-507`（接收帧便捷方法）；`src/composables/frames/useFrameExpressionManager.ts:488-496`（发送帧便捷方法）
- **新系统对应**：receive feature 的数据解析管线；send feature 的组帧管线
- **Oracle 来源**：代码调用链
- **保留建议**：必须保留。计算时机影响表达式字段中变量引用的时序正确性。

### 1.9 错误处理

**旧行为描述**：
- 变量解析失败 → 默认值 `0`
- 表达式语法错误 → 抛出 `Error('表达式计算错误: ...')`，上层 catch 返回 `success: false`
- 循环依赖 → 所有字段返回 `success: false`，error 为 `循环依赖错误: ...`
- 条件表达式计算异常 → 返回 `success: false`
- 通用 catch → 返回 `success: false`

计算结果不会导致系统崩溃，但错误的表达式字段值不会被应用（只 console.error）。

- **代码位置**：`src/composables/frames/useExpressionCalculator.ts:183-184`（safeEvaluate catch）；`src/composables/frames/useFrameExpressionManager.ts:193-206`（循环依赖处理）；`src/composables/frames/useFrameExpressionManager.ts:259-271`（通用 catch）
- **新系统对应**：`shared/` 表达式引擎
- **Oracle 来源**：代码逻辑
- **保留建议**：必须保留。"不崩溃、错误不应用、默认值为 0"的容错语义是可观测行为。

---

## 二、旧帧解析核心行为

### 2.1 字节到字段的解析流程

**旧行为描述**：解析按字段在帧定义中的顺序依次进行。每个字段有 `length`（字节数）和 `dataType`。从 `startOffset` 开始提取 `length` 字节，根据 `dataType` 解析为对应类型的值。字段偏移量通过累加每个字段的 `length` 计算。

- **代码位置**：`src/utils/receive/dataProcessor.ts:199-430`（`extractFieldValue`）；`src/utils/receive/dataProcessor.ts:486-489`（偏移量计算）
- **新系统对应**：frame feature 的帧解析
- **Oracle 来源**：所有 `public/data/frames/configs/*.json` 中的字段定义
- **保留建议**：必须保留。顺序解析、偏移量累加是帧解析的基础语义。

### 2.2 11 种数据类型的解析规则

**旧行为描述**：支持以下 11 种数据类型（对应 `FieldType`）：

| 类型 | 长度 | 解析规则 |
|------|------|----------|
| `uint8` | 1 | 直接读取字节 |
| `int8` | 1 | `> 127` 时减 256 转负数 |
| `uint16` | 2 | 两字节组合（端序敏感） |
| `int16` | 2 | 两字节组合，`> 32767` 时减 65536 |
| `uint32` | 4 | 四字节组合，`>>> 0` 确保无符号 |
| `int32` | 4 | 四字节组合，`> 2147483647` 时减 4294967296 |
| `uint64` | 8 | `BigInt` 解析（`parseBigIntFromBytes`） |
| `int64` | 8 | `BigInt` 解析，`> 0x7FFFFFFFFFFFFFFF` 时转负数 |
| `float` | 4 | `DataView.getFloat32` |
| `double` | 8 | `DataView.getFloat64` |
| `bytes` | 自定义 | `isASCII` 时按字符解码；否则转十六进制字符串 |

特殊处理：
- `float` 的 `displayValue` 保留 2 位小数（`.toFixed(2)`）
- `double` 的 `displayValue` 保留 4 位小数（`.toFixed(4)`）
- `uint64`/`int64` 应用 factor 后四舍五入（`Math.round`）
- `bytes` ASCII 模式过滤 0 字节

- **代码位置**：`src/utils/receive/dataProcessor.ts:221-421`（switch 分支）
- **新系统对应**：frame feature 的字段解析
- **Oracle 来源**：配置样本中各类字段的 `dataType` 声明
- **保留建议**：全部保留。这些解析规则是协议正确性的基础。

### 2.3 字节序处理

**旧行为描述**：每个字段有 `bigEndian` 属性（默认 `true`）。解析时根据此属性决定字节顺序：
- 大端序（默认）：高字节在前
- 小端序：低字节在前

`float` 和 `double` 通过 `DataView` 的 `littleEndian` 参数处理。`uint64`/`int64` 通过 BigInt 移位处理。

- **代码位置**：`src/utils/receive/dataProcessor.ts` 各 case 分支中的 `field.bigEndian === false` 判断
- **新系统对应**：frame feature
- **Oracle 来源**：配置样本中字段的 `bigEndian` 属性
- **保留建议**：必须保留。字节序影响解析正确性。

### 2.4 applyFactor（倍率/偏移）

**旧行为描述**：字段有可选的 `factor` 属性。当 `factor` 存在且不等于 1 时，解析后的数值乘以 factor。结果使用 `parseFloat(result.toFixed(5))` 限制为最多 5 位小数，避免浮点精度问题。

factor 在以下时机应用：
- 接收帧解析：`extractFieldValue` 中对数值类型应用
- 发送帧组帧：`getFullHexString` 中对有 factor 的字段值先乘以 factor 再转十六进制

- **代码位置**：`src/utils/receive/dataProcessor.ts:121-134`（`applyFactor` + `shouldApplyFactor`）；`src/utils/frames/hexCovertUtils.ts:254-258`（发送端 factor）
- **新系统对应**：frame feature
- **Oracle 来源**：配置样本中字段的 `factor` 属性
- **保留建议**：必须保留。倍率是协议解析的核心功能，5 位小数限制是可观测行为。

### 2.5 帧识别（匹配）规则

**旧行为描述**：帧通过 `identifierRules` 进行识别。每条规则指定 `startIndex`、`endIndex`（包含）、`operator` 和 `value`。所有规则必须全部满足（AND 逻辑）才算匹配。支持的运算符：

| 运算符 | 别名 | 含义 |
|--------|------|------|
| `eq` | `==`, `=` | 等于 |
| `neq` | `!=` | 不等于 |
| `gt` | `>` | 大于 |
| `gte` | `>=` | 大于等于 |
| `lt` | `<` | 小于 |
| `lte` | `<=` | 小于等于 |
| `contains` | - | 包含 |
| `not_contains` | - | 不包含 |

匹配时将实际数据和期望值都转换为十六进制字符串进行比较。

- **代码位置**：`src/utils/receive/frameMatchers.ts:14-110`
- **新系统对应**：frame feature / receive feature
- **Oracle 来源**：帧定义中的 `identifierRules` 字段
- **保留建议**：必须保留。帧识别是接收管线的入口。

### 2.6 数据参与类型（direct / indirect）

**旧行为描述**：字段有 `dataParticipationType` 属性（默认 `direct`）：
- `direct`：参与组帧发送或从帧中直接解析
- `indirect`：不参与组帧，通过表达式计算得出或作为计算参数

在发送帧组帧时（`frameToBuffer`），只包含 `direct` 字段。在接收帧解析时，所有字段都参与偏移量计算（间接字段在帧结构中占位）。

- **代码位置**：`src/utils/frames/frameInstancesUtils.ts:352-354`（组帧过滤）；`src/utils/receive/dataProcessor.ts:486-489`（解析时无过滤）
- **新系统对应**：frame feature
- **Oracle 来源**：`public/data/frames/configs/3.json` 中 `dataParticipationType: "indirect"` 的表达式字段
- **保留建议**：必须保留。direct/indirect 决定哪些字段参与实际字节编解码。

### 2.7 校验和计算

**旧行为描述**：字段可通过 `validOption.isChecksum = true` 标记为校验字段。支持四种校验方法：

| 方法 | 算法 |
|------|------|
| `xor8` | 所有字节异或 |
| `sum8` | 所有字节累加，取低 8 位 |
| `crc16` | Modbus CRC-16（初始值 0xFFFF，多项式 0xA001） |
| `crc32` | 标准 CRC-32（初始值 0xFFFFFFFF，多项式 0xEDB88320） |

校验范围通过 `startFieldIndex` 和 `endFieldIndex` 指定。在 `frameToBuffer` 中，组帧前先计算校验值并写入校验字段。

- **代码位置**：`src/utils/frames/frameInstancesUtils.ts:154-340`（`calculateChecksum` + `calculateXor8/Sum8/Crc16/Crc32`）
- **新系统对应**：frame feature
- **Oracle 来源**：配置样本中字段的 `validOption` 配置
- **保留建议**：必须保留。四种校验算法的精确实现必须保持字节级兼容。

### 2.8 标签显示（labelOptions）

**旧行为描述**：数据项有 `useLabel` + `labelOptions` 机制。当启用时，将解析的 displayValue 转换为十六进制后与 labelOptions 的 value（也转为十六进制）匹配。匹配成功时用 label 替代原始值显示。

- **代码位置**：`src/utils/receive/dataProcessor.ts:523-533`
- **新系统对应**：receive feature / UI 层
- **Oracle 来源**：配置样本中 dataItem 的 `labelOptions`
- **保留建议**：必须保留。标签显示是用户可感知的展示行为。

---

## 三、旧条件判断核心行为

### 3.1 发送触发条件（TriggerCondition）

**旧行为描述**：发送任务的触发条件由 `TriggerCondition[]` 定义。每个条件指定 `fieldId`（关联的数据项）、`condition`（操作符）和 `value`（期望值）。条件之间通过 `logicOperator` 连接（`and` / `or`）。

支持的操作符：
- `equals`：字符串比较
- `not_equals`：字符串比较
- `greater`：数值比较
- `less`：数值比较
- `contains`：字符串包含

AND/OR 混合逻辑评估规则：按条件顺序依次评估，使用前一个条件的 `logicOperator` 与当前结果组合。存在短路求值：AND 遇到 false 或 OR 遇到 true 时提前结束。空条件数组 = 接收到帧就触发。

- **代码位置**：`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:100-158`（`evaluateTriggerConditions`）；`src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:189-218`（`evaluateSingleCondition`）
- **新系统对应**：send feature / task feature 的触发引擎
- **Oracle 来源**：`src/types/frames/sendInstances.ts:118-124`（`TriggerCondition` 接口）
- **保留建议**：必须保留。五种操作符和 AND/OR 短路逻辑是核心业务行为。

### 3.2 SCOE 完成条件（CompletionCondition）

**旧行为描述**：SCOE 指令的完成条件由 `CompletionCondition[]` 定义。与发送触发条件不同，它支持两种模式：

1. **固定值模式**（`useParam = false`）：直接比较源字段值与 `targetFixedValue`，使用 `operator`
2. **参数模式**（`useParam = true`）：通过参数值在参数选项中查找索引，再用同一索引在条件的 `options` 数组中找到匹配规则（operator + matchValue）

所有条件必须全部满足（AND 逻辑，无 OR）。条件检查使用定时轮询机制（默认 100ms 间隔），有超时机制（默认 5000ms）。

- **代码位置**：`src/utils/receive/scoeFrame.ts:416-491`（`checkCompletionConditions`）；`src/utils/receive/scoeFrame.ts:501-540`（`waitForCompletionConditions`）
- **新系统对应**：指令接入 feature / SCOE 子系统
- **Oracle 来源**：`public/data/templates/scoeReceiveCommands.json`（含 params 和 conditions 的指令配置）
- **保留建议**：必须保留。参数索引匹配模式是 SCOE 特有的业务行为。

### 3.3 比较运算符（compareValues）

**旧行为描述**：通用比较函数 `compareValues`（在 `hexCovertUtils.ts` 中），支持六种运算符：

| 运算符 | 含义 | 数值模式 | 字符串模式 |
|--------|------|----------|-----------|
| `equal` | 等于 | 数值比较 | 字符串比较 |
| `not_equal` | 不等于 | 数值比较 | 字符串比较 |
| `greater_than` | 大于 | 数值比较 | 不支持 |
| `less_than` | 小于 | 数值比较 | 不支持 |
| `greater_equal` | 大于等于 | 数值比较 | 不支持 |
| `less_equal` | 小于等于 | 数值比较 | 不支持 |

自动检测：先尝试将两个值解析为数值（支持十六进制），如果都成功则数值比较，否则字符串比较。只有 equal/not_equal 支持字符串比较模式。

- **代码位置**：`src/utils/frames/hexCovertUtils.ts:338-375`（`compareValues`）
- **新系统对应**：`shared/` 纯函数
- **Oracle 来源**：代码逻辑
- **保留建议**：必须保留。六种运算符和自动类型检测是可观测的比较语义。

### 3.4 SCOE 帧识别流程

**旧行为描述**：SCOE 帧识别是独立于通用帧识别的多步骤流程：

1. 验证功能码（4 字节：SCOE 标识 + 指令码 + 2 字节固定值）
2. 若 SCOE 帧未加载，只接受加载指令（指令码 `01`）
3. 若 SCOE 帧已加载，验证三标志（信息标识、信源标识、信宿标识，按开关启用）
4. 验证型号 ID（4 字节）和卫星 ID（4 字节）
5. 全部通过才识别为 SCOE 帧

- **代码位置**：`src/utils/receive/scoeFrame.ts:167-291`（`isScoeFrame`）
- **新系统对应**：指令接入 feature
- **Oracle 来源**：`public/data/scoe/satelliteConfigs/1.json`；`public/data/scoe/scoeConfigs/1.json`
- **保留建议**：保留核心识别流程。但具体的多步骤验证应归入 SCOE/指令接入 feature 的内部实现。

### 3.5 SCOE 校验和验证

**旧行为描述**：SCOE 有独立的校验和验证机制（`validateChecksums`）。支持多个校验配置，每个配置指定：起始偏移（`offset`）、长度（`length`）和校验位偏移（`checksumOffset`）。校验算法为累加取模 256。支持 enabled 开关。

- **代码位置**：`src/utils/receive/scoeFrame.ts:310-358`
- **新系统对应**：指令接入 feature
- **Oracle 来源**：`public/data/templates/scoeReceiveCommands.json` 中指令的 `checksums` 字段
- **保留建议**：必须保留。SCOE 校验和验证是 SCOE 协议的一部分。

---

## 四、配置样本 Oracle 汇总

| 文件 | 内容 | Oracle 价值 |
|------|------|-------------|
| `public/data/frames/configs/3.json` | 含表达式字段的接收帧定义（条件表达式、变量映射、自引用） | 高 — 表达式配置结构 oracle |
| `public/data/frames/configs/*.json`（25 个文件含 expressionConfig） | 各类帧定义，部分含表达式 | 中 — 多样化配置样本 |
| `public/data/templates/framesConfig.json` | 帧配置模板 | 中 — 完整帧结构 oracle |
| `public/data/templates/sendInstances.json` | 发送实例模板（含表达式字段） | 高 — 发送帧表达式 oracle |
| `public/data/templates/scoeReceiveCommands.json` | SCOE 接收指令（含 params + completionConditions） | 高 — 条件判断 oracle |
| `public/data/scoe/satelliteConfigs/1.json` | 卫星配置 | 中 — SCOE 识别参数 oracle |
| `public/data/scoe/scoeConfigs/1.json` | SCOE 全局配置 | 中 — SCOE 帧识别偏移 oracle |

---

## 五、可观测行为保留/排除汇总

### 必须保留（核心业务行为）

| # | 行为 | 归口 feature | Oracle |
|---|------|-------------|--------|
| 1 | 条件-表达式对顺序评估，默认值 0 | shared/ 表达式引擎 | configs/3.json |
| 2 | 13 种数学函数注入（Math 全对象 + abs/ceil/floor/round/max/min/sin/cos/tan/sqrt/log/exp/pow） | shared/ 表达式引擎 | 代码 |
| 3 | 四种变量数据源（CURRENT_FIELD / FRAME_FIELD / GLOBAL_STAT / SCOE_DATA），未解析默认 0 | shared/ 变量解析 | configs/3.json |
| 4 | 拓扑排序（Kahn 算法），循环依赖检测，按序计算并即时更新上下文 | shared/ 表达式引擎 | configs/3.json（自引用） |
| 5 | 类型处理（float/double 保持原值，其他整数类型 Math.floor） | shared/ 或 frame | 代码 |
| 6 | 接收帧解析后立即计算表达式；发送帧组帧前计算表达式 | receive/send feature | 代码调用链 |
| 7 | 11 种数据类型解析规则（含 BigInt 64 位、DataView float/double、bytes ASCII 模式） | frame feature | 配置样本 |
| 8 | 大端/小端字节序 | frame feature | 配置样本 bigEndian |
| 9 | applyFactor（乘以 factor，toFixed(5) 限 5 位小数） | frame feature | 配置样本 factor |
| 10 | 帧识别规则（8 种运算符，AND 逻辑） | frame/receive feature | 帧定义 identifierRules |
| 11 | direct/indirect 数据参与类型 | frame feature | configs/3.json |
| 12 | 四种校验和算法（xor8/sum8/crc16/crc32） | frame feature | 配置样本 validOption |
| 13 | 标签显示（labelOptions 十六进制匹配） | receive feature | 配置样本 |
| 14 | 发送触发条件（5 种操作符，AND/OR 短路逻辑） | send/task feature | TriggerCondition 接口 |
| 15 | SCOE 完成条件（固定值模式 + 参数索引匹配模式，AND 逻辑，定时轮询 + 超时） | 指令接入 feature | scoeReceiveCommands.json |
| 16 | 通用比较运算符（6 种，自动数值/字符串检测） | shared/ | 代码 |
| 17 | SCOE 帧多步骤识别流程 | 指令接入 feature | scoeFrame.ts |
| 18 | SCOE 校验和验证（累加取模 256） | 指令接入 feature | scoeReceiveCommands.json |
| 19 | 错误容错（不崩溃、错误不应用、console.error 记录） | shared/ + 各 feature | 代码 |

### 可排除（非核心或需重新设计）

| # | 行为 | 排除理由 |
|---|------|----------|
| 1 | `new Function` 求值方式 | 实现细节，新系统用 AST/mathjs 替代，保持等价语义即可 |
| 2 | 依赖缓存（5 分钟 TTL、50 条上限、配置哈希） | 性能优化实现细节，新系统自行决定缓存策略 |
| 3 | 计算历史记录（`calculationHistory`，上限 100 条） | 调试辅助，非核心业务行为 |
| 4 | `globalStatsStore` 直接依赖 | 新系统通过 feature public API 间接访问，不直接依赖 store |
| 5 | `scoeStore` 直接依赖 | 新系统通过指令接入 feature public API 访问 |
| 6 | `receiveFramesStore` 直接依赖 | 新系统通过 feature public API 访问 |
| 7 | `frameTemplateStore` 直接依赖 | 新系统通过 frame feature public API 访问 |
| 8 | 表达式中 `extractVariablesFromExpression` 的正则提取方式 | 实现细节，新系统可用 AST 分析替代 |

---

## 后续

无。本调研为纯事实提取，后续由设计/实施对话消费。
