# 帧域 + 连接页面 Design

## 元数据

- **类型**: design（结论和变化）
- **直接合同**: rewrite-ui-architecture-design.md, rewrite-frontend-conventions.md, 本文档
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, pages-frame-connection-brainstorm.md
- **日期**: 2026-05-12
- **brainstorm**: pages-frame-connection-brainstorm.md
- **状态**: 已锁定

---

## P1: 帧定义列表 (/frames)

### 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ┌─ TableToolbar ──────────────────────────────────────────────────────────┐ │
│ │ [搜索: 帧名称/ID/描述]  [方向▾] [仅收藏]  │  [新建] [导入] [导出]       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ content-area (flex flex-1 overflow-hidden gap-3) ─────────────────────┐ │
│ │ ┌─ DataTable (flex-1) ──────────────────────────────────────────────┐  │ │
│ │ │ # │ 帧ID     │ 名称     │ 方向    │ 字段数 │ 类型 │ 收藏 │ 操作 │  │ │
│ │ ├───┼──────────┼─────────┼────────┼───────┼─────┼─────┼──────┤  │ │
│ │ │ 1 │ frame_01 │ 遥测主帧 │ [接收] │ 24    │ 遥测 │  ★  │  ⋮   │  │ │
│ │ │ 2 │ frame_02 │ 注入指令 │ [发送] │ 12    │ 指令 │     │  ⋮   │  │ │
│ │ └────────────────────────────────────────────────────────────────────┘  │ │
│ │ ┌─ detail-panel (w-[320px]) ────────────────────────────────────────┐  │ │
│ │ │  帧详情                                              [关闭 ✕]    │  │ │
│ │ │  ────────────────────────────────────────────────────────────────│  │ │
│ │ │  ID: frame_01    名称: 遥测主帧    方向: 接收                     │  │ │
│ │ │  类型: 遥测      字段: 24         描述: 主遥测数据帧...            │  │ │
│ │ │  ────────────────────────────────────────────────────────────────│  │ │
│ │ │  字段预览（前 5 个）                                               │  │ │
│ │ │  sync_word  uint16  2B    frame_len  uint16  2B                   │  │ │
│ │ │  cmd_id     uint8   1B    voltage   float    4B                   │  │ │
│ │ │                                                [编辑帧]           │  │ │
│ │ └────────────────────────────────────────────────────────────────────┘  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**未选中时右侧面板**: 图标 + "选择一个帧查看详情"

### 列定义 (columns.ts)

| 列名 | field | sortable | 宽度 | 渲染 |
|------|-------|----------|------|------|
| # | _index | 否 | 48px | rowIndex + 1 |
| 帧ID | id | 是 | 140px | 文本 |
| 名称 | name | 是 | 自适应 | 文本 |
| 方向 | direction | 是 | 80px | QChip（发送=info色/接收=positive色） |
| 字段数 | fieldCount | 是 | 80px | 数字 |
| 类型 | frameType | 是 | 100px | 文本，空值 '--' |
| 收藏 | isFavorite | 是 | 56px | 星标图标 |
| 操作 | _actions | 否 | 160px | [收藏][编辑][复制][删除] |

### 交互流程

**搜索/筛选 → 列表刷新**:
```
TableToolbar emit('update:search') / emit('update:filter')
  → FrameListPage 更新 query ref
  → watch(query) → frameRows.value = service.listFrameAssetSummaries(source, query)
  → shallowRef 整组替换
```

**单行操作**:
- 收藏: service.upsertFrame({ ...frame, isFavorite: !frame.isFavorite }) → refreshList → $q.notify('positive')
- 编辑: router.push('/frames/editor/' + frameId)
- 复制: cloneFrameAsset → 改 id/name → service.upsertFrame(cloned) → refreshList
- 删除: $q.dialog() 确认 → service.removeFrame(frameId) → refreshList

**导入对话框**:
```
QFile 选择 JSON → deserializeFrames(text)
  → { ok, frames, issues }
  → 预览：帧数量 + issues 列表（error 禁用导入，warning 允许）
  → 确认：replaceFrames(parsedFrames)
  → emit('imported') + close
```

**导出流程**:
```
点击导出 → findFrameAssets(source) 获取全量帧数据
  → serializeFrames(frames) 生成 JSON 字符串
  → platform facade (platform.getTransportFacade()?.saveFile 或 platform dialog) 写文件
  → $q.notify('positive', '导出成功') / catch → $q.notify('negative', '导出失败')
```

### 组件结构

```
pages/FrameListPage.vue                    # 路由页面，数据编排
features/frame/components/
  FrameDetailPanel.vue                     # 右侧详情面板
  ImportFrameDialog.vue                    # 导入对话框
  columns.ts                               # 列定义
widgets/
  DataTable.vue                            # P0 通用表格
  TableToolbar.vue                         # P1 通用工具栏
```

#### FrameListPage.vue
- 状态: searchQuery, directionFilter, favoriteOnly, selectedFrameId, showImportDialog
- 数据: frameRows(shallowRef), selectedFrame(computed)
- 编排: query computed → watch → refreshList

#### FrameDetailPanel.vue
- Props: `{ frame?: ReadonlyFrameAsset }`
- Emits: `{ edit: [frameId: string], close: [] }`
- 展示: 元数据区 + 字段预览（前 5 条）+ [编辑帧] 按钮

#### ImportFrameDialog.vue
- Props: `{ modelValue: boolean }`
- Emits: `{ 'update:modelValue': [boolean], imported: [count: number] }`

---

## P2: 帧定义编辑 (/frames/editor/:frameId?)

### 布局

```
┌── max-width: 1120px 居中 ──────────────────────────────────────────────────┐
│ ┌─ sticky-bar ───────────────────────────────────────────────────────────┐ │
│ │  ← 返回列表      编辑帧配置 / 创建帧配置                  [取消] [保存] │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ ┌─ 基本信息 (QCard) ───────────────────────────────────────────────────┐  │
│ │  帧名称* [      ]   帧ID* [      ]   帧方向 [发送 ▾]                │  │
│ │  帧类型 [      ]   协议 [      ]                                    │  │
│ │  描述 [textarea autogrow                                       ]    │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│ ┌─ 帧识别规则 (仅 receive) ────────────────────────────────────────────┐  │
│ │  规则 #1                          规则 #2                  [+ 添加]  │  │
│ │  起始[  ] 结束[  ] 操作[=▾] 值[  ]  ...逻辑[AND▾]                   │  │
│ └──────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│ ┌─ 字段列表 (DataTable) ────────────────────────────────────────────┐   │
│ │  字段列表  5项 / 总长: 48b (6B)                        [排序模式]    │   │
│ │  ┌────────────────────────────────────────────────────────────────┐  │   │
│ │  │ 名称  │ 类型   │ 长度 │ 参与类型 │ 输入类型 │ 操作          │  │   │
│ │  ├───────┼────────┼──────┼─────────┼─────────┼───────────────┤  │   │
│ │  │ 帧头  │ uint16 │ 2B   │ 直接    │ input   │ [复制] [删除] │  │   │
│ │  │ 长度  │ uint16 │ 2B   │ 直接    │ input   │ [复制] [删除] │  │   │
│ │  │ 数据域│ bytes  │ 32B  │ 直接    │ input   │ [复制] [删除] │  │   │
│ │  └────────────────────────────────────────────────────────────────┘  │   │
│ │  [+ 添加字段]                                                        │   │
│ └──────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 字段编辑对话框

```
┌── QDialog (class: rw-dialog-lg, max-height: 80vh) ─────────────────────────┐
│  编辑字段 / 添加字段                                          [X]        │
│───────────────────────────────────────────────────────────────────────────│
│  ┌── 左侧 (55%) ──────────┐  ┌── 右侧 (45%) ──────────────────────┐    │
│  │ 名称* [              ] │  │ (按 inputType 切换)                 │    │
│  │ 类型 [uint16 ▾]       │  │                                     │    │
│  │ 长度 [2    ] 倍率 [1 ]│  │ expression: 变量映射+条件表达式      │    │
│  │ 输入类型 [input ▾]    │  │ select/radio: 选项列表              │    │
│  │ 默认值 [         ]    │  │ input: 空状态                       │    │
│  │ 参与类型 [直接 ▾]     │  │                                     │    │
│  │ [x]可配置 ()小端 ●大端│  │                                     │    │
│  │ [x]ASCII (bytes)      │  │                                     │    │
│  │ 描述 [textarea    ]   │  │                                     │    │
│  │ ┌─ 校验和(折叠) ────┐ │  │                                     │    │
│  │ │ [Toggle] 方法[CRC]│ │  │                                     │    │
│  │ │ 起始[  ] 结束[  ] │ │  │                                     │    │
│  │ └──────────────────┘ │  │                                     │    │
│  └────────────────────────┘  └─────────────────────────────────────┘    │
│  ┌─ 校验反馈区 (issues 列表，error 时显示) ─────────────────────────┐    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                               [取消]  [确认保存]         │
└───────────────────────────────────────────────────────────────────────────┘
```

### 组件结构

```
pages/FrameEditorPage.vue                  # 路由页面，dirty tracking + 保存编排
features/frame/components/
  FrameBasicInfoForm.vue                   # 基本信息（名称/ID/方向/描述）
  FrameIdentifierRulesEditor.vue           # 帧识别规则（仅 receive）
  FrameFieldList.vue                       # 字段列表（展示+拖拽排序+增删操作）
  FrameFieldEditorDialog.vue               # 字段编辑对话框
  FrameFieldExpressionConfig.vue           # 表达式配置（变量映射+条件表达式）
  FrameFieldOptionConfig.vue               # 选项配置（select/radio 选项列表）
```

#### FrameEditorPage.vue
- 状态: workingFrame(Ref<FrameAsset>), originalSnapshot(Ref<string>), isDirty(computed), fieldEditorOpen, editingFieldIndex
- 脏检测: `JSON.stringify(workingFrame) !== originalSnapshot`
- 路由守卫: onBeforeRouteLeave → isDirty? → $q.dialog() 确认
- 保存: validateFrameAsset → service.upsertFrame(workingFrame) → router.push('/frames')

#### FrameFieldEditorDialog.vue
- Props: `{ modelValue: boolean, field: FrameFieldDefinition | null, allFields: FrameFieldDefinition[], frameId: string, isNew: boolean }`
- Emits: `{ 'update:modelValue': [boolean], save: [field: FrameFieldDefinition, index: number | null] }`
- 生命周期: 打开时深拷贝 → 关闭时 @hide 重置
- 校验: 保存时 validateFrameField → issues 展示在底部

#### FrameFieldExpressionConfig.vue
- Props: `{ expression: ExpressionDefinition, allFields: FrameFieldDefinition[], frameId: string }`
- Emits: `{ 'update:expression': [ExpressionDefinition], 'validation-issues': [ValidationIssue[]] }`
- 变量映射行: 标识符 + 数据源类型(current_field/frame_field/global_stat) + 来源选择
- frame_field 级联: selectFrameReferenceOptions → selectFieldReferenceOptions({ frameId })

#### FrameFieldOptionConfig.vue
- Props: `{ options: FrameOptionDefinition[], inputType: 'select' | 'radio' }`
- Emits: `{ 'update:options': [FrameOptionDefinition[]] }`

### 交互流程

**新建 vs 编辑**:
- `/frames/editor`（无 frameId）→ 空帧模板，标题"创建帧配置"
- `/frames/editor/:frameId` → getFrameAsset + cloneFrameAsset，标题"编辑帧配置"

**拖拽排序**: 字段列表支持拖拽排序（旧系统有，高频操作）。实现方式待定（vuedraggable 或简易拖拽），MVP 阶段可先用上移/下移按钮，后续迭代升级为拖拽。

**表达式变量映射数据流**:
```
用户选择 sourceType='frame_field'
  → selectFrameReferenceOptions(source) → 帧下拉列表
  → 用户选帧
  → selectFieldReferenceOptions(source, { frameId }) → 字段下拉列表
  → 用户选字段
  → 写入 ExpressionVariableDefinition.frameId / .fieldId
```

---

## P3: 连接管理 (/connection)

### 布局（简化版 — 单栏居中）

```
┌──────────────────────────────────────────────────────────┐
│  连接管理                                    [+ 新建连接] │
│                                                          │
│  ── 串口连接 ──────────────────────────────────────      │
│  ┌─ StatusBadge[已连接] COM3  9600          [断开] [✕] ─┐│
│  └──────────────────────────────────────────────────────┘│
│  ┌─ StatusBadge[未连接] COM5                  [连接] [✕] ┐│
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ── 网络连接 ──────────────────────────────────────      │
│  ┌─ StatusBadge[已连接] TCP-Srv 0.0.0.0:8080 [断开] [✕]┐│
│  └──────────────────────────────────────────────────────┘│
│  ┌─ StatusBadge[连接中] UDP 192.168.1.100:9090  [取消] ─┐│
│  └──────────────────────────────────────────────────────┘│
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**设计要点**: 连接数量少（<20），不需要主从双栏。每行 QCard 直接包含所有信息和操作。无右侧详情面板、无数据统计、无控制台。

### 新建连接对话框

```
┌── 步骤1: 类型选择 ─────────────────────────────────────────┐
│                                                             │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   串口       │  │  TCP Client  │                        │
│  │  Serial      │  │  TCP 客户端   │                        │
│  └──────────────┘  └──────────────┘                        │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  TCP Server  │  │    UDP       │                        │
│  │  TCP 服务端   │  │  UDP 数据报  │                        │
│  └──────────────┘  └──────────────┘                        │
│                                             [取消]          │
└─────────────────────────────────────────────────────────────┘

┌── 步骤2: 配置表单 ─────────────────────────────────────────┐
│  新建串口连接                                    [X]        │
│  ─────────────────────────────────────────────────────────│
│  连接名称 [              ]                                 │
│  端口     [COM3 ▾] [🔄]    ← discoverResources + 刷新     │
│  波特率   [115200 ▾]        ← 预设值 + 自定义输入           │
│                                             [取消] [连接]  │
└─────────────────────────────────────────────────────────────┘
```

### 组件结构（简化版）

```
pages/ConnectionPage.vue                   # 路由页面，service 调用
features/connection/components/
  ConnectionCard.vue                       # 单个连接行（StatusBadge+信息+按钮）
  NewConnectionDialog.vue                  # 新建对话框（类型选择 + 统一表单 + v-if 切换）
widgets/
  StatusBadge.vue                          # P1 状态标签
```

#### ConnectionPage.vue
- 状态: operatingIds(Set<string>)
- 数据流: setInterval 独立轮询 service.getSnapshot() + selectConnectionSummaries(snapshot)，onMounted 启动 / onBeforeUnmount 清除

#### ConnectionCard.vue
- Props: `{ summary: ConnectionSummary, operating: boolean }`
- Emits: `{ connect: [], disconnect: [], delete: [] }`
- 展示: StatusBadge + 名称 + 路由信息 + 自动连接Toggle + [连接/断开] + [删除✕]
- 错误状态: lifecycle='error' 时 StatusBadge 显示 negative 色 + lastError 信息展开区

#### NewConnectionDialog.vue
- Props: `{ modelValue: boolean }`
- Emits: `{ 'update:modelValue': [boolean], create: [config: TransportConfig] }`
- 内部: 类型选择(2x2 QCard) → 单一表单(通过 v-if 按 kind 切换字段)
- 串口: portPath(QSelect + 刷新) + baudRate(QSelect) + autoConnect(QToggle)
- TCP Client: host + port + autoConnect(QToggle)
- TCP Server: host(默认 0.0.0.0) + port + autoConnect(QToggle)
- UDP: localHost + localPort + remoteHost?(可选) + remotePort?(可选) + autoConnect(QToggle)
- 确认后构建 TransportConfig → connect(config)

### 交互流程

**连接/断开**:
```
点击按钮 → operatingIds.add(id) → 按钮 loading
  → service.connect(config) / service.disconnect(id)
  → operatingIds.delete(id)
  → $q.notify(positive/negative)
```

**新建连接**:
```
点击"新建连接" → NewConnectionDialog
  → 类型选择 → 表单填写
  → 串口: discoverResources() 枚举端口
  → 确认 → TransportConfig → service.connect(config)
  → 成功: close + notify / 失败: 对话框内显示错误
```

**自动连接**（Phase 1 会话态）: 新建连接时可勾选 autoConnect。勾选后，本次应用会话内该连接断开后会自动重连。连接卡片上有 Toggle 开关可随时切换。**Phase 1 限制**: 配置仅存在于内存，应用重启后丢失，需重新手动连接或重新配置。**前置条件**: BaseTransportConfig 需新增 `autoConnect?: boolean` 字段。**Phase 2**: 实现连接配置持久化（通过 settings 或独立存储），autoConnect 配置跨重启保留并实现启动时自动连接。

**删除**:
```
点击 [✕] → $q.dialog() 确认
  → 如果 connected: service.disconnect(id)
  → 第一阶段不真正删除 config（service 无 removeConfig）
```

**已移除**（用户确认不需要）:
- 右侧详情面板 / 控制台
- RX/TX 收发字节数统计
- 重连状态展示
- UDP 多远程主机
- WebSocket 连接类型
- 串口测试工具 tab（SerialTestTools）
- 网络测试工具（NetworkTestTools，旧系统已注释掉）
- 连接编辑功能（Phase 1 不建，service 无 updateConfig；后续迭代可加）
- 串口高级选项（dataBits/stopBits/parity/flowControl — 新类型层只有 portPath+baudRate，默认 8N1）
- FrameOptionsDefinition 编辑 UI（autoChecksum/bigEndian/includeLengthField — 旧系统也无此 UI，被注释掉）

**Phase 1 限制**（待 Phase 2 实现）:
- 连接配置持久化（当前仅内存态，重启丢失）
- autoConnect 跨重启保留（依赖持久化）
- 连接配置编辑（需 service 层新增 updateConfig）

---

## 路由

| 路由 | 页面 | Feature | 布局模式 |
|------|------|---------|---------|
| /frames | 帧定义列表 | frame | 模式A 主从双栏 |
| /frames/editor/:frameId? | 帧定义编辑 | frame | 模式C 单栏居中 |
| /connection | 连接管理 | connection | 模式C 单栏居中（简化） |

---

## Widget 使用

| Widget | 帧列表 | 帧编辑 | 连接管理 | 说明 |
|--------|--------|--------|---------|------|
| DataTable | ✅ | — | — | QTable + virtual-scroll |
| TableToolbar | ✅ | — | — | 搜索+筛选+操作按钮 |
| StatusBadge | — | — | ✅ | 连接状态（行内，非面板） |
| FrameSelector | — | — | — | 不在当前 3 页面使用 |
| QChip | ✅(方向) | — | — | 固定标签场景 |

---

## 前置条件：Service 层变更

以下变更必须在 UI 实施前完成。UI 层不做任何补丁适配，所有能力缺口在 service 层修复。

### S1: Frame Service 暴露单帧操作

**当前问题**：service 只暴露 `replaceFrames`（全量替换），但 UI 所有操作都是单帧级别。迫使 UI 写读-改-写模板代码。

**变更**：
- `FrameAssetService` 新增 `upsertFrame(frame: FrameAsset): FrameAssetOperationResult`
- `FrameAssetService` 新增 `removeFrame(frameId: string): FrameAssetOperationResult`
- 内部实现委托给 `FrameStateContainer.upsertFrame` / `removeFrame`（state 层已有）

**UI 消费方式**：
```ts
// 收藏切换 — 直接调，不读全量
await service.upsertFrame({ ...frame, isFavorite: !frame.isFavorite })
// 删除 — 直接调
await service.removeFrame(frameId)
```

`replaceFrames` 保留，仅用于导入等全量替换场景。

### S2: Connection Service 类型修正

**当前问题**：`connect(config: unknown)` 接收 unknown，类型安全全靠消费方自觉。

**变更**：
- 签名改为 `connect(config: TransportConfig): Promise<ConnectionOperationOutcome>`
- 内部 `normalizeTransportConfig` 不变，只是入参类型收紧

### S3: Connection Service 原子化 connect

**当前问题**：`connect` 在 `adapter.connect()` 之前就 `upsertConfig`，失败后幽灵 config 留在 state 中。UI 层无法清理（service 没有 removeConfig）。

**变更**：
- `connect` 内部流程改为：先 adapter.connect()，成功后才 upsertConfig + applyEvent
- 失败时不写入任何 state，直接返回失败结果
- 如需记录失败信息，通过单独的 error event（不绑定 config）

### S4: Connection Reader 暴露 discoverResources

**当前问题**：`discoverResources` 只在 `RealSerialAdapter` 上，UI 需穿透到 adapter 层调用。

**变更**：
- `ConnectionReader` 接口新增 `discoverResources(): Promise<readonly ConnectionResourceCandidate[]>`
- `createConnectionService` 内部委托给已注册的 serial adapter
- 无 serial adapter 时返回空数组
- UI 只调 `service.discoverResources()`，不引用 adapter

---

## 实施约束

### C1: Composable 抽取

实现时必须抽取以下 composable，页面组件只做编排和渲染：

| Composable | 位置 | 职责 | 消费页面 |
|---|---|---|---|
| `useFrameList` | `features/frame/composables/` | query 组合 + shallowRef + watch + refreshList | FrameListPage |
| `useFrameEditor` | `features/frame/composables/` | workingFrame + dirty tracking + save + route guard | FrameEditorPage |
| `useFieldEditor` | `features/frame/composables/` | fieldEditorOpen + editingIndex + openAdd / openEdit / saveField / removeField | FrameEditorPage |
| `useAsyncOperation` | `shared/composables/` | operatingIds + execute(fn, id) + notify，通用防重入 | FrameListPage, ConnectionPage |

**注意**：不需要 `useFrameMutations`（S1 后单帧操作直接调 service）和 `useConnectionPage`（discoverResources 和 connect 已归口 service，不需要 composable 层适配）。

**useAsyncOperation 签名**:
```ts
export function useAsyncOperation() {
  const operatingIds: Readonly<Ref<Set<string>>>
  function isOperating(id: string): boolean
  async function execute<T>(
    id: string,
    fn: () => Promise<T>,
    opts?: { onSuccess?: (r: T) => void; onError?: (e: unknown) => void }
  ): Promise<T | undefined>
}
```

### C2: 组件结构约束

**provide/inject 替代 prop drilling**:
- `FrameEditorPage` provide `{ frameId, allFields }` context
- `FrameFieldExpressionConfig` inject 消费，不再透传过 FrameFieldList / FrameFieldEditorDialog

**autoConnect QToggle 提到 v-if 块外**:
- `NewConnectionDialog` 中 autoConnect 是所有连接类型共享的字段，放在类型特定字段下方，不随 v-if 重复

**字段编辑对话框脏保护**:
- `FrameFieldEditorDialog` 内部维护 `fieldDirty` ref
- 对话框打开且有脏修改时：点关闭 → 确认丢弃；点其他字段 → 确认切换
- `onBeforeRouteLeave` 检查 `isDirty || fieldEditorDirty`

### C3: 生命周期管理

**连接页 UI 刷新**:
- `ConnectionPage.vue` 使用独立的 `setInterval` + `service.getSnapshot()` + `selectConnectionSummaries()` 轮询连接状态
- `onMounted` 启动 interval，`onBeforeUnmount` 清除
- 不使用 `runtime.startTickDriver()`（tick driver 是全局数据路由引擎，不属于单页面）

**operatingIds 覆盖所有按钮**:
- 连接卡片 operating 后，该卡片所有按钮（连接/断开/删除/autoConnect toggle）全部禁用
- 防止同一连接的并发操作

**组件卸载后忽略回调**:
- 所有 async 操作使用 `disposed` flag，`onUnmounted` 设为 true
- 回调中检查 `if (disposed) return`

### C4: 错误处理边界

**discoverResources 失败**:
- 串口下拉显示空 + 红色提示"无法枚举串口设备" + 刷新按钮可用
- QSelect 配置 `use-input` 允许手动输入自定义端口路径

**串口枚举返回空列表**:
- 下拉空 + 提示"未检测到串口设备，请连接设备后点击刷新"

**replaceFrames / upsertFrame / removeFrame 失败**:
- snapshot 未变，refreshList 后 UI 恢复正确状态
- `$q.notify('negative')` 提示失败原因

**空列表导出**:
- 禁用导出按钮（或导出时 notify 提示"当前无可导出的帧定义"）
