# [S008] 中心对接 UI 设计与实施

> 2026-06-10 | 设计+实施 | 状态: 实施完成
> 2026-06-11 续接 — 补充可配置设备表+用例目录表+数据喂给 northbound service

## 目标

把 CommandIngressPage 现有"中心对接" tab 从空壳接成全功能 UI：配置表单 + 连接管理 + 状态面板 + 任务列表 + 设备列表 + 上报弹窗。

## 事实基础

### 现有代码

| 文件 | 状态 |
|------|------|
| `pages/CommandIngressPage.vue` | 已有 tab 骨架（L706-781），composable 全部 throw |
| `features/command-ingress/composables/use-central-docking.ts` | connect/disconnect/saveConfig 全部 `throw new Error('Not implemented')` |
| `features/command-ingress/composables/use-task-report.ts` | reportTasks 全部 throw |
| `features/command-ingress/components/docking-task-columns.ts` | 已有列定义 |

### Service 层（零 gap）

| UI 操作 | Service API | 位置 |
|---------|-------------|------|
| 填配置→启动 | `northboundService.start(NorthboundConfig)` | northbound-service.ts |
| 停止 | `northboundService.stop()` | northbound-service.ts |
| 是否在线 | `northboundService.isActive()` | northbound-service.ts |
| 会话状态 | `northboundService.getSessionStatus()` → NorthboundSessionSnapshot | northbound-state.ts |
| 认证 | 内部 AuthService，`postToCustomer` 自动 ensureToken | auth.ts |
| 心跳 | 内部 HeartbeatTimer，start 时自动 15s | heartbeat-timer.ts |
| 步骤上报 | `handleStepResult` + `reportTaskResult` 内部自动 | northbound-service.ts |

### NorthboundConfig 字段（对齐两份甲方文档）

```ts
NorthboundConfig {
  serverHost: string         // 本地 HTTP server 监听地址
  serverPort: number         // 本地 HTTP server 监听端口
  customerBaseUrl: string    // 甲方 base URL（/partner-api/）
  subSysType: string         // 子系统类型（ADS/KPS/WER/FPS/LAS/SEU）
  subSysId: string           // 子系统 ID（格式：类型_3位数字）
  auth: AuthConfig {         // 控制接口规范 V1.0
    loginUrl: string         // 认证 URL（可从 customerBaseUrl 推导）
    clientId: string
    username: string
    password: string
    grantType: string        // 固定 "partner"
    tenantId: string         // 固定 "000000"
  }
}
```

### 数据流全链路

```
甲方 setTestTask → northbound handler
  → translateTestCaseToMockTaskDefinition → taskService.createTask
  → taskService.startTask → 执行 steps
    → send 步骤 → sendService.execute → connectionService.write
    → wait-condition 步骤 → receiveEventSource（等接收匹配）
  → 每步完成 → onStepResult callback → northbound.handleStepResult → msgReport
  → 任务结束 → reportTaskResult → testCaseResultReport
```

## 设计决策

### D1: 配置表单

**决策：弹窗内 QForm，9 个字段分两区**

区域 1 — 服务器配置：
- serverHost（QInput, 默认 "0.0.0.0"）
- serverPort（QInput type=number, 默认 5001）
- customerBaseUrl（QInput, 默认 "http://ip/partner-api/"）
- subSysType（QSelect, options 从甲方编码表取）
- subSysId（QInput, placeholder "ADS_001"）

区域 2 — 认证配置（QExpansionItem 可折叠）：
- loginUrl（QInput, 从 customerBaseUrl 推导但可覆盖）
- clientId（QInput）
- username（QInput）
- password（QInput type=password）
- grantType（QInput, 固定 "partner", readonly）
- tenantId（QInput, 固定 "000000", readonly）

**理由：** grantType 和 tenantId 在甲方文档中是固定值，UI 显示但不可编辑，避免用户误改。

### D2: 任务列表数据来源

**决策：composable 桥接两个 service，polling 驱动**

```
usePolling(1000) → 每秒刷新
  1. northboundService.getSessionStatus() → testCaseId → instanceId 映射
  2. 逐个 taskService.getInstance(instanceId) → 真实 lifecycle + progress
  3. 合并为 UI 行数据：{ testCaseId, instanceId, lifecycle, currentStep, stepsTotal, startedAt }
```

**不改 task service API，不改 northbound service API。** composable 是自然的数据桥接层。

备选方案（已否决）：增强 NorthboundSessionSnapshot 让它感知 task lifecycle。改动大，且违反"service 管协议，UI 管展示"分层。

**任务列表展示字段：**

| 列 | 来源 | 说明 |
|----|------|------|
| testCaseId | northboundState 映射 | 甲方用例 ID |
| 任务名称 | taskService.getInstance().definitionRef.name | 翻译后的名称 |
| 状态 | taskService.getInstance().lifecycle | running/completed/failed 等 |
| 进度 | taskService.getProgress() | stepsCompleted/stepsTotal |
| 开始时间 | taskService.getInstance().startedAt | ISO 时间 |
| 操作 | — | 停止按钮（调 northboundService 内部 stopTask） |

### D3: 设备列表

**决策：只展示甲方设备（DeviceInfoItem），数据源接 mock**

设备列表展示甲方 V1.0.4 定义的设备模型：

| 列 | 说明 |
|----|------|
| name | 设备名称 |
| deviceId | 设备 ID |
| type | 设备类型 |
| ip | IP 地址 |
| status | online/offline/alarm/error/busying/available |

数据来源：当前硬编码 mock（MOCK_DEVICE），联调时替换为甲方实际下发的设备信息或本地连接设备的映射。

**不改 connectionService 的数据展示在此 tab**，本地连接管理在已有页面。

### D4: 上报弹窗

**决策：只读状态展示，不做手动上报触发**

上报逻辑已在 northbound service 内自动完成：
- msgReport：每 step 完成 → onStepResult callback → 自动上报
- testCaseResultReport：task 终态 → onSettled → 自动上报
- heartbeat：15s 定时器自动上报

弹窗展示：
- 上报统计（已发送 msgReport 数、已发送 resultReport 数）
- 最近上报记录列表（时间 + 类型 + 状态）
- 不需要"手动触发上报"按钮（任务执行自动驱动）

**理由：** 上报是任务执行副产物，不是用户主动操作。弹窗的价值是让用户看到"甲方那边收到了什么"。

### D5: 配置持久化

**决策：localStorage，composable 管理**

配置（不含 password）存入 localStorage，下次打开页面自动填充。Password 不持久化（安全考虑）。

key: `northbound-docking-config`

```ts
interface PersistedConfig {
  serverHost: string;
  serverPort: number;
  customerBaseUrl: string;
  subSysType: string;
  subSysId: string;
  auth: {
    loginUrl: string;
    clientId: string;
    username: string;
    // password 不存储
    grantType: string;
    tenantId: string;
  };
}
```

### D6: 状态面板

**决策：保留现有 3 个 StatusBadge，数据源接真实 service**

- HTTPS 状态：`northboundService.isActive()` → connected/disconnected
- 心跳状态：需要新增能力（当前 HeartbeatTimer 只有 isRunning，没有"上次成功时间"）
  - MVP 方案：如果 isRunning() 且 isActive() → active，否则 inactive
- 设备状态：当前全 mock → 简化为 online（如果 isActive）

### D7: 连接/断开按钮

**决策：配置弹窗点"保存并连接"→ start(config)，状态栏有"断开"按钮**

交互流程：
1. 用户点"对接配置" → 弹出配置弹窗（自动填充上次保存的配置）
2. 填完配置点"保存并连接" → 校验必填 → `northboundService.start(config)` → 弹窗关闭
3. 状态面板实时显示 HTTPS/心跳/设备状态
4. 用户点"断开" → `northboundService.stop()` → 状态回到 disconnected

## Composable 重构方案

### use-central-docking.ts（重写）

```ts
// 输入
interface UseCentralDockingOptions {
  northboundService: NorthboundService;
  taskService: TaskService;
}

// 返回
interface UseCentralDockingReturn {
  // 连接状态
  connectionState: Ref<DockingConnectionState>;  // 保留现有类型
  isActive: Ref<boolean>;

  // 配置
  config: Ref<DockingConfigForm>;
  showConfigDialog: Ref<boolean>;
  saveConfigAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // 任务列表
  dockingTasks: ShallowRef<readonly DockingTaskRow[]>;

  // 设备列表（mock）
  devices: ShallowRef<readonly DeviceInfoItem[]>;
}
```

### docking-task-columns.ts（可能需调整列定义）

新增列：progress（stepsCompleted/stepsTotal）、startedAt。现有列定义检查是否对齐新 DockingTaskRow 类型。

## 实施步骤

1. **重写 use-central-docking.ts** — 接线 northbound service + task service，polling 驱动
2. **调整 docking-task-columns.ts** — 对齐新 DockingTaskRow 类型
3. **实现配置弹窗** — QForm 9 字段，localStorage 持久化
4. **实现状态面板** — 3 个 StatusBadge 接真实数据
5. **实现设备列表** — mock 数据表格
6. **实现上报弹窗** — 只读统计展示
7. **CommandIngressPage.vue 调整** — 替换 stub composable，弹窗从空壳改为真实表单
8. **验证** — build + lint + 手工检查页面可用

## 已确认

- [x] 上报弹窗：带最近上报记录列表（时间 + 类型 + 状态）
- [x] 心跳状态：MVP 方案（isActive + isRunning）够用
- [x] 任务列表：需要本地手动停任务按钮（调 taskService.stopTask）

## 后续

- 进入 Lane B 实施

---

## 实施记录

### 2026-06-10 第一轮

完成基础接线：
- 重写 `use-central-docking.ts`：service 注入（northboundService + taskService + resultService），polling 驱动 refresh，connect/disconnect，stopTask，上报记录追踪
- 更新 `docking-task-columns.ts`：对齐 DockingTaskRow（testCaseId/name/lifecycle/progress/startedAt/actions）
- 新增 `docking-labels.ts`：status maps + 子系统类型选项 + 默认配置 + mock 设备
- 新增 `report-record-columns.ts`：上报记录表格列
- 更新 `CommandIngressPage.vue`：配置弹窗（9 字段两区 + 认证可折叠）、连接/断开、任务列表含停止按钮、设备列表、上报记录弹窗
- lint 零新增 error

### 2026-06-11 第二轮 — 可配置数据表

用户纠正理解：设备表和用例目录表不是只展示 mock，而是**可配置**，配置后的数据喂给 northbound service 的 getDeviceList/getTestCaseAll handler。

改动：
- `northbound-service.ts`：新增 `setDeviceList()` 和 `setTestCatalogData()` 方法，handler 从可配置数据读取而非硬编码 MOCK
- `use-central-docking.ts`：
  - 设备 CRUD（addDevice/updateDevice/removeDevice）+ localStorage 持久化（`northbound-docking-devices`）
  - 用例目录更新（updateTestCatalog）+ localStorage 持久化（`northbound-docking-test-catalog`）
  - 初始化时加载 localStorage 数据并同步到 service
- `docking-labels.ts`：新增 `DEFAULT_TEST_CATALOG`（V1.0.4 getTestCaseAll 格式）
- `CommandIngressPage.vue`：
  - 内嵌 tab 从 2 个变 3 个：任务列表 / 设备列表 / 用例目录
  - 设备列表变为可编辑表格（添加/编辑/删除），附设备编辑弹窗
  - 用例目录为 JSON 编辑器（textarea），可保存
- lint 零新增 error（6 个预先存在的 error 不属于本次改动）

### 改动文件汇总

| 文件 | 操作 |
|------|------|
| `rewrite/src/features/northbound/services/northbound-service.ts` | 修改：新增 setDeviceList/setTestCatalogData，handler 读可配置数据 |
| `rewrite/src/features/command-ingress/composables/use-central-docking.ts` | 重写：全功能 composable |
| `rewrite/src/features/command-ingress/components/docking-task-columns.ts` | 重写：对齐新类型 |
| `rewrite/src/features/command-ingress/components/docking-labels.ts` | 新增 |
| `rewrite/src/features/command-ingress/components/report-record-columns.ts` | 新增 |
| `rewrite/src/pages/CommandIngressPage.vue` | 大幅修改：Tab 3 全功能 |
| `.sessions/.../S008-docking-ui-design.md` | 本文件 |

### 验证证据

- lint：6 个 error 全部预先存在，零新增
- build：预先存在的 rollup source phase import 问题，与本次无关

### 未决

- 用例目录当前为 JSON 编辑器，后续需接任务系统自动生成（用户确认"暂时表格+mock，后续接到任务那边"）
- 设备表手动配置，后续可接 connectionService 自动映射
- DevTools 看不到 HTTP 请求（走 main process IPC），已加 console.log 日志：`[northbound auth]`/`[northbound ← 甲方]`/`[northbound → 甲方]`
- 默认参数已填：clientId/username/grantType/tenantId，用户只需填 customerBaseUrl + password
- 连接失败有 notify 错误提示

### 2026-06-11 第三轮 — Mock 状态审计 + Task 集成问题

#### Mock vs Real 现状

| 环节 | mock / real | 说明 |
|------|------------|------|
| 用例目录上报（getTestCaseAll） | mock | 硬编码 MOCK_TEST_CASES，UI 可配置 |
| 甲方下发任务执行（setTestTask） | mock | translateTestCaseToMockTaskDefinition，1.5s delay step |
| 真实翻译函数 | 已写好未启用 | translateTestCaseToTaskDefinition（send + wait-condition step） |
| 步骤实时上报（msgReport） | real | onStepResult callback → 翻译 → POST |
| 任务结果上报（testCaseResultReport） | real | onSettled → collectResult → verdict → POST |
| TestReport.json FTP | mock 数据占位 | 结构正确，内容为 mock checkPoints/processAndDatas |
| 设备列表（getDeviceList） | mock 可配置 | UI CRUD + localStorage → setDeviceList |
| Auth / heartbeat | real | JWT + 15s 定时器 |
| 12 入站 handler / 9 出站 translator | real | 全部实现，113 tests |

#### 发现的问题

**BUG: Task step kind `o_send` vs `send` 不匹配**
- 核心 types.ts 定义 step kind = `'send'`
- TaskManagePage.vue / TaskExecutionDetail.vue 里用 `'o_send'` 判断
- 影响：UI 里发送帧步骤的渲染/编辑对不上

**Task UI 集成问题**
- 北向任务和用户手动创建的任务混在同一个列表，无法区分
- 无 testCaseId → instanceId 的可视化关联
- 导入/导出为空壳函数
- 变量参数、退出条件等 UI 未实现

#### 用户确认的理解

- Task 是和 send 配合的功能（task 包含 send step + wait-condition step）
- 甲方的"任务列表"是用例目录（getTestCaseAll），上报给甲方
- 每个用例关联到发送侧的帧定义（frameId）和目标（targetId）
- 因时间紧迫，目前甲方侧用例目录和任务执行都是 mock
- 上报链路（msgReport + testCaseResultReport + TestReport）已通

#### 待讨论

- 当前 mock 能否正常工作（端到端验证）
- Task UI 如何展示北向任务（区分、关联）
