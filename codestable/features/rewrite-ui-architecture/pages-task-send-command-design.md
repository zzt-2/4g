# 任务域 + 发送 + 指令接入页面 Design

## 元数据

- **类型**: design（结论和变化）
- **直接合同**: pages-task-send-command-brainstorm.md, rewrite-ui-architecture-design.md, rewrite-frontend-conventions.md
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, command-ingress-brainstorm.md, pages-frame-connection-brainstorm.md, 2026-05-07-runtime-next-phase-global-planning.md
- **日期**: 2026-05-12
- **brainstorm**: pages-task-send-command-brainstorm.md
- **状态**: REVISE v2（修正前端规范合规 + 架构问题）

---

## 页面 1: 帧发送页 (/frames/send)

### 现状

- Send feature 有 SendService.execute + SendReader + selector，无帧实例管理能力
- buildFrame / resolveFieldValues / evaluateFieldExpressions 等纯函数存在于 send/core 但未 re-export
- 无 UI 侧帧实例类型，无预览 composable
- 旧系统发送页包含定时/触发/顺序发送和任务监控，全部与发送页耦合

### 变化

**D-S1 布局**: 模式B 三栏（左 240px + 中 flex:1 + 右 300px）

**D-S2 左栏帧格式列表**:
- QList + QItem，分组标题（收藏/全部）
- QInput dense 搜索，实时过滤（纯内存 < 1ms，无 debounce）
- 数据源: `listFrameAssetSummaries(source, { direction: 'send', query, favoriteOnly? })`
- 单击 → 创建实例 + 中栏选中 + 右栏预览
- 双击 → 创建实例 + 打开编辑对话框
- 收藏按钮: toggle isFavorite → replaceFrames

**D-S3 中栏帧实例表**:
- DataTable Widget + virtual-scroll + selection="single"
- 列定义抽到 `send/components/instance-columns.ts`:

| 列 | 字段 | 宽度 | 渲染 |
|----|------|------|------|
| # | index | fixed 60px | 自动序号 |
| 名称 | name | auto | 文本 |
| 参数数 | fieldCount | fixed 80px | 数字 |
| 发送次数 | sendCount | fixed 80px | 数字(V1) |
| 上次发送 | lastSendAt | fixed 140px | 时间格式化(V2) |
| 备注 | description | auto | 文本，长文本截断+QTooltip(V4) |
| 操作 | — | fixed 120px | icon 按钮(编辑/复制/删除) |

- 空状态: `#no-data` → "暂无帧实例，从左侧选择帧格式创建"
- loading: `:loading="isLoading"`
- 排序: 上下移动按钮（本期不做拖拽）
- 批量模式: selection="multiple" + 批量删除($q.dialog 确认)
- 数据源: useSendInstances composable

**D-S4 右栏预览 + 发送**:
- 上部: 实例基本信息（名称/时间/备注）
- 中部: 十六进制帧（pre code font-mono，按字节空格分隔）
- 下部: 可配置字段表（字段名 | 十六进制值）
- 底部: SendTargetSelector + [发送] 按钮 `:loading="isSending" :disable="!selectedInstance || !selectedTarget"`(F4)
- 数据源: useFramePreview composable

**D-S5 SendFrameInstance 类型**（UI 侧，归口 send/composables/）:

```typescript
interface SendFrameInstance {
  readonly instanceId: string;        // nanoid
  readonly frameId: string;
  readonly name: string;
  readonly description?: string;
  readonly userFieldValues: Record<string, SendFieldValue>;
  readonly sendCount: number;
  readonly lastSendAt?: string;       // ISO timestamp
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

不进 core/service 层——帧实例是页面级 UI 状态，不是全局领域状态。

**D-S6 单帧发送**: 选中实例 + 选择目标 → `sendService.execute({ frameId, targetId, userFieldValues, context: { source: 'user' } })`。成功 $q.notify('positive')，失败 $q.notify('negative') + buildIssues。

**D-S7 实例编辑对话框**:
- QDialog v-model + @hide 清理(D1)
- 宽度: `rw-dialog-lg`(D2)
- 使用 FieldEditWidget 组件（见跨页面共享）
- [取消] [确认] 按钮，确认按钮 `:loading="isSaving" :disable="!isValid"`(F4)

**D-S8 发送页定位**: 只做单帧快速发送 + 帧实例管理。定时/触发/顺序/监控全部在任务页。

**D-S9 已移除**: 定时/触发/顺序发送对话框、任务监控对话框、拖拽排序（简化为上下移动按钮）、批量发送 API。

---

## 页面 2: 任务管理页 (/tasks)

### 现状

- Task feature 有完整的 TaskService + Reader + selector
- 无任务编辑/创建 UI 能力
- 无任务历史查看能力
- 无 validateTaskDefinition / serialization / builders
- 旧系统任务作为发送页对话框，与全局规划中 task = 通用执行引擎的定位冲突

### 变化

**D-T1 定位**: 任务是通用执行引擎的完整管理界面，独立于发送页。

**D-T2 布局**: 主从双栏 — 左侧任务列表(flex:1) + 右侧面板(360px)

右侧面板只承载**执行监控和任务摘要**（360px 足够）。
任务编辑器因表单复杂度（4 种步骤 + 3 种调度 + 高级配置）使用**全宽对话框**（rw-dialog-xl）。

```
┌──────────────────────────────────────────────────────────────┐
│ 任务管理  [新建任务] [导入] [导出]                              │
├────────────────────────┬─────────────────────────────────────┤
│ TableToolbar(搜索+筛选) │ 未选中: 空状态                       │
│                        │                                     │
│ Tab: 活动任务|历史记录   │ 定义态: 任务摘要 + [编辑][启动]       │
│ DataTable              │ 运行态: 执行监控(TaskExecutionDetail)│
│                        │                                     │
│ QChip 状态筛选          │                                     │
└────────────────────────┴─────────────────────────────────────┘

[新建任务]/[编辑] → QDialog rw-dialog-xl → 任务编辑器对话框
```

**D-T3 任务列表区**:
- Tab 切换: 活动任务 | 历史记录（keep-alive）
- DataTable + virtual-scroll（防御性开启）
- 活动任务列定义抽到 `task/components/task-columns.ts`:

| 列 | 字段 | 宽度 | 渲染 |
|----|------|------|------|
| 名称 | name | auto | 文本 |
| 调度类型 | schedulingMode | fixed 100px | QChip(timed/trigger/sequence) |
| 状态 | status | fixed 100px | StatusBadge |
| 进度 | progress | fixed 120px | QLinearProgress + 百分比 |
| 操作 | — | fixed 140px | icon 按钮(暂停/恢复/停止) |

- 历史记录列定义:

| 列 | 字段 | 宽度 | 渲染 |
|----|------|------|------|
| 名称 | name | auto | 文本 |
| 调度类型 | schedulingMode | fixed 100px | QChip |
| 结果 | result | fixed 80px | StatusBadge(positive 已完成/negative 失败) |
| 耗时 | elapsedMs | fixed 100px | 时间格式化(V2) |
| 完成时间 | completedAt | fixed 140px | 时间格式化(V2) |
| 操作 | — | fixed 120px | icon 按钮(查看/重新执行/删除) |

- 空状态: `#no-data` → 活动 Tab "暂无活动任务"，历史 Tab "暂无历史记录"
- loading: `:loading="isLoading"`
- 状态筛选 QChip 组: 全部/待启动/运行中/已暂停/已完成/失败
- 数据源: selectActiveInstances + selectTaskHistory
- **历史记录数据流**: task state 已有 `instances`（活跃）+ `history`（removeTask 归档）两层数据。task feature 新增 `selectActiveInstances` selector，只返回非终止态实例（created/running/paused）。`selectTaskHistory` 扩展为返回 history + 仍在 instances 中的终止态实例（completed/failed/stopped）。UI composable 直接调两个 selector，不做任何过滤。
- 操作: 活动 Tab 中终止态任务显示 [移至历史] 按钮 → 调 removeTask → 从 active 消失、入 history
- 合并 useTaskList + useTaskHistory → 单一 useTaskList composable，内部按 mode('active' | 'history') 切换 selector

**D-T4 任务摘要（右侧面板，定义态）**:
- 任务名称 + 调度类型摘要 + 步骤数量
- 可变参数摘要（有/无）
- [编辑] 按钮 → 打开任务编辑器对话框(rw-dialog-xl)
- [启动] 按钮 `:loading="isStarting" :disable="lifecycle !== 'created'"`(F4)

**D-T5 任务编辑器对话框**:
- QDialog v-model + @hide 清理(D1)
- 宽度: `rw-dialog-xl`(D2)
- 基本信息: 任务名称(QInput `:rules="[val => !!val || '请输入任务名称']"`(F1/F2)) + 调度类型(QSelect)
- 调度配置: 按 schedulingMode 动态渲染
  - timer: 间隔(QInput type=number `:rules="[val => val > 0 || '间隔必须大于0']"`) + 次数(QInput `:rules` 非无限时必填) + 无限循环(QToggle)
  - event: 条件编辑器（ConditionTerm 列表 + 添加按钮，至少一条校验）
- 步骤编辑器: 步骤列表 + [添加步骤] 下拉(send/wait-condition/delay)
  - 每步: QExpansionItem 展开/折叠 + 类型图标 + 摘要 + 删除按钮
  - SendStep: FrameSelector(required) + SendTargetSelector(required) + FieldEditWidget(独立 fieldValues) + 发送后延时(QInput type=number) + 可选 repeat 配置
  - WaitConditionStep: 条件列表(至少一条) + 超时(QInput type=number `:rules="[val => val > 0 || '请输入超时时间']"`) + 超时策略(QSelect: continue/skip/fail)
  - DelayStep: 持续时间(QInput type=number `:rules="[val => val > 0 || '请输入延时时间']"`)
  - 字段数 > 20 时 SendStep 的 FieldEditWidget 必须拆子组件(F3)
- 高级配置（QExpansionItem 折叠）:
  - 停止条件: maxIterations / maxDurationMs
  - 错误策略: onFailure(QSelect) / retryCount / retryDelayMs
  - ~~可变参数: FieldVariation 编辑器（字段选择 + 值列表）~~ → Phase 2（task-real 类型重组后启用）
  - ~~exitCondition~~ → Phase 2（task-real 类型重组后启用）
  - ~~step repeat 配置~~ → Phase 2（task-real 类型重组后启用）
- 操作: [取消] [保存] [保存并启动]
  - [保存] `:loading="isSaving" :disable="!isValid"`(F4)
  - [保存并启动] `:loading="isSaving"`
- 保存前 validateTaskDefinition 校验

**D-T6 执行监控（右侧面板，运行态）**:
- 复用 TaskExecutionDetail 基础组件（widgets/TaskExecutionDetail.vue）
- 任务状态: StatusBadge + 名称
- 进度: QLinearProgress + 文字(stepsCompleted/stepsTotal)
- 耗时: elapsedMs 格式化(V2)
- 步骤状态列表: 每步 StatusBadge + 结果摘要
- 操作: 暂停/恢复/停止（停止需 $q.dialog() 确认）
- 错误: TaskInstanceState.error 内联展示

**D-T7 任务状态映射**:

| TaskLifecycleStatus | UI 显示 | StatusBadge color(C2) |
|---------------------|---------|----------------------|
| created | 待启动 | grey |
| running | 运行中 | positive |
| running + schedulingMode=trigger | 等待触发 | positive (副标签) |
| running + schedulingMode=timed | 等待调度 | positive (副标签) |
| paused | 已暂停 | warning |
| completed | 已完成 | positive |
| failed | 失败 | negative |

waiting-trigger/waiting-schedule 由 UI 层从 `instance.definitionRef.schedulingMode` + lifecycle 推导，不改 core。

**D-T8 SendStep 字段值**: 方案 A（copy-on-create）。每步独立持有 fieldValues，不引用发送页实例。提供"复制上一步"按钮降低重复配置成本。

**D-T9 导入导出**: serializeTaskDefinition → JSON 文件写入(platform facade)；读取 → deserializeTaskDefinition → 校验 → 创建。

**D-T10 TaskService 方法签名**:

```typescript
// 已实现
createTask(definition: TaskDefinition): TaskInstanceState
startTask(instanceId: string): void
pauseTask(instanceId: string): void
resumeTask(instanceId: string): void
stopTask(instanceId: string): void
removeTask(instanceId: string): void
retryTask(sourceInstanceId: string): TaskInstanceState | undefined
stopAll(): void
getProgress(instanceId: string): TaskProgress | undefined
getInstance(instanceId: string): TaskInstanceState | undefined
// 已实现（工具函数）
validateTaskDefinition(def: TaskDefinition): TaskValidationIssue[]
serializeTaskDefinition(def: TaskDefinition): string
deserializeTaskDefinition(json: string): TaskDefinition
```

**D-T11 Service Readiness Gaps**（UI 实施前需补齐）:

| Gap | 影响 | 修复方式 |
|-----|------|---------|
| 无 `updateTask` 方法 | 编辑任务无法保存 | 新增 `updateTask(instanceId, definition)`：仅 `created` 态可改定义 |
| 历史记录缺 `elapsedMs` / `completedAt` | D-T3 历史列无法渲染 | selector 层从 `startedAt`/`stoppedAt`/`completedAt`/`failedAt` 派生 |
| `stopAll()` 无返回值 | UI 无法显示停止了多少 | 改为返回 `stoppedCount: number` |

D-T5 编辑器保存逻辑：`created` 态 → `updateTask` → 刷新面板；`running/paused` 态 → 禁用编辑。

---

## 页面 3: 指令接入页 (/command-ingress)

### 现状

- command-ingress 有 service + selector，无配置 CRUD、无 UI
- 无 SCOE 配置管理、无测试工具、无甲方对接界面
- 旧 SCOE 页面有全局配置表单、卫星列表、命令配置对话框、状态面板、测试工具
- 甲方接口 schema 未确认

### 变化

**D-CI1 布局**: 3 Tab + 固定页面标题栏

```
┌──────────────────────────────────────────────────────────────┐
│ 指令接入   [连接/断开] [加载/卸载] [保存配置]                    │
├──────────────────────────────────────────────────────────────┤
│ [SCOE 运行与测试] │ [SCOE 配置] │ [中心对接]                    │
├──────────────────────────────────────────────────────────────┤
│ Tab 内容区 (keep-alive)                                       │
└──────────────────────────────────────────────────────────────┘
```

页面标题栏按钮:
- [连接/断开] `:loading`: TCP server connect/disconnect
- [加载/卸载]: loadSatellite/unloadSatellite
- [保存配置] `:loading="isSaving"`: useScoeConfig 持久化

**D-CI2 Tab 1: SCOE 运行与测试**（默认首页，高频使用）:

上部统计面板 — grid 5列×2行:
- 累计秒 / 卫星运行秒 / 指令接收总数(color="positive"(C2)) / 成功总数(color="positive") / 出错数(color="negative")
- 最后功能码 / 错误原因(class="text-secondary"(C3)) / 已加载卫星ID / 健康状态(StatusBadge) / 链路自检(StatusBadge)
- 数据源: selectCommandIngressSnapshot / selectScoeStatistics / selectScoeRuntimeStatus
- 刷新: rAF + cadence 1000ms

下部左右分栏:
- 左侧(flex:1): 命令执行日志 DataTable，shallowRef + 整组追加
  - 列定义抽到 `command-ingress/components/command-log-columns.ts`:

  | 列 | 字段 | 宽度 | 渲染 |
  |----|------|------|------|
  | 时间 | timestamp | fixed 140px | 时间格式化(V2) |
  | 功能码 | code | fixed 80px | hex |
  | 结果 | result | fixed 80px | StatusBadge(positive 成功/negative 失败) |
  | 耗时 | duration | fixed 80px | 数字 + ms |

  - 空状态: `#no-data` → "暂无命令记录"
  - loading: `:loading="isLoading"`

- 右侧(固定 320px): 测试工具
  - 接收区: 工具栏(高亮/开始/停止/清空) + HEX 记录列表(virtual-scroll)
    - 列: 时间(fixed 100px) / HEX数据(auto, font-mono + 高亮) / 校验标记(fixed 60px, icon)
    - 空状态: "暂无接收数据"
  - 发送区: HEX 输入框(QInput type=textarea) + [发送] 按钮 `:loading="isSending" :disable="!hexInput.trim()"`(F4) + 发送记录
  - 高亮配置: QDialog v-model(D1)，宽度 `rw-dialog-md`(D2)
    - 规则列表：起始位置(QInput) / 长度(QInput) / 标签(QInput) / 颜色(QSelect: info/warning/negative/positive)
    - [取消] [保存] 按钮，保存 `:loading`
  - composable: useTestTool（DataRecorder 服务 + calculateHighlights 纯函数）

**D-CI3 Tab 2: SCOE 配置**（低频，设置阶段）:

主从双栏:
- 左侧(280px): 卫星配置 DataTable + TableToolbar
  - 列定义抽到 `command-ingress/components/satellite-columns.ts`:

  | 列 | 字段 | 宽度 | 渲染 |
  |----|------|------|------|
  | 卫星ID | satelliteId | auto | 文本 |
  | 命令数 | commandCount | fixed 80px | 数字 |
  | 操作 | — | fixed 100px | icon 按钮(复制/删除) |

  - 空状态: `#no-data` → "暂无卫星配置"
  - loading: `:loading="isLoading"`
  - [添加] + [导入] + [导出] 按钮
  - 数据源: useScoeConfig composable 内部管理 satelliteConfigs（**不放 CommandIngressState**）
- 右侧(flex:1): 选中卫星的编辑区
  - 全局配置（QCard 可折叠 QExpansionItem）:
    - SCOE标识(QInput `:rules` required) / TCP配置(IP QInput + 端口 QInput type=number + 自动连接 QToggle) / UDP配置(IP + 端口) / 偏移配置(6项 grid-cols-3, QInput type=number) / 成功帧选择(FrameSelector)
  - 卫星基本信息: messageIdentifier / sourceIdentifier / destinationIdentifier / modelId（均 QInput `:rules` required）
  - 命令配置列表: QExpansionItem 展开/折叠
    - 折叠: 标题 + 功能码 + 操作(编辑/删除)
    - 展开: 功能码 / 校验和配置(列表) / 参数配置(列表) / 帧映射配置(列表) / 完成条件(列表) / 超时
    - 不使用大弹窗
  - [保存] 按钮 `:loading="isSaving"`(F4)

**D-CI4 Tab 3: 中心对接**（甲方 HTTPS 接口）:

```
┌──────────────────────────────────────────────────────────────┐
│ [HTTPS: StatusBadge] [心跳: StatusBadge] [设备: StatusBadge] │
│                                [对接配置] [任务上报]           │
├──────────────────────────────────────────────────────────────┤
│ [任务列表] │ [设备列表]                                         │
├──────────────────────────────────────────────────────────────┤
│ DataTable: 已下发任务                                          │
└──────────────────────────────────────────────────────────────┘
```

- 连接状态指示: HTTPS/心跳/设备 各用 StatusBadge(C2)
- [对接配置] → QDialog v-model(D1)，宽度 `rw-dialog-md`(D2)
  - HTTPS地址(QInput) / 端口(QInput type=number) / 设备标识(QInput) / 心跳间隔(QInput type=number) / 认证信息(QInput type=password)
  - 所有字段 `:rules` required(F1/F2)，[取消] [保存] `:loading`(F4)
  - 字段映射留扩展点，甲方 schema 未确认
- [任务上报] → QDialog v-model(D1)，宽度 `rw-dialog-lg`(D2)
  - TaskDefinition 多选列表(QTable selection="multiple")
  - [取消] [上报] `:loading="isReporting" :disable="!selectedTasks.length"`(F4)
- 内部 Tab: 任务列表 | 设备列表（预留）
- 任务列表 DataTable，列定义抽到 `command-ingress/components/docking-task-columns.ts`:

  | 列 | 字段 | 宽度 | 渲染 |
  |----|------|------|------|
  | 任务ID | taskId | auto | 文本 |
  | 用例数 | caseCount | fixed 80px | 数字 |
  | 状态 | status | fixed 100px | StatusBadge |
  | 下发时间 | issuedAt | fixed 140px | 时间格式化(V2) |
  | 操作 | — | fixed 100px | [详情] [停止] 按钮 |

  - 空状态: `#no-data` → "暂无下发任务"
  - loading: `:loading="isLoading"`
- [详情] → QDialog v-model(D1)，宽度 `rw-dialog-lg`(D2)
  - 复用 TaskExecutionDetail + #extension slot（甲方上报状态）
- 设备列表 Tab: 预留，空状态 "功能开发中"
- composable: useCentralDocking（连接状态 + 甲方任务列表 + 心跳）+ useTaskReport（选择+上报）

**甲方主流程**: 上报任务 → 接收任务 → 执行 → 用例结果上报 → JSON 报告交付

**D-CI5 已移除**: WebSocket 连接类型、运行时配置热更新、命令配置大弹窗（改为展开折叠）。

---

## 跨页面共享

### JSON 持久化模式（shared/ 纯 TS + feature composable Vue 封装）

shared/ 要求零 Vue 依赖(CLAUDE.md)，所以拆为两层:

**shared/persistence/json-persistence.ts**（纯 TS，无 Vue 依赖）:

```typescript
interface JsonPersistenceOptions {
  readonly filename: string;
  readonly debounceMs?: number;      // 默认 500ms
}

function createJsonPersistence<T>(
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, content: string) => Promise<void>,
  options: JsonPersistenceOptions
): {
  load(): Promise<T | undefined>;
  save(data: T): Promise<void>;
}
```

**各 feature composable 内部**各自封装 Vue 响应式:

```typescript
// 例: send/composables/use-send-instances.ts
const persistence = createJsonPersistence(
  platform.readFile, platform.writeFile,
  { filename: 'send-instances.json' }
);
const data = shallowRef<SendFrameInstance[]>([]);
const isLoaded = ref(false);
async function load() { data.value = await persistence.load() ?? []; }
async function save() { await persistence.save(toRaw(data.value)); }
```

消费方:
- useSendInstances → 帧实例 JSON 持久化
- useScoeConfig → SCOE 配置 JSON 持久化（satelliteConfigs 管理在此 composable 内，不在 CommandIngressState）

不建 config-storage-service wrapper，composable 直接调 platform facade + shared 纯 TS 工具。

### TaskExecutionDetail 基础组件

归口: `widgets/TaskExecutionDetail.vue`

Props:
```typescript
{
  readonly instance: TaskInstanceState;
  readonly progress: TaskProgress;
}
```

展示: StatusBadge + QLinearProgress + 步骤状态列表 + elapsedMs

Slots:
- `#actions`: 操作按钮（暂停/恢复/停止由消费方传入）
- `#extension`: 甲方扩展区域（上报状态、JSON 报告交付进度）

消费方:
- 任务页右侧面板（运行态）—— 无 extension slot
- 中心对接 Tab 任务详情弹窗—— + 甲方 extension slot

不 props 膨胀基础组件——甲方专用信息通过 extension slot 注入。

### FieldEditWidget 字段编辑组件

归口: `widgets/FieldEditWidget.vue`

Props:
```typescript
{
  readonly fields: readonly FrameFieldDefinition[];
  readonly values: Record<string, SendFieldValue>;
  readonly direction: 'send' | 'receive';
}
```

Events:
- `update:values` — 字段值变化时 emit

字段分组渲染（使用 Quasar brand 色，不硬编码(C1)）:
- 可调字段: `color="info"` 标识，用户可编辑
- 计算参数: `color="warning"` 标识，表达式字段
- 不可配置: `color="grey"` 文字，只读展示

表达式实时联动: 字段值变化 → `evaluateFieldPreview` 重算依赖字段 → emit 更新后的 values。`evaluateFieldPreview` 是 send feature 面向 UI 的公共函数，内部封装 FrameFieldDefinition → frameToBuildInput → SendFieldEncodingDef → evaluateFieldExpressions 的转换链路。UI composable 只传 frame + fieldId + userFieldValues，不接触 send 内部编码类型。按字段粒度调用，不全量 resolveFieldValues。computed 缓存 + 字段级依赖追踪。

消费方:
- 发送页实例编辑对话框
- 任务页编辑器对话框 SendStep 字段值编辑

### Tab keep-alive

指令接入页 3 个 Tab 内容用 `<keep-alive>` 包裹，防止切 Tab 丢失测试工具录制状态、编辑表单、监控数据。
任务页活动任务/历史记录 Tab 同理 keep-alive。

---

## Composable 合并审视

brainstorm 提出 11 个 composable，审视后合并为 10 个:

| 原始 | 合并结果 | 理由 |
|------|---------|------|
| useTaskList + useTaskHistory | → useTaskList（mode: 'active' \| 'history'） | 直接消费 selectActiveInstances / selectTaskHistory 两个 selector，不做 UI 层过滤 |
| useSendInstances | 保留 | 独立的帧实例 CRUD + 持久化 |
| useFramePreview | 保留 | 预览计算逻辑独立，依赖 evaluateFieldExpressions |
| useTaskEditor | 保留 | 编辑表单状态复杂，职责独立 |
| useTaskMonitor | 保留 | 运行态轮询 + 状态映射，与编辑器互斥 |
| useScoeConfig | 保留 | 配置 CRUD + satelliteConfigs 管理 + 持久化 |
| useScoeMonitor | 保留 | 统计卡片 + 命令日志，rAF 1000ms |
| useTestTool | 保留 | HEX 收发 + DataRecorder + 高亮，与监控数据独立 |
| useCentralDocking | 保留 | 甲方连接状态 + 任务列表 |
| useTaskReport | 保留 | 任务选择 + 上报流程 |

useScoeMonitor + useTestTool 不合并: 数据完全独立（统计 vs HEX 收发），共享 rAF 刷新循环的收益不足以抵消职责混合的复杂度。

---

## 路由变更

D6 路由表新增:

```typescript
{ path: 'tasks', name: 'task-list', component: () => import('pages/TaskManagePage.vue') },
```

/tasks 位于 AppShell children 下，与 /frames、/command-ingress 同级。

---

## 前置依赖（design 之前须具备）

### Platform file facade

当前 platform 只有 TransportFacade。本 design 的 JSON 持久化需要 platform 提供文件读写能力。

新增:
- `platform/files.ts`: FileFacade — readTextFile(path) / writeTextFile(path, content) / showSaveDialog(opts) / showOpenDialog(opts)
- preload: 暴露对应 typed API（fs 读写的 IPC 桥接）
- main: 实现文件读写 + 系统对话框

本 design 变更清单中所有"持久化走 platform facade"均依赖此前置。

---

## 代码变更清单

### Send Feature

| 变更 | 文件 |
|------|------|
| re-export buildFrame/resolveFieldValues/evaluateFieldExpressions/frameToBuildInput/applyFactor/applyBuildPostPatch | send/index.ts |
| 新增 evaluateFieldPreview(frame, userFieldValues, fieldId) — 封装类型转换，面向 UI 预览 | send/core/frame-resolver.ts + re-export from send/index.ts |
| 新建 SendFrameInstance 类型 | send/composables/send-instance-types.ts |
| 新建 useSendInstances composable | send/composables/use-send-instances.ts |
| 新建 useFramePreview composable | send/composables/use-frame-preview.ts |
| 新建帧实例列定义 | send/components/instance-columns.ts |

### Task Feature

| 变更 | 文件 |
|------|------|
| 新建 validateTaskDefinition | task/core/validation.ts |
| 新建 createSendStep/createDelayStep/createWaitConditionStep/cloneStepDefinition/createTaskDefinition | task/core/builders.ts |
| 新增 retryTask(sourceInstanceId): Promise\<TaskInstanceState\> + stopAll(): Promise\<void\> | task/services/task-service.ts |
| 新增 selectActiveInstances selector（只返回 created/running/paused） | task/selectors/task-selectors.ts |
| 扩展 selectTaskHistory：返回 history + 仍在 instances 中的终止态实例 | task/selectors/task-selectors.ts |
| 新建 serializeTaskDefinition/deserializeTaskDefinition | task/core/serialization.ts |
| 新建 useTaskList composable（活动+历史合并） | task/composables/use-task-list.ts |
| 新建 useTaskEditor composable | task/composables/use-task-editor.ts |
| 新建 useTaskMonitor composable | task/composables/use-task-monitor.ts |
| 新建活动任务列定义 | task/components/task-columns.ts |
| 新建历史记录列定义 | task/components/history-columns.ts |

### Command-ingress Feature

| 变更 | 文件 |
|------|------|
| 新建 validateGlobalConfig/validateSatelliteConfig/validateCommandConfig | command-ingress/services/config-validator.ts |
| 新建 DataRecorder 服务 | command-ingress/services/data-recorder.ts |
| 新建 calculateHighlights 纯函数 | command-ingress/utils/highlight-calculator.ts |
| **不修改** CommandIngressState（satelliteConfigs 由 useScoeConfig composable 内部管理） | — |
| 新增 loadSatellite/unloadSatellite/onReceiveData/sendTestData | command-ingress/services/command-ingress-service.ts |
| 新建 useScoeConfig composable（内部管理 satelliteConfigs/selectedConfigId + JSON 持久化） | command-ingress/composables/use-scoe-config.ts |
| 新建 useScoeMonitor composable | command-ingress/composables/use-scoe-monitor.ts |
| 新建 useTestTool composable | command-ingress/composables/use-test-tool.ts |
| 新建 useCentralDocking composable | command-ingress/composables/use-central-docking.ts |
| 新建 useTaskReport composable | command-ingress/composables/use-task-report.ts |
| 新建命令日志列定义 | command-ingress/components/command-log-columns.ts |
| 新建卫星配置列定义 | command-ingress/components/satellite-columns.ts |
| 新建甲方任务列定义 | command-ingress/components/docking-task-columns.ts |

### 共享基础设施

| 变更 | 文件 |
|------|------|
| 新建 JSON 持久化纯 TS 工具（零 Vue 依赖） | shared/persistence/json-persistence.ts |
| 新建 TaskExecutionDetail 基础组件 | widgets/TaskExecutionDetail.vue |
| 新建 FieldEditWidget 共享组件 | widgets/FieldEditWidget.vue |

### 页面

| 变更 | 文件 |
|------|------|
| 新建发送页 | pages/SendPage.vue |
| 新建任务页 | pages/TaskManagePage.vue |
| 新建指令接入页 | pages/CommandIngressPage.vue |
| 路由表新增 /tasks | app/routes.ts |

### 不建什么

- 不建 config-storage-service（composable 直接调 platform facade）
- 不建 TaskExecutor 抽象类（handler map 函数签名够了）
- 不建独立的发送页预览 API（re-export buildFrame 纯函数）
- 不建 cron 时间触发（TaskSchedulingMode 只有 timed/trigger/sequence）

---

## 任务域 Service Readiness Audit

**日期**: 2026-05-13
**结论**: 基础生命周期和查询 API 就绪，3 个 gap 需在 UI 实施前补齐

### 就绪项（直接可用）

| 操作 | 方法 | 状态 |
|------|------|------|
| 创建任务 | `createTask(def)` → instance | OK |
| 启动 | `startTask(id)` 门控 `created` | OK |
| 暂停 | `pauseTask(id)` 门控 `running` | OK |
| 恢复 | `resumeTask(id)` 门控 `paused` | OK |
| 停止 | `stopTask(id)` 门控 `running\|paused` | OK |
| 移除 | `removeTask(id)` 门控 terminal | OK |
| 重试 | `retryTask(id)` → 新 instance + 自动启动 | OK |
| 停止全部 | `stopAll()` 遍历 active | OK（无返回值） |
| 活动列表 | `selectActiveInstances` 返回非终止态 | OK |
| 进度查询 | `getProgress(id)` | OK |
| 校验 | `validateTaskDefinition` | OK |
| 序列化 | `serialize`/`deserialize` | OK |

### Gap 清单

| # | Gap | 影响 | 修复 | 文件 |
|---|-----|------|------|------|
| G1 | 无 `updateTask` | 编辑保存无法实现 | 新增方法，仅 `created` 态允许修改 definitionRef | task-service.ts, task-state.ts |
| G2 | 历史记录缺耗时/完成时间字段 | D-T3 历史列无法渲染 | selector 从 `startedAt`/`completedAt`/`stoppedAt`/`failedAt` 派生 elapsedMs + result | task-selectors.ts |
| G3 | `stopAll()` 无返回值 | UI 无法反馈停止数量 | 返回 `number` | task-service.ts |

### Phase 2 功能（task-real 类型重组后）

以下功能在 D-T5 设计中已预留入口但标注 Phase 2，UI 初始版隐藏：
- FieldVariation 编辑器（`task-real-brainstorm.md` 决策 6）
- exitCondition 停止条件（`task-real-brainstorm.md` 决策 1）
- step repeat 配置（`task-real-brainstorm.md` 决策 2）

### 代码精简建议（与 G1-G3 合并执行）

| 项目 | 说明 |
|------|------|
| 删除 `FrameReader` 接口 | adapters/ports.ts 中无消费方 |
| 内联 task-lifecycle-manager | 逻辑简单，合并到 task-service 减少间接层 |
| 删除 core/clone.ts 残留 | 无消费方，已用 structuredClone 替代 |
- 不建拖拽排序（上下移动按钮）
- 不在 CommandIngressState 混入配置编辑数据（satelliteConfigs 归 composable）
