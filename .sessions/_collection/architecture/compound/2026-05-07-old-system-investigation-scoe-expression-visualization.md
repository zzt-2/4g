# 旧系统调研：SCOE、表达式引擎、可视化

> 日期：2026-05-07
> 性质：旧代码事实调研，为新设计提供证据
> 触发：runtime 下一阶段全局规划中识别的三条调研线
> 方法：三个子 agent 并行读旧代码 `src/`，汇总后沉淀

---

## 一、SCOE 代码调研

### 1.1 文件清单

**核心 Store（状态管理）：**
- `src/stores/scoeStore.ts` — SCOE 主状态，卫星配置、网络连接、全局运行时状态
- `src/stores/frames/scoeFrameInstancesStore.ts` — SCOE 帧实例和接收指令管理

**帧处理工具：**
- `src/utils/receive/scoeFrame.ts` — SCOE 帧识别、校验和验证、参数解析、完成条件检查

**指令执行器：**
- `src/composables/scoe/useScoeCommandExecutor.ts` — 接收指令执行总入口
- `src/composables/scoe/commands/index.ts` — 指令执行器导出
- `src/composables/scoe/commands/loadSatelliteId.ts` — 加载卫星 ID
- `src/composables/scoe/commands/unloadSatelliteId.ts` — 卸载卫星 ID
- `src/composables/scoe/commands/healthCheck.ts` — 健康自检
- `src/composables/scoe/commands/linkCheck.ts` — 链路自检
- `src/composables/scoe/commands/sendFrame.ts` — 发送帧
- `src/composables/scoe/commands/readFileAndSend.ts` — 读取文件并发送

**类型定义：**
- `src/types/scoe/index.ts` — SCOE 主要类型
- `src/types/scoe/receiveCommand.ts` — 接收指令类型（参数、完成条件、校验和）

**测试工具：**
- `src/composables/scoe/useScoeTestTool.ts` — 测试数据记录和高亮配置

**UI 组件（略列）：**
- `src/pages/SCOEConfigPage.vue` — 配置主页面
- `src/components/scoe/frame/SCOECompletionConditions.vue` — 完成条件配置
- `src/components/scoe/frame/SCOECommandParams.vue` — 指令参数配置
- `src/components/scoe/frame/SCOEFrameInstanceEditor.vue` — 帧实例编辑器

**集成点：**
- `src/stores/frames/receiveFramesStore.ts:922-1000` — SCOE 帧识别和指令执行硬编码在通用接收流程中

### 1.2 完整数据流

```
接收源（串口/网络）
  ↓
receiveFramesStore.processReceivedData()
  ↓
scoeFrame.ts:isScoeFrame() — 验证功能码（SCOE标识 + 指令码）
  ↓（是 SCOE 帧）
scoeFrame.ts:validateChecksums() — 累加指定范围字节取模256
  ↓（校验通过）
scoeFrame.ts:extractAndResolveParams() — 按偏移/长度提取，转十六进制，匹配参数选项
  ↓
useScoeCommandExecutor.ts:executeCommand() — 策略模式映射到具体执行器
  ↓（6种指令：LOAD/UNLOAD/HEALTH/LINK/SEND_FRAME/READ_FILE_AND_SEND）
执行成功后
  ↓
scoeFrame.ts:waitForCompletionConditions() — 异步轮询检查条件（100ms 间隔）
  ↓（条件满足）
useScoeCommandExecutor.ts:sendSuccessFrame() — 从 globalConfig.successFrameId 获取成功帧并发送
```

### 1.3 "独立帧列表"和"独立条件"的具体实现

#### 独立帧列表

SCOE **没有完全独立的帧定义系统**，而是通过全局帧模板的 `isSCOEFrame` 标记筛选：

```typescript
// scoeFrameInstancesStore.ts:55-66
const availableSendFrames = computed(() => {
  return frameTemplateStore.frames.filter(
    (frame: Frame) => frame.isSCOEFrame && frame.direction === 'send',
  );
});
```

**但 SCOE 有独立的帧实例管理 store**（`scoeFrameInstancesStore.ts`），重复了全局系统的帧实例管理逻辑。

#### 独立条件系统

SCOE **有完全独立的完成条件系统**，不和通用条件匹配共用：

```typescript
// receiveCommand.ts:161-180
interface CompletionCondition {
  id: string;
  label: string;
  sourceFrameId: string;      // 来源帧ID
  sourceFieldId: string;      // 来源字段ID
  useParam: boolean;          // 是否使用参数
  targetParamId?: string;     // 目标参数ID
  targetFixedValue?: string;  // 目标固定值
  operator?: MatchOperator;   // 匹配运算符
  options?: CompletionConditionOption[]; // 参数化条件选项
}
```

条件检查实现在 `scoeFrame.ts:416-491`，支持参数化条件（索引匹配）、固定值条件、多种运算符、超时机制。

### 1.4 可复用模式清单

| 模式 | 位置 | 为什么值得复用 |
|------|------|----------------|
| **策略模式执行器映射** | `useScoeCommandExecutor.ts:80-87`，`Record<ScoeCommandFunction, CommandExecutor>` | 清晰的关注点分离，新指令只需加一个映射条目和执行函数 |
| **统一执行上下文 + 返回值** | `useScoeCommandExecutor.ts:48-59`，`CommandExecutionContext` + `CommandExecutionResult` | 统一的错误处理和日志记录，可测试性强 |
| **异步轮询条件等待** | `scoeFrame.ts:501-540`，`waitForCompletionConditions()` | 不阻塞主流程，支持可配置超时和检查间隔 |
| **分层验证流程** | `receiveFramesStore.ts:922-1000`，帧识别→校验和→参数解析→指令执行→条件检查→回应 | 每层可独立失败，流程清晰，易于调试 |
| **分层状态结构** | `scoeStore.ts:52-82`，`ScoeStatus` | 统计信息完整（接收数/成功数/错误数/运行时长） |

### 1.5 需要消灭的问题清单

| 问题 | 位置 | 为什么必须消灭 |
|------|------|----------------|
| **跨 store 循环依赖** | `receiveFramesStore.ts:117-131`，延迟初始化 `let scoeStore = null` 再按需 `useScoeStore()` | 循环依赖说明架构有问题，receive 不应直接依赖 SCOE |
| **重复帧实例管理** | `scoeFrameInstancesStore.ts` 完整复制了帧实例管理逻辑 | SCOE 帧本质是带标记的普通帧，两套系统容易不一致 |
| **SCOE 逻辑硬编码在通用接收流程** | `receiveFramesStore.ts:922-1000` | 违反开闭原则，加新协议要改核心代码 |
| **校验和逻辑散落** | `scoeFrame.ts:310-358` | 校验和是通用需求，应提取可复用工具 |
| **`Record<string, unknown>` 传参** | `useScoeCommandExecutor.ts:58` | 类型不安全，运行时容易出错 |
| **测试工具耦合核心 store** | `scoeStore.ts:24-39`，直接解构 `useScoeTestTool()` | 测试工具不应在生产代码中 |

---

## 二、表达式引擎调研

### 2.1 文件清单

**核心实现（1385行）：**
- `src/composables/frames/useExpressionCalculator.ts` (511行) — 表达式计算器核心，求值引擎 + 依赖分析 + 拓扑排序
- `src/composables/frames/useFrameExpressionManager.ts` (541行) — 帧表达式管理器，发送/接收帧表达式计算流程和依赖缓存
- `src/utils/frames/fieldValidation.ts` (333行) — 表达式验证工具，循环依赖检测 + 语法校验

**类型定义：**
- `src/types/frames/fields.ts` — `ExpressionConfig`、`VariableMapping`、`ConditionalExpression`

**调用场景：**
- `src/components/frames/FrameSend/FrameInstanceEditor.vue` — 发送帧编辑时计算表达式
- `src/composables/frames/sendFrame/useUnifiedSender.ts` — 发送前计算表达式
- `src/stores/frames/receiveFramesStore.ts` — 接收数据后计算表达式

### 2.2 求值流程

**输入：**

```typescript
ExpressionConfig {
  expressions: ConditionalExpression[]  // 多条件表达式
  variables: VariableMapping[]           // 变量映射
}

CalculationContext {
  frameId: string
  frameData: Map<string, unknown>                    // 当前帧字段数据
  allFrameData: Map<string, Map<string, unknown>>    // 所有帧数据（跨帧引用）
}
```

**4 种数据源类型：**

```typescript
enum DataSourceType {
  CURRENT_FIELD = 'current_field',   // 当前帧字段（含自引用）
  FRAME_FIELD = 'frame_field',       // 其他帧字段
  GLOBAL_STAT = 'global_stat',       // 全局统计数据
  SCOE_DATA = 'scoe_data'           // SCOE 数据
}
```

**求值方式：** 使用 `new Function(...keys, 'return (expression)')` 构造函数动态求值，支持 `Math.sin/cos/tan/sqrt/log/exp/pow/abs/floor/ceil/round/max/min`。

**多条件表达式：** 按顺序执行第一个 condition 为真的表达式。

**输出：**

```typescript
CalculationResult {
  success: boolean
  value: unknown
  error?: string
  usedVariables?: Record<string, unknown>
}
```

### 2.3 变量顺序问题分析

**根因：** 原始实现并行计算所有表达式字段，字段 A 依赖字段 B 时可能用到 B 的旧值。

**已实现修复（拓扑排序）：**

```typescript
// Kahn 算法拓扑排序
const topologicalSort = (dependencies: Map<string, Set<string>>) => {
  // 1. 构建依赖图和入度表
  // 2. 找到入度为0的节点作为起点
  // 3. BFS遍历
  // 4. 检测循环依赖
}
```

**缓存策略：** 依赖分析结果缓存 5 分钟，通过 `configHash` 检测配置变更自动失效，LRU 最多 50 项。

**容错：** 循环依赖时回退到原有并行计算模式。计算后立即 `frameData.set(fieldId, processedValue)` 更新上下文供后续使用。

### 2.4 性能分析

| 场景 | 频率 | 路径 | 瓶颈风险 |
|------|------|------|----------|
| **接收帧字段计算** | 高频（每帧1次，可达每秒数十次） | `receiveFramesStore` → `calculateReceiveFrameExpressions()` | **高** — 高速接收时主线程压力 |
| **发送帧参数计算** | 中频（每次发送前1次） | `useUnifiedSender` → `calculateAndApplySendFrame()` | 低 |
| **编辑器实时预览** | 低频（用户输入时） | `FrameInstanceEditor.vue` → `calculateAllExpressions()` | 低 |

**已有优化：**
- `new Function` 替代 `eval`
- 数学函数直接绑定（`abs: Math.abs`），避免 `Math.` 前缀查找
- 依赖分析缓存，避免重复拓扑排序

**缺失：**
- 无预编译机制
- 无表达式级缓存（相同表达式+相同输入不会跳过）
- 无批量计算优化

### 2.5 使用场景地图

| 场景 | 是否使用 | 说明 |
|------|----------|------|
| 接收帧字段计算 | 是（核心高频） | 帧内字段间的计算关系 |
| 发送帧参数计算 | 是 | 发送前动态计算参数值 |
| SCOE 数据引用 | 是 | 通过 `SCOE_DATA` 数据源类型 |
| 条件判断 | 部分 | 通过 `condition` 字段实现 |
| 报告生成 | 否 | 未发现直接调用 |
| 触发器条件 | 否 | 有独立的 trigger check 逻辑 |
| 历史数据分析 | 否 | 使用独立的计算逻辑 |

### 2.6 给新 shared/ 表达式引擎的教训

**必须避免：**

| 教训 | 根因 |
|------|------|
| 并行计算导致顺序问题 | 有依赖的表达式必须按拓扑序串行执行 |
| `eval` 或不加约束的 `new Function` | 安全性和性能都不好 |
| 忽略循环依赖 | 必须检测并明确处理（报错或回退） |
| 硬编码数据类型转换 | `processValueByDataType` 应可配置 |
| 表达式引擎持有状态或依赖 store | 引擎必须是纯函数，调用方传参 |

**值得借鉴：**

| 模式 | 说明 |
|------|------|
| Kahn 算法拓扑排序 | 实现清晰，性能好，O(V+E) |
| `ConditionalExpression` 设计 | 灵活支持复杂条件逻辑 |
| `configHash + timestamp` 缓存失效 | 合理的缓存策略 |
| 循环依赖回退安全模式 | 不崩溃，有明确降级 |
| 数学函数简化绑定 | `abs` 而非 `Math.abs`，表达式更简洁 |

**架构建议：**
- 解析和求值分离（解析可缓存，求值每次执行）
- 支持插件式扩展数据源类型和数学函数
- 考虑预编译优化（高频表达式预编译成函数）
- 零 Vue/Pinia/Electron 依赖，纯 TypeScript

---

## 三、可视化 + 星座图调研

### 3.1 文件清单

**核心图表组件：**
- `src/components/frames/receive/DataDisplay/SpecialConstellationChart.vue` — 星座图，ECharts scatter 实现
- `src/components/common/UniversalChart.vue` — 通用折线图，实时/历史双模式，ECharts line
- `src/components/frames/receive/DataDisplay/DataTable.vue` — 数据表格，500ms 定时更新

**状态管理：**
- `src/stores/frames/dataDisplayStore.ts` (1074行) — 核心状态管理，含循环缓冲区、星座图数据、定时器编排
- `src/stores/frames/receiveFramesStore.ts` — 接收帧数据源

**配置与控制：**
- `src/components/frames/receive/DataDisplay/ScatterPlotConfigDialog.vue` — 星座图配置（I/Q 数据源、位宽、采样数、刷新间隔）
- `src/components/common/UniversalChartSettingsDialog.vue` — 通用图表设置（Y轴、性能配置）
- `src/components/frames/receive/DataDisplay/DataDisplayContainer.vue` — 双面板容器

**类型定义：**
- `src/types/frames/dataDisplay.ts`
- `src/types/storage/historyData.ts`

### 3.2 可视化架构全景

**数据流链路：**

```
接收源（串口/网络）
  ↓
receiveFramesStore.handleReceivedData() — 解析与分组
  ↓
dataDisplayStore.collectCurrentData() — 1秒间隔定时收集
  ↓
CircularBuffer<DataRecord> — 容量动态调整（0图表:1000, 1图表:5000, 2图表:3000）
  ↓
historyUpdateCounter++ → Vue watch 触发
  ↓
UniversalChart.updateRealtimeChartData() — 窗口裁剪 + 采样
  ↓
ECharts.setOption() 增量更新（silent: true, lazyUpdate: true）
```

**星座图专用数据流：**

```
接收帧 hex 数据
  ↓
extractValuesFromHex() — 按位宽解析，支持有符号数
  ↓
collectConstellationFieldData() — 收集 I/Q 数据
  ↓
constellationData 缓存（iValues[], qValues[]）
  ↓
定时刷新（refreshInterval，默认 1000ms）
  ↓
getConstellationData() — 组合 [I, Q] 点对
  ↓
SpecialConstellationChart ECharts scatter 渲染（animation: false）
```

### 3.3 星座图专项分析

**数据结构：**

```typescript
interface ConstellationConfig {
  bitWidth: number;           // 默认 12
  sampleCount: number;        // 默认 16（每帧点数）
  pointSize?: number;         // 默认 3
  iDataSource?: { frameId: string; fieldId: string };
  qDataSource?: { frameId: string; fieldId: string };
  refreshInterval?: number;   // 默认 1000ms
}
```

**数据量控制策略：**

| 策略 | 实现 | 评价 |
|------|------|------|
| 每帧采样点数限制 | `sampleCount`（默认 16），I 取前半、Q 取后半 | 合理 |
| 数据清理 | 每次刷新后清空缓存 `refreshConstellationData()` → `clearConstellationData()` | 短期OK，长期无上限 |
| 无最大累积点数 | `iValues/qValues` 持续累积直到下次刷新清空 | **隐患：高频场景累积量大** |

**关键发现：星座图没有长期数据量上限。** 高频帧 + 长刷新间隔 = 内存累积。刷新清空机制只解决显示层，不解决持续运行时的内存管理。

### 3.4 表格/折线图分析

| 组件 | 更新机制 | 更新频率 | 可配置 |
|------|----------|----------|--------|
| DataTable | 本地 `ref` + `setInterval` | 500ms（硬编码） | 否 |
| UniversalChart | Vue `watch` 监听 `historyUpdateCounter` | 由 `collectCurrentData()` 1秒间隔驱动 | 间接受 `PerformanceConfig` 控制 |

**折线图性能配置：**

```typescript
interface PerformanceConfig {
  maxDataPoints?: number;            // 默认 500（实时），1000（历史）
  updateInterval?: number;           // 默认 1000ms
  enableIncrementalUpdate?: boolean; // 默认 true
  enableSampling?: boolean;          // 默认 true
  samplingInterval?: number;         // 默认 2（每2点取1）
}
```

**已有优化：**
- 循环缓冲区 `CircularBuffer<T>`，容量按活跃图表数动态调整
- 数据窗口裁剪 `applyDataWindow(data, maxPoints)`
- 数据采样 `applySampling(data, interval)`
- ECharts 增量更新 `silent: true, lazyUpdate: true`
- 时间格式化缓存 `Map<number, string>`（最多 10000 条）
- hex 转换缓存 `Map<string, string>`（最多 1000 条）
- 延迟清理机制（10 秒一次）

### 3.5 给新 visualization feature 的教训

**必须避免：**

| 问题 | 说明 |
|------|------|
| 表格硬编码 500ms 定时器 | 无法配置，资源浪费 |
| 星座图无长期数据量上限 | 高频帧 + 长刷新 = 内存泄漏 |
| 多层定时器嵌套 | 数据收集1秒 + 星座图刷新可配 + 表格500ms，难以协调 |
| 性能监控代码被注释 | `performance.now()` 大量注释掉，无法诊断瓶颈 |
| hex 缓存大小固定 1000 | 高频场景缓存命中率下降 |

**值得借鉴：**

| 模式 | 说明 |
|------|------|
| `CircularBuffer<T>` 循环缓冲区 | 自动覆盖旧数据，容量动态调整，高效内存管理 |
| ECharts 增量更新 | `notMerge: false, silent: true, lazyUpdate: true` |
| 时间格式化批量缓存 | `formatTimestampsBatch()` + Map 缓存 |
| 单次遍历优化 | 同时处理时间戳和所有系列数据 |
| 配置持久化 | `useStorage` 持久化性能配置和星座图配置 |

**架构建议：**
- 统一数据流驱动（单一定时器 + 事件分发），替代多定时器嵌套
- 分层抽象：数据层（缓冲区+清理）→ 业务层（转换/采样/窗口）→ 渲染层（ECharts 配置+增量更新）
- 每个可视化组件明确最大数据点数，长期运行有兜底清理
- 性能监控内置且可开关

---

## 四、三条调研线的交叉发现

### 4.1 共性问题

1. **跨 store 直连**：SCOE → receiveFramesStore 直接调用；表达式引擎从 `allFrameData`（receive store 状态）直接读。新架构的 selector + service 调用方式必须严格执行。

2. **定时器散落**：SCOE 有条件轮询（100ms），表达式有缓存过期（5分钟），可视化有数据收集（1s）+ 表格更新（500ms）+ 星座图刷新（可配）。新系统需要统一的定时器管理策略。

3. **缺乏统一的条件匹配基础设施**：SCOE 有独立完成条件，表达式引擎有 `condition` 字段，任务系统有触发条件——三套独立实现。新架构已决策条件匹配分两层（shared/ 纯函数匹配 + 各 feature 自管触发），但实现时必须确保匹配层真正共享。

### 4.2 关键复用机会

| 共用件 | 当前散落位置 | 新归属 |
|--------|-------------|--------|
| 拓扑排序 | `useExpressionCalculator.ts` | `shared/expression/` |
| 条件匹配逻辑 | SCOE `CompletionCondition` + 表达式 `condition` + 任务触发 | `shared/condition/` |
| 校验和计算 | `scoeFrame.ts` 内部 | `shared/checksum/` |
| 循环缓冲区 | `dataDisplayStore.ts` 内部 | `shared/buffer/` |
| hex 解析（位宽+有符号） | `extractValuesFromHex()` | `shared/parse/` |

### 4.3 对下一阶段设计的输入

1. **指令接入 feature**：SCOE 的策略模式执行器 + 统一上下文/返回值设计可直接复用。SCOE 的独立帧列表和独立条件必须消灭——帧走全局 `frame feature`，条件走 `shared/condition/`。

2. **shared/ 表达式引擎**：拓扑排序已验证可行，但新引擎必须纯函数化、去掉 store 依赖、支持预编译。4 种数据源类型的设计可保留，但变量收集改由调用方负责。

3. **visualization feature**：星座图的特殊性（高数据量、采样点累积）需要独立的数据管道设计，不能和普通参数用同一条路。循环缓冲区是验证过的好模式。
