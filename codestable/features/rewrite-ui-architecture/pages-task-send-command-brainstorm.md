# 任务域 + 发送 + 指令接入页面 Brainstorm

## 元数据

- **类型**: brainstorm（事实 + 分析 + 自检）
- **直接合同**: rewrite-ui-architecture-design.md, rewrite-frontend-conventions.md
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, rewrite-frontend-checklist.md, 旧系统发送/任务/SCOE页面行为, pages-frame-connection-brainstorm.md
- **日期**: 2026-05-12
- **决策状态**: 修正中（首轮审阅后用户纠正了任务和指令接入的页面架构）
- **纠正记录**:
  - 任务从"嵌入发送页面对话框"纠正为"完全独立页面 /tasks"
  - 指令接入从"模式C单栏居中"纠正为"Tab 分区结构"
  - 补充参照 `2026-05-07-runtime-next-phase-global-planning.md` 全局规划

---

## 一、事实层

### 1.1 Send Feature 代码现状

**Public API**:

| 类别 | API | 用途 |
|------|-----|------|
| Service | `SendService.execute(SendRequest): Promise<SendResult>` | 执行发送 |
| Service | `SendService.resetStats()` | 重置统计 |
| Reader | `SendReader.getSnapshot/getStatistics/listResults/getStatus` | 只读查询 |
| Selector | `selectSendSnapshot/selectSendStatistics/selectSendResults/selectSendStatus` | 状态快照 |

**关键类型**:
- `SendRequest`: { frameId, targetId, userFieldValues?, variables?, context? }
- `SendResult`: { kind: SendResultKind, requestRef, bytesBuilt, bytesSent, timestamp, error?, buildIssues }
- `SendResultKind`: 'sent' | 'build-error' | 'target-unavailable' | 'transport-error' | 'timeout' | 'cancelled'
- `SendStatisticsSnapshot`: { totalRequests, totalSent, totalErrors, totalBytesSent, byFrame, byTarget, byResultKind, lastSendAt? }

**内部代码（UI 需要 re-export）**:
- `buildFrame(SendBuildInput)` → `FrameBuildOutput` — 帧构建纯函数
- `resolveFieldValues(fields, userValues, varProvider, vars)` — 字段值解析（内部调用 evaluateFieldExpressions）
- `evaluateFieldExpressions(field, mergedVariables)` — 单字段表达式求值（预览实时计算用）
- `frameToBuildInput(frame)` — 帧定义转构建输入
- `applyFactor(fields, values)` — 因子转换
- `applyBuildPostPatch(bytes, fields, options)` — 校验和回填

**Adapter ports**:
- `SendFrameReader`: getFrame(frameId) → ReadonlyFrameAsset
- `SendTargetResolver`: resolveTarget(targetId) → TransportTargetSnapshot
- `SendTransportWriter`: writeBytes(connectionId, bytes) → Promise<outcome>
- `SendVariableProvider`: getVariables() → VariableMap

### 1.2 Task Feature 代码现状

**Public API**:

| 类别 | API | 用途 |
|------|-----|------|
| Service | `TaskService.createTask(def): TaskInstanceState` | 创建任务 |
| Service | `TaskService.startTask/pauseTask/resumeTask/stopTask/removeTask` | 生命周期 |
| Service | `TaskService.onSettled(instanceId): Promise<void>` | 等待终止 |
| Reader | `TaskReader.getSnapshot/getInstance/getProgress/getStatistics` | 只读查询 |
| Selector | `selectTaskInstances/Instance/Progress/History/Statistics/Snapshot` | 状态快照 |

**关键类型**:
- `TaskDefinition`: { id, name, steps: TaskStepDefinition[], schedule: ScheduleDriver, stopCondition?, fieldVariations?, errorPolicy }
- `TaskStepDefinition`: SendStepDefinition | WaitConditionStepDefinition | DelayStepDefinition
- `ScheduleDriver`: { kind: 'immediate' } | { kind: 'timer', intervalMs } | { kind: 'event', conditions, cooldownMs? }
- `TaskLifecycleStatus`: 'created' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
- `TaskProgress`: { stepsTotal, stepsCompleted, stepsFailed, stepsSkipped, iterationsCompleted, iterationsTotal, elapsedMs, estimatedRemainingMs? }
- `ConditionTerm`: { frameId, fieldId, operator, threshold, sourceId?, logicOperator? }
- `ComparisonOperator`: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'change' | 'any'
- `FieldVariation`: { fieldId, values[] }
- `TaskErrorPolicy`: { onFailure: TaskErrorAction, retryCount?, retryDelayMs? }

### 1.3 Command-ingress Feature 代码现状

**Public API**:

| 类别 | API | 用途 |
|------|-----|------|
| Service | `createCommandIngressService(opts) → { adapter, dispose() }` | 创建服务 |
| Selector | `selectCommandIngressSnapshot/selectScoeStatistics/selectScoeRuntimeStatus` | 状态快照 |
| Selector | `selectScoeFramesLoaded/selectLoadedSatelliteId` | 加载状态 |
| Handler | 6 个命令处理器 | load/unload/health/link/send/read-file |

**关键配置类型**:
- `ScoeGlobalConfig`: { scoeIdentifier, tcpServerIp/Port/AutoConnect, udpIpAddress/Port/udpTargetId, messageIdentifierOffset, sourceIdentifierOffset, destinationIdentifierOffset, modelIdOffset, satelliteIdOffset, functionCodeOffset, successFrameId? }
- `SatelliteConfig`: { satelliteId, messageIdentifier, sourceIdentifier, destinationIdentifier, modelId, commandConfigs[] }
- `ScoeCommandConfig`: { id, label, code, function, checksums[], params?[], frameMappings?[], completionConditions?[], completionTimeout?, successFrameId?, sendInterval? }
- `ScoeCommandParam`: { id, label, value, type, offset, length, targetInstanceId?, targetFieldId?, options[] }
- `ScoeCommandFrameMapping`: { frameId, instanceId, label?, description?, targetId, fieldMappings[] }
- `CompletionConditionConfig`: { id, label, sourceFrameId, sourceFieldId, useParam, targetParamId?, targetFixedValue?, operator?, options?[] }
- `CommandIngressState`: { commandReceiveCount, commandSuccessCount, commandErrorCount, loadedSatelliteId, scoeFramesLoaded, healthStatus, linkTestResult, lastCommandCode, lastErrorReason, runtimeSeconds, satelliteIdRuntimeSeconds, globalConfig, activeCommandConfigs }

### 1.4 旧系统发送页面行为

**发送页面（10 个功能域）**:

1. **发送目标选择**: SendTargetSelector 下拉，显示连接状态、类型图标、描述
2. **帧格式列表（左栏 240px）**: 分组（收藏/全部）、搜索、选中高亮、双击创建实例、收藏切换
3. **帧实例表（中栏）**: 序号/编号/名称/参数数/发送次数/上次发送/备注/操作（复制/删除）、拖拽排序、批量编辑（复选框+批量删除）
4. **帧预览面板（右栏 300px）**: 实例信息 + 十六进制帧 + 可配置字段表
5. **实例编辑器对话框**: 实例ID、备注、字段分组（可调字段蓝色/计算参数橙色/不可配置灰色）、输入控件（文本框/下拉/单选/表达式）
   - **旧问题（design 阶段必须解决）**: 视觉差、交互不好用、代码质量烂、**表达式字段不会随依赖字段变化自动重新计算**
6. **定时发送对话框**: 间隔+次数+无限循环+进度条+开始/停止
7. **触发发送对话框**: 条件触发（响应延时/监听来源/触发帧/条件列表/逻辑操作符/继续监听）+ 时间触发（执行时间/重复规则/间隔/结束时间）
8. **顺序发送对话框**: 策略选择（立即/定时/触发/可变参数）、实例序列表（添加/上移/下移/移除/目标/延时/状态）、可变参数配置（字段/值列表/文件加载 .txt/.csv）
9. **活动任务监视器**: 对话框、类型+状态筛选、卡片列表、进度条+百分比+运行时长+错误信息、操作按钮（暂停/恢复/停止/重试）
10. **导入导出**: 任务配置 JSON 导入导出

### 1.5 旧系统 SCOE 页面行为

1. **全局配置表单**: SCOE标识、TCP（IP+端口+自动连接）、UDP（IP+端口）、6个偏移、成功帧选择、连接/断开按钮、加载/卸载卫星按钮、保存按钮
2. **卫星配置列表**: 搜索框（实时过滤卫星ID/配置ID）、列表项（卫星ID+配置ID+不完整警告）、复制/删除、添加、导入导出
3. **命令配置对话框**: 左右分栏（帧实例列表+编辑器）、功能码选择、参数配置（标签/类型/偏移/长度/目标帧/目标字段/选项列表）、完成条件配置（字段/操作符/值/选项列表）、帧实例配置（发送间隔/帧选择/实例列表/目标/可配置字段）
4. **状态面板（10个统计卡片）**: 累计秒、卫星运行秒、指令接收总数（蓝色）、成功总数（绿色）、出错数（红色）、最后功能码、错误原因、已加载卫星ID、健康状态（动态图标）、链路自检（动态图标）
5. **测试工具**: 收发数据区（开始/停止/清空/高亮配置）、HEX记录列表（时间戳+高亮+校验标记）、发送区（行数+HEX输入+发送按钮）、高亮配置对话框

### 1.6 旧系统执行监控关键发现

- **无独立日志系统**: 只有 console.log
- **无独立执行历史**: 任务完成后直接删除
- **7种任务状态**: idle/running/paused/completed/error/waiting-trigger/waiting-schedule
- **进度展示**: 线性进度条 + 百分比 + 当前/总数
- **错误展示**: 内联（红色文本）+ 面板（红色错误框）+ 通知（$q.notify）
- **性能机制**: Map 状态索引（O(1)查询）、进度缓存（1秒同步）

### 1.7 B1 对齐关键约束

| 维度 | B1 标准 | 本组适用 |
|------|---------|---------|
| 布局模式 | 模式A/B/C | 发送页用模式B（三栏），任务页用模式A（主从双栏），指令接入3 Tab（SCOE运行与测试/SCOE配置/中心对接） |
| Widget | DataTable(P0)/StatusBadge(P1)/TableToolbar(P1)/SendTargetSelector(P1)/FrameSelector(P1) | 本组全部消费 |
| 编辑保存 | 页面级 sticky bar 或 对话框级 QDialog | 发送页/指令接入页用对话框级 |
| 删除确认 | $q.dialog() | 统一 |
| 操作反馈 | $q.notify() | 统一 |
| 空状态/loading | 所有列表/表格显式处理 | 统一 |
| 状态展示 | StatusBadge（动态）+ QChip（固定） | 任务状态用 StatusBadge |
| 虚拟滚动 | 行数≤1000 用 QTable virtual-scroll | 帧实例表、卫星列表 |

---

## 二、决策层

### 页面 1: 帧发送页面 (/frames/send)

**D-S1 布局**: 模式B（三栏固定+弹性）

```
┌──────────┬─────────────────────┬─────────────────┐
│ 左栏240px │ 中栏(flex:1)        │ 右栏300px        │
│ 帧格式列表 │ 帧实例表             │ 预览面板+发送操作 │
└──────────┴─────────────────────┴─────────────────┘
```

**D-S2 左栏帧格式列表**:
- QList + 分组标题（收藏/全部）
- QInput dense 搜索（实时过滤，无 debounce）
- 数据源: `frame.listFrameAssetSummaries(source, { direction: 'send', query, favoriteOnly? })`
- 单击选中 → 中栏创建实例 + 右栏显示预览
- 双击 → 创建实例并打开编辑对话框
- 收藏按钮: toggle isFavorite

**D-S3 中栏帧实例表**:
- DataTable Widget（P0）+ virtual-scroll
- 列: 序号/名称/参数数/发送次数/上次发送/备注/操作(编辑/复制/删除)
- 行选中: QTable selection="single"
- 排序: 上下移动按钮（本期不做拖拽，降低复杂度）
- 批量编辑: selection="multiple" 模式 + 批量删除按钮
- 数据源: **新建 `useSendInstances` composable**（UI 侧帧实例状态）

**D-S4 右栏预览面板**:
- 上部: 实例基本信息（名称/时间/备注）
- 中部: 十六进制帧显示（pre/code font-mono）
- 下部: 可配置字段表（字段名 | 十六进制值）
- 底部: SendTargetSelector + 发送按钮 + 高级发送入口（定时/触发）
- 数据源: **新建 `useFramePreview` composable**，调用 buildFrame 纯函数链

**D-S5 帧实例数据模型（新增 UI 侧类型）**:

```typescript
interface SendFrameInstance {
  readonly instanceId: string;
  readonly frameId: string;
  readonly name: string;
  readonly description?: string;
  readonly userFieldValues: Record<string, SendFieldValue>;
  readonly sendCount: number;
  readonly lastSendAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

归口: `features/send/composables/`，不进 core/service 层

**D-S6 单帧发送流程**:
- 用户选中实例 + 选择目标 → `sendService.execute({ frameId, targetId, userFieldValues, context: { source: 'user' } })`
- 成功: $q.notify('positive')
- 失败: $q.notify('negative') + 展示 buildIssues

**D-S7 发送页定位（用户纠正后）**:
- 发送页面只做**单帧快速发送**和帧实例管理
- 定时发送、触发发送、顺序发送、任务监控全部在任务页面(/tasks)操作
- 发送页不需要跳转到任务页的入口

**D-S8 已移除/简化的功能**:

| 功能 | 决策 | 原因 |
|------|------|------|
| 定时/触发/顺序发送对话框 | ❌ 移至任务页面 | 任务是独立功能域，不在发送页管理 |
| 任务监控对话框 | ❌ 移至任务页面 | 任务页面有完整的监控+历史 |
| 拖拽排序 | ⚠️ 简化为上下移动按钮 | 降低实现复杂度，二期补齐 |
| 批量发送 API | ❌ 不需要 | 顺序发送通过 Task steps 实现 |

### 页面 3: 指令接入页面 (/command-ingress) — 用户纠正结构

> **纠正历史**:
> - 首轮用模式C单栏居中，用户指出内容太多需要 Tab 分区
> - 二轮改为3 Tab（配置管理/运行状态/测试工具），但未考虑甲方对接
> - 三轮改为4 Tab，用户指出测试工具应与 SCOE 总览合并，甲方对接需立即设计
> - 最终确认为 3 Tab 结构

**D-CI1 布局**: 3 Tab 结构（QTab），页面标题栏固定

```
┌──────────────────────────────────────────────────────────────────┐
│ 指令接入   [连接/断开] [加载/卸载] [保存配置]                      │
├──────────────────────────────────────────────────────────────────┤
│ [SCOE 运行与测试] │ [SCOE 配置] │ [中心对接]                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  当前 Tab 内容区                                                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**D-CI2 Tab 1: SCOE 运行与测试**（默认首页，90% 使用时间）:
- 上部: 统计面板
  - grid 5列×2行统计卡片（累计秒/卫星秒/接收总数/成功总数/出错数/最后功能码/错误原因/已加载卫星/健康状态/链路自检）
  - 健康状态/链路自检: StatusBadge，颜色动态映射
  - 数据源: `selectCommandIngressSnapshot` / `selectScoeStatistics` / `selectScoeRuntimeStatus`
  - 刷新: rAF + cadence 1000ms
- 下部: 左右分栏
  - 左侧(flex:1): 命令执行日志 DataTable（时间/功能码/结果/耗时）
  - 右侧(固定宽度): 测试工具
    - 接收区: 工具栏(高亮/开始/停止/清空) + HEX记录列表(时间戳+高亮+校验标记)
    - 发送区: HEX输入框 + 发送按钮 + 发送记录
    - 高亮配置: QDialog（规则列表：起始位置/长度/标签/颜色）
    - 需要: DataRecorder 服务 + 高亮计算器

**D-CI3 Tab 2: SCOE 配置**（设置阶段，低频）:
- 主从双栏布局
  - 左侧(280px): 卫星配置列表
    - DataTable + TableToolbar搜索
    - 复制/删除/添加 + 导入导出
  - 右侧(flex:1): 选中卫星的编辑区
    - 上部: 全局配置（可折叠 QCard）
      - SCOE标识 / TCP配置(IP+端口+自动连接) / UDP配置(IP+端口) / 偏移配置(6项, grid-3-col) / 成功帧选择
    - 卫星基本信息: messageIdentifier / sourceIdentifier / destinationIdentifier / modelId
    - 命令配置列表: QExpansionItem 展开/折叠
      - 展开时显示完整编辑区: 功能码 / 校验和配置 / 参数配置 / 帧映射配置 / 完成条件 / 超时
      - 折叠时只显示标题和操作按钮
      - 不再使用 90vw 大对话框

**D-CI4 Tab 3: 中心对接**（甲方 HTTPS 接口管理）:

```
┌──────────────────────────────────────────────────────────────────┐
│ [HTTPS: 状态] [心跳: 状态] [设备: 状态]  [对接配置] [任务上报]    │
├──────────────────────────────────────────────────────────────────┤
│ [任务列表] │ [设备列表]                                           │
├──────────────────────────────────────────────────────────────────┤
│ DataTable: 已下发任务                                              │
│ 任务ID | 用例数 | 状态 | 下发时间 | 操作                          │
│ T-001  | 5     | 执行中| 14:30   | [详情] [停止]                 │
└──────────────────────────────────────────────────────────────────┘
```

- 工具栏: 连接状态指示(HTTPS/心跳/设备注册) + [对接配置]按钮 + [任务上报]按钮
- 内部 Tab: 任务列表 | 设备列表（预留）
- 任务列表: DataTable，已从甲方接收的任务，操作列含[详情][停止]
- [详情] → QDialog，复用任务页执行监控组件（D-T5），附加用例上报状态
- [对接配置] → QDialog: HTTPS地址/端口/设备标识/心跳间隔/认证信息
- [任务上报] → QDialog: 从 TaskDefinition 列表多选 → 上报给甲方，上报后甲方才能下发对应任务
- 设备列表 Tab: 预留，根据实际接口（设备列表查询/设备信息上报）设计

**甲方交互主流程**:
1. 操作员在任务页创建 TaskDefinition
2. 在中心对接 Tab 点击[任务上报]，选择任务上报给甲方
3. 甲方通过测试任务下发(接口13)指定任务
4. command-ingress HTTPS adapter 接收 → 翻译为 TaskDefinition → task 引擎执行
5. 每个用例完成 → 自动上报结果(接口19)
6. 全部完成 → JSON 报告交付

**与任务页的关系**: 任务页(/tasks)展示用户自建任务；中心对接 Tab 展示甲方下发任务。两者复用执行监控组件，但上下文独立。

**D-CI5 已移除/简化的功能**:

| 功能 | 决策 | 原因 |
|------|------|------|
| WebSocket 连接类型 | ❌ 移除 | 新系统 TransportConfig 无 WebSocket |
| 运行时配置热更新 | ⚠️ 简化 | 保存后需重启连接生效 |
| 命令配置 90vw 大对话框 | ❌ 移除 | 改为右侧面板内展开折叠，降低嵌套深度 |

### 页面 2.5: 任务管理页面 (/tasks) — 用户纠正新增

> **纠正**: 首轮 brainstorm 将任务降级为发送页面对话框，与全局规划中 task = 通用执行引擎的定位冲突。用户确认任务应为完全独立页面。

**D-T1 定位**: 任务是通用执行引擎的完整管理界面，不是发送的附属功能

**D-T2 布局**: 模式A（主从双栏）— 左侧任务列表 + 右侧任务详情/编辑

```
┌──────────────────────────────────────────────────────────────────┐
│ 任务管理  [新建任务] [导入] [导出]                                │
├──────────────────────┬───────────────────────────────────────────┤
│ 任务列表(flex:1)      │ 详情/编辑面板(固定宽度)                   │
│                      │                                           │
│ TableToolbar(搜索+筛选)│ 未选中: 空状态                           │
│ DataTable Widget     │ 已选中(定义态): 任务编辑器                 │
│  名称|类型|状态|进度|操作│  基本信息 + 步骤编辑器 + 调度配置        │
│                      │  + 停止条件 + 错误策略                    │
│ 状态筛选 QChips:     │                                           │
│  待启动|运行中|已完成|失败│ 已选中(运行态): 执行监控                │
│                      │  StatusBadge + 进度条 + 步骤状态          │
│                      │  + 操作按钮(暂停/恢复/停止)               │
│                      │  + 步骤结果详情                            │
│                      │                                           │
│ Tab: 活动任务 | 历史记录│                                          │
└──────────────────────┴───────────────────────────────────────────┘
```

**D-T3 任务列表区**:
- Tab 切换: 活动任务 | 历史记录
- DataTable Widget + virtual-scroll
- 活动任务列: 名称 / 调度类型(immediate/timer/event) / 状态 / 进度 / 操作(暂停/恢复/停止)
- 历史记录列: 名称 / 调度类型 / 结果 / 耗时 / 完成时间 / 操作(查看详情/重新执行/删除)
- 状态筛选: QChip 组（全部/待启动/运行中/已暂停/已完成/失败）
- 数据源: `selectTaskInstances/Snapshot` + `selectTaskHistory`

**D-T4 任务编辑器（右侧面板）**:
- 基本信息: 任务名称(QInput) + 调度类型(QSelect: immediate/timer/event)
- 调度配置: 按 schedule.kind 动态渲染
  - timer: 间隔(QInput) + 次数(QInput) + 无限循环(QToggle)
  - event: 条件编辑器（ConditionTerm 列表）
- 步骤编辑器: 步骤列表 + 添加步骤按钮
  - 每步: 类型选择(send/wait-condition/delay) + 展开/折叠配置
  - SendStep: 帧选择(FrameSelector) + 目标(SendTargetSelector) + 字段值编辑 + 发送后延时 + 可选重复配置
  - WaitConditionStep: 条件列表 + 超时 + 超时策略
  - DelayStep: 持续时间
- 高级配置（折叠面板）:
  - 可变参数: FieldVariation 编辑器
  - 停止条件: maxIterations / maxDurationMs / exitCondition
  - 错误策略: onFailure / retryCount / retryDelayMs
- 操作: [保存] [启动] [取消]

**D-T5 执行监控（右侧面板，运行态）**:
- 任务状态: StatusBadge + 名称
- 进度: QLinearProgress + 文字(stepsCompleted/stepsTotal, iterationsCompleted/iterationsTotal)
- 耗时: elapsedMs 格式化显示
- 步骤状态列表: 每步 StatusBadge + 结果摘要
- 操作按钮: 暂停/恢复/停止（停止需 $q.dialog() 确认）
- 错误信息: TaskInstanceState.error 显示

**D-T6 发送页面与任务页面的关系**:
- 两个页面独立运作，无跳转依赖
- 发送页面(/frames/send): 只做**单帧快速发送** + 帧实例管理 + 帧预览
- 任务页面(/tasks): 完整的任务 CRUD + 执行监控 + 历史记录，SendStep 有独立的字段值编辑（方案 A：copy-on-create）
- 两个页面共享字段编辑 Widget 组件，但数据各自独立

**D-T7 任务状态映射**:

| 旧状态 | 新状态 | StatusBadge | 补充 UI 标记 |
|--------|--------|-------------|-------------|
| idle | created | grey "待启动" | 无 |
| running | running | positive "运行中" | 无 |
| paused | paused | warning "已暂停" | 显示暂停原因 |
| completed | completed | positive "已完成" | 显示总耗时 |
| error | failed | negative "失败" | 显示错误信息 |
| waiting-trigger | running + 补充 | positive "等待触发" | 副标签显示触发条件 |
| waiting-schedule | running + 补充 | positive "等待调度" | 副标签显示下次调度时间 |

"waiting-trigger"/"waiting-schedule" 通过 UI 层判断 `schedule.kind` + `lifecycle` 来区分。

**D-CROSS3 Widget 消费清单**:

| Widget | 发送页 | 任务页 | 指令接入页 |
|--------|--------|--------|-----------|
| DataTable | ✅ 帧实例表 | ✅ 任务列表、历史记录 | ✅ 卫星列表、命令日志、甲方任务列表 |
| TableToolbar | ✅ 实例表工具栏 | ✅ 任务列表搜索+筛选 | ✅ 卫星列表搜索 |
| StatusBadge | — | ✅ 任务状态、步骤状态 | ✅ 健康/链路状态、连接状态 |
| SendTargetSelector | ✅ 发送目标选择 | ✅ SendStep 目标选择 | ✅ 测试工具发送目标 |
| FrameSelector | — | ✅ SendStep 帧选择、条件帧选择 | ✅ 命令配置中帧选择 |

---

## 三、代码变更清单

### 3.1 Send Feature 变更

| 优先级 | 类型 | 文件 | 内容 |
|--------|------|------|------|
| P0 | 修改 | `send/index.ts` | re-export buildFrame/resolveFieldValues/evaluateFieldExpressions/frameToBuildInput/applyFactor/applyBuildPostPatch |
| P0 | 新建 | `send/composables/send-instance-types.ts` | SendFrameInstance 类型定义 |
| P0 | 新建 | `send/composables/use-send-instances.ts` | 帧实例 CRUD composable（列表/排序/选中/统计缓存/导入导出/JSON 持久化 via platform facade） |
| P0 | 新建 | `send/composables/use-frame-preview.ts` | 帧预览 composable（按字段粒度调 evaluateFieldExpressions，非全量 resolveFieldValues；computed 缓存 + debounce） |
| P1 | 确认 | `frame/` | 确认 frame feature 有 toggleFavorite 方法 |
| P1 | 确认 | platform facade | JSON 文件读写能力（帧实例和配置持久化用） |

### 3.2 Task Feature 变更

| 优先级 | 类型 | 文件 | 内容 |
|--------|------|------|------|
| P0 | 新建 | `task/core/validation.ts` | `validateTaskDefinition(def): ValidationResult` |
| P0 | 新建 | `task/core/builders.ts` | `createSendStep/createDelayStep/createWaitConditionStep/cloneStepDefinition/createTaskDefinition` |
| P1 | 修改 | `task/services/task-service.ts` | 新增 `retryTask(instanceId)` + `stopAll()` 方法 |
| P1 | 新建 | `task/core/serialization.ts` | `serializeTaskDefinition/deserializeTaskDefinition` |
| P0 | 新建 | `task/composables/use-task-list.ts` | 任务列表 composable（筛选/搜索/分页） |
| P0 | 新建 | `task/composables/use-task-editor.ts` | 任务编辑 composable（表单校验/步骤CRUD/调度配置） |
| P1 | 新建 | `task/composables/use-task-monitor.ts` | 执行监控 composable（轮询进度/状态映射/操作按钮） |
| P1 | 新建 | `task/composables/use-task-history.ts` | 历史记录 composable（分页/筛选/重新执行） |

### 3.3 Command-ingress Feature 变更

| 优先级 | 类型 | 文件 | 内容 |
|--------|------|------|------|
| P0 | 新建 | `command-ingress/services/config-validator.ts` | validateGlobalConfig/validateSatelliteConfig/validateCommandConfig |
| P1 | 新建 | `command-ingress/services/data-recorder.ts` | DataRecorder 类（addRecord/clear/getRecords） |
| P1 | 新建 | `command-ingress/utils/highlight-calculator.ts` | calculateHighlights 纯函数 |
| P1 | 修改 | `command-ingress/services/command-ingress-service.ts` | 新增 loadSatellite/unloadSatellite/onReceiveData/sendTestData |
| P1 | 修改 | `command-ingress/core/state.ts` | CommandIngressState 增加 satelliteConfigs/selectedConfigId |
| P0 | 新建 | `command-ingress/composables/use-scoe-config.ts` | SCOE 配置 composable（CRUD + JSON 持久化 via platform facade，复用 useJsonPersistence 模式） |
| P0 | 新建 | `command-ingress/composables/use-scoe-monitor.ts` | SCOE 运行监控 composable（统计卡片数据、命令日志、自动刷新） |
| P0 | 新建 | `command-ingress/composables/use-test-tool.ts` | SCOE 测试工具 composable（HEX 收发、高亮、DataRecorder） |
| P0 | 新建 | `command-ingress/composables/use-central-docking.ts` | 中心对接 composable（连接状态、甲方任务列表、心跳监控） |
| P1 | 新建 | `command-ingress/composables/use-task-report.ts` | 任务上报 composable（TaskDefinition 选择、接口调用、上报状态） |

**注意**: 不新建 config-storage-service。配置持久化由 composable 调 platform facade 直接读写 JSON，不建中间 wrapper。

### 3.4 共享基础设施（跨 feature 复用）

| 优先级 | 类型 | 文件 | 内容 |
|--------|------|------|------|
| P0 | 新建 | `shared/composables/use-json-persistence.ts` | 通用 JSON 持久化 composable（ref 状态 + platform facade JSON 读写 + 防抖保存）。发送帧实例、SCOE 配置、任务配置都复用此模式 |
| P0 | 新建 | `widgets/TaskExecutionDetail.vue`（或类似） | 任务执行监控基础组件（StatusBadge + 进度条 + 步骤状态 + 操作按钮），任务页和中心对接 Tab 复用。甲方扩展（上报状态）通过 slot 或 props 扩展 |

### 3.5 页面级约束

- **Tab keep-alive**: 指令接入页 QTab 内容用 `<keep-alive>` 包裹，防止切 Tab 丢失测试工具录制状态、编辑表单、监控数据
- **任务页 Tab 同理**: 活动任务/历史记录 Tab 切换不丢失列表选中状态

### 3.6 Runtime 变更

| 优先级 | 类型 | 文件 | 内容 |
|--------|------|------|------|
| P1 | 新建/修改 | `runtime/` | connection-aware 自动暂停 hook（监听 connection 状态变化 → taskService.pauseTask） |

---

## 四、自检层

### R1 假设验证

| 假设 | 验证方式 | 结果 |
|------|---------|------|
| buildFrame 等纯函数存在于 send/core | 读 send/core/ 目录 | ✅ 确认存在，需 re-export |
| evaluateFieldExpressions 存在 | 读 send/core/frame-resolver.ts | ✅ 存在于 :98，需 re-export |
| SendService 无帧实例管理 | 读 send/service | ✅ 确认，execute 是无状态的 |
| TaskService 无 retryTask | 读 task/service | ✅ 确认，startTask 只接受 created 状态 |
| ScheduleDriver 无 cron kind | 读 task/core/types.ts | ✅ 确认，只有 immediate/timer/event |
| CommandIngressState 无 satelliteConfigs | 读 state.ts | ✅ 确认无，需新增 |
| selector 可访问 CommandIngressState | 读 service + state | ✅ 通过 stateReader.getSnapshot() |
| CommandIngressService 无配置 CRUD | 读 service | ✅ 确认，只有 adapter + dispose |
| ConnectionService 无 removeConfig | 读 connection service（B1 结论） | ✅ 确认 |
| TaskProgress 无 waitingFor | 读 task/core/types.ts | ✅ 确认无，UI 层从 instance 推导，不改 core |
| 帧实例数 < 500 | 旧系统实际数据 | ✅ 合理，virtual-scroll 防御性开启 |
| 旧系统帧实例持久化 | 读旧代码 | ✅ JSON 文件持久化，新系统走 platform facade |
| 卫星配置数 < 50 | 旧系统实际数据 | ✅ 合理，无需虚拟滚动 |

### R2 旧行为覆盖度

**发送页面（10 功能域 → 5 个在本页，5 个移至任务页）**:

| 功能域 | 覆盖 | 所在页面 | 说明 |
|--------|------|---------|------|
| 目标选择 | ✅ | 发送页 | SendTargetSelector Widget |
| 帧格式列表 | ✅ | 发送页 | QList + frame selectors |
| 帧实例表 | ✅ | 发送页 | DataTable + useSendInstances composable |
| 预览面板 | ✅ | 发送页 | useFramePreview composable |
| 实例编辑器 | ✅ | 发送页 | QDialog + 字段分组 |
| 定时发送 | ✅ | 任务页 | TaskDefinition + schedule: timer |
| 条件触发 | ✅ | 任务页 | TaskDefinition + schedule: event |
| 时间触发 | ⚠️ 简化 | 任务页 | 本期不实现 cron，留二期 |
| 顺序发送 | ✅ | 任务页 | TaskDefinition + 多 steps |
| 任务监控 | ✅ | 任务页 | 独立执行监控面板 + 历史记录 |

**任务页面（新增独立页面，覆盖旧系统全部任务行为）**:

| 功能域 | 覆盖 | 说明 |
|--------|------|------|
| 定时发送 | ✅ | schedule: timer + 步骤配置 |
| 条件触发 | ✅ | schedule: event + ConditionTerm 编辑器 |
| 顺序发送 | ✅ | 多 steps + 可变参数 |
| 活动任务监控 | ✅ | DataTable + 执行监控面板(D-T5) |
| 历史记录 | ✅ | Tab 切换 + DataTable |
| 任务 CRUD | ✅ | 创建/编辑/删除/启动/暂停/恢复/停止 |
| 可变参数 | ✅ | FieldVariation 编辑器 |
| 导入导出 | ✅ | serializeTaskDefinition/deserializeTaskDefinition |

**指令接入页面（SCOE 5 功能域 + 甲方对接，全部覆盖）**:

| 功能域 | 覆盖 | Tab | 说明 |
|--------|------|-----|------|
| 全局配置表单 | ✅ | SCOE 配置 | ScoeGlobalConfig 全字段（可折叠） |
| 卫星配置列表 | ✅ | SCOE 配置 | DataTable + CRUD（需新增持久化服务） |
| 命令配置编辑 | ✅ | SCOE 配置 | 展开折叠面板，替代 90vw 弹窗 |
| SCOE 状态面板 | ✅ | SCOE 运行与测试 | 10 个统计卡片 + 命令日志 |
| 测试工具 | ✅ | SCOE 运行与测试 | HEX 收发 + 高亮配置 |
| 甲方连接/心跳 | ✅ | 中心对接 | 状态指示 + 心跳监控 |
| 甲方任务接收 | ✅ | 中心对接 | 任务列表 DataTable + 详情弹窗 |
| 任务上报 | ✅ | 中心对接 | QDialog 选择 TaskDefinition 上报 |
| 用例结果上报 | ✅ | 中心对接 | 自动上报，详情弹窗中显示上报状态 |
| 任务报告交付 | ✅ | 中心对接 | JSON 报告生成 + 文件上传 + 完成通知 |
| 对接配置 | ✅ | 中心对接 | QDialog（HTTPS地址/设备标识/心跳/认证） |
| 设备列表 | ⚠️ 预留 | 中心对接 | 内部 Tab 预留，根据实际接口设计 |

### R3 与 B1 交互一致性

| 维度 | 结论 | 说明 |
|------|------|------|
| 搜索/筛选 | ✅ | 帧列表用 TableToolbar，任务列表用 TableToolbar，卫星列表用 TableToolbar |
| 编辑保存/取消 | ✅ | 任务编辑面板级 sticky bar，其余对话框级 QDialog [取消][确认] |
| 删除确认 | ✅ | 统一 $q.dialog() |
| 操作反馈 | ✅ | 统一 $q.notify() |
| 空状态/loading | ✅ | 所有列表/表格显式处理 |
| 状态展示 | ✅ | 任务状态用 StatusBadge，健康/链路用 StatusBadge |
| 布局模式 | ✅ | 发送用模式B，任务页用模式A，指令接入3 Tab |
| 虚拟滚动 | ✅ | 帧实例表防御性开启，任务列表防御性开启，卫星列表和甲方任务列表不需要 |

### 过度设计审查

| 项 | 结论 | 理由 |
|----|------|------|
| 帧实例 composable vs Pinia store | 用 composable | 帧实例是页面级 UI 状态，不是全局领域状态 |
| 任务 SendStep 字段值方案 | **方案 A：copy-on-create** | 每步独立持有 fieldValues，不引用发送页实例。可用"复制上一步"降低重复配置成本 |
| 任务管理独立页面 vs 发送页对话框 | **独立页面 /tasks** | 任务是通用执行引擎，覆盖定时/触发/顺序/SCOE/北向，内容量大，不是发送附属功能 |
| 拖拽排序 | 本期不做 | 上下移动按钮足够，拖拽需引入额外库 |
| 时间触发（cron） | 本期不做 | ScheduleDriver 需扩展，复杂度高 |
| 批量发送 API | 不需要 | 通过 Task steps 实现 |
| 发送预览单独 API | 不需要 | 直接 re-export buildFrame 纯函数 |
| 配置热更新 | 不做 | 保存后重启连接生效即可 |
| 指令接入 Tab 结构 | **3 Tab: SCOE运行与测试 / SCOE配置 / 中心对接** | SCOE 运行和测试操作员同时需要；配置低频独立；甲方对接是完全不同的协议和交互 |
| 甲方对接任务详情 | **弹窗复用任务页监控组件** | 甲方任务详情包含执行监控+上报状态，复用 D-T5 组件降低开发量 |
| 甲方任务上报 | **QDialog 选择 TaskDefinition → 上报** | 上报任务与任务页 TaskDefinition 是同一类型，上报时按实际接口组合转换 |

### Design 阶段关键输入

**字段编辑 Widget（共享组件）**: 发送页实例编辑弹窗和任务页 SendStep 字段编辑共用同一个 Widget，是本组交互最密集的组件，需重点设计。

旧系统四个已知问题：
1. **视觉差**: 字段分组颜色方案和信息密度需重新设计
2. **交互不好用**: 编辑流程需优化
3. **表达式不自动计算**: 修改一个字段后，依赖该字段的表达式字段不会实时刷新。新系统方案：字段值变化 → `resolveFieldValues` 重算 → computed 驱动表达式字段值更新
4. **代码不可复用**: 旧实现直接重写

新系统技术基础：shared/ 表达式引擎已支持依赖排序和预编译，composable 层可实现响应式字段值联动。预览 composable 按字段粒度调 evaluateFieldExpressions，不每次全量走 resolveFieldValues。

**甲方接口 schema 未确认**: 中心对接 Tab 的具体字段（配置项、任务列表字段、上报字段）需根据实际接口文档调整。UI 骨架（Tab 结构、弹窗入口、DataTable 列）先按接口清单设计，字段映射在 design 阶段根据确认后的 schema 细化。参考 `refactor/docs/后续需要功能文档.md`。

**性能与架构约束（design 阶段必须遵守）**:

1. **预览按字段粒度重算**: useFramePreview 不调 resolveFieldValues 做全量重算。用户改字段 A，只重算依赖 A 的表达式字段。evaluateFieldExpressions 按单字段调用，结果 computed 缓存。
2. **持久化走 platform facade，不走 feature service**: 配置、帧实例、任务配置的 JSON 读写全部由 composable 调 platform facade 完成。feature service/core 不碰文件 I/O。多个 composable 共享 useJsonPersistence 模式，不各自重复。
3. **任务详情组件拆基础 + 扩展**: TaskExecutionDetail 基础组件只含 StatusBadge + 进度条 + 步骤状态 + 操作按钮。甲方专用（上报状态、JSON 报告交付）通过 slot 或 wrapper 扩展，不 props 膨胀基础组件。
4. **Tab keep-alive**: 指令接入页和任务页的 Tab 内容必须 `<keep-alive>`，防止切 Tab 丢状态（录制中数据、编辑中表单、监控快照）。
5. **composable 合并**: design 阶段审视 8+ composable 是否可合并。候选：use-task-list + use-task-history → 一个 composable 内 Tab 切换；use-scoe-monitor + use-test-tool 数据独立但可考虑共享 rAF 刷新循环。

### 自检修正记录

基于外部审查反馈，经子 agent 代码验证后修正：

| 问题 | 验证结果 | 修正 |
|------|---------|------|
| evaluateFieldExpressions 遗漏 | 确认存在于 frame-resolver.ts:98 | 补入 re-export 清单 |
| CommandIngressState 字段未验证 | 确认无 satelliteConfigs/selectedConfigId | R1 补充验证，change list 方向正确 |
| waitingFor 两种方案矛盾 | TaskProgress 无此字段，UI 可从 instance 推导 | 删除 P2 core 改动，统一走 UI 层推导 |
| 帧实例持久化遗漏 | 旧系统 JSON 文件持久化 | 补入 change list，走 platform facade |
| selector 访问路径 | stateReader.getSnapshot() 可用 | 不是问题，无需修正 |
| 8 个 composable 风险 | 项目零 composable，但 Vue 标准模式 | 不影响 brainstorm 规划，design 阶段可合并 |
