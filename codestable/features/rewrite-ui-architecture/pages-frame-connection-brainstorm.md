# 帧域 + 连接页面 Brainstorm

## 元数据

- **类型**: brainstorm（事实 + 分析 + 自检）
- **直接合同**: rewrite-ui-architecture-design.md, rewrite-frontend-conventions.md
- **边界护栏**: CLAUDE.md, rewrite-target-structure.md, rewrite-frontend-checklist.md, 旧系统帧管理/连接页面行为
- **日期**: 2026-05-12
- **决策状态**: 全部锁定

---

## 一、事实层

### 1.1 新系统 Frame Feature Public API

**Selectors（只读）**:

| Selector | 输入 | 输出 | 用途 |
|----------|------|------|------|
| `listFrameAssetSummaries(source, query?)` | FrameAssetSource, FrameAssetQuery? | FrameAssetSummary[] | 列表展示（轻量摘要） |
| `findFrameAssets(source, query?)` | FrameAssetSource, FrameAssetQuery? | ReadonlyFrameAsset[] | 完整帧数据 |
| `getFrameAsset(source, frameId)` | FrameAssetSource, string | ReadonlyFrameAsset \| undefined | 单帧查询 |
| `getSelectedFrameAsset(source)` | FrameAssetSource | ReadonlyFrameAsset \| undefined | 当前选中帧 |
| `selectFrameReferenceOptions(source, query?)` | FrameAssetSource, FrameAssetQuery? | FrameReferenceOption[] | 帧下拉选项 |
| `selectFieldReferenceOptions(source, query?)` | FrameAssetSource, FrameFieldReferenceQuery? | FrameFieldReference[] | 字段引用选项 |

**Services（有副作用）**:

| Service | 输入 | 输出 | 用途 |
|---------|------|------|------|
| `replaceFrames(frames, selectedFrameId?)` | FrameAsset[], string? | FrameAssetOperationResult | 替换全部帧（CRUD 统一入口） |
| `selectFrame(frameId)` | string | void | 切换选中帧 |
| `serializeFrames(frames)` | FrameAsset[] | string | 导出 JSON |
| `deserializeFrames(text)` | string | { ok, frames, issues } | 导入 JSON |
| `cloneFrameAsset(frame)` | ReadonlyFrameAsset | FrameAsset | 深拷贝 |
| `validateFrameAsset(frame)` | FrameAsset | ValidationResult | 单帧校验 |
| `validateFrameField(field)` | FrameFieldDefinition | ValidationResult | 字段校验 |
| `validateExpressionDefinition(expr)` | ExpressionDefinition? | ValidationResult | 表达式校验 |

**关键类型**:

- `FrameAsset`: { id, name, direction, fields: FrameFieldDefinition[], description?, frameType?, protocol?, isFavorite?, identifierRules?, options?, createdAt?, updatedAt? }
- `FrameAssetSummary`: { id, name, direction, fieldCount, description?, frameType?, protocol?, isFavorite }
- `FrameFieldDefinition`: { id, name, dataType, length, inputType, configurable, dataParticipationType, options, expressionConfig?, validOption?, defaultValue?, bigEndian?, isASCII?, factor?, description? }
- `ExpressionDefinition`: { expressions: ConditionalExpressionDefinition[], variables: ExpressionVariableDefinition[] }
- `FrameAssetQuery`: { query?: string, direction?: FrameDirection, favoriteOnly?: boolean }

**注意**: Service 层只有 `replaceFrames`（全量替换），无单帧 CRUD。所有单帧操作通过"读全量 → 修改 → 全量写回"实现。

### 1.2 新系统 Connection Feature Public API

**Selectors（只读）**:

| Selector | 输入 | 输出 | 用途 |
|----------|------|------|------|
| `selectConnectionSummaries(snapshot)` | ConnectionStateSnapshot | ConnectionSummary[] | 连接摘要列表 |
| `selectConnectionFact(snapshot, id)` | snapshot, string | ConnectionRuntimeFact \| undefined | 单连接详情 |
| `selectTransportConfigs(snapshot)` | snapshot | TransportConfig[] | 所有配置 |
| `selectTransportTargets(snapshot, query?)` | snapshot, ConnectionTargetQuery? | TransportTargetSnapshot[] | 传输目标 |
| `selectReconnectStatus(snapshot, id)` | snapshot, string | ReconnectStatus \| undefined | 重连状态 |
| `selectLastTransportError(snapshot)` | snapshot | TransportErrorSnapshot \| undefined | 最后错误 |

**Services（有副作用）**:

| Service | 输入 | 输出 | 用途 |
|---------|------|------|------|
| `connect(config)` | TransportConfig | ConnectionOperationOutcome | 建立连接 |
| `disconnect(connectionId)` | string | ConnectionOperationOutcome | 断开连接 |
| `drainAdapterEvents()` | — | ConnectionOperationOutcome | 排空适配器事件 |
| `cleanup()` | — | ConnectionOperationOutcome | 清理所有连接 |

**串口枚举**: `RealSerialAdapter.discoverResources()` → { kind:'serial', id, label }[]

**关键类型**:

- `TransportConfig` = SerialTransportConfig | TcpClientTransportConfig | TcpServerTransportConfig | UdpTransportConfig
- `SerialTransportConfig`: { id, kind:'serial', label?, portPath, baudRate } — **只有 portPath + baudRate，无数据位/停止位/校验位/流控制**
- `TcpClientTransportConfig`: { id, kind:'tcp-client', label?, host, port }
- `TcpServerTransportConfig`: { id, kind:'tcp-server', label?, host, port }
- `UdpTransportConfig`: { id, kind:'udp', label?, localHost, localPort, remoteHost?, remotePort? }
- `ConnectionLifecycleStatus`: 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'
- `ConnectionSummary`: { connectionId, kind, lifecycle, label, routeLabel, available, rxBytes, txBytes, errorCount, lastActivityAt?, lastError? }

**关键发现**:
1. SerialTransportConfig 只有 portPath + baudRate，旧系统串口的高级配置（数据位/停止位/校验位/流控制）在新系统第一阶段不暴露。
2. ConnectionService 没有 removeConfig 方法。删除配置需在后续迭代补充。
3. discoverResources 在 RealSerialAdapter 上而非 ConnectionService 上。

### 1.3 旧系统帧管理页面行为

**帧列表** (10 个行为):
1. 表格列：序号/帧ID/名称/参数数/时间/操作
2. 实时搜索（输入即过滤，搜 name/id/description，大小写不敏感）
3. 可折叠筛选面板：帧ID精确匹配、名称关键词、参数数下拉、时间范围
4. 批量操作：导入JSON、导出JSON、新建帧、刷新
5. 单行操作：收藏/取消收藏、编辑（跳转编辑页）、复制、删除（确认对话框）
6. 单选模式 → 右侧 30vw 详情面板
7. 点击表头排序（升序/降序切换）
8. 虚拟滚动（每次加载 7 行）
9. 导入导出：JSON 格式，导入时 ID 冲突直接覆盖
10. 斑马纹 + 选中行高亮（蓝色左边框 + 半透明背景）

**帧编辑** (6 个行为):
1. 基本信息表单：名称(必填)/ID(必填)/方向(下拉)/SCOE标记(复选)/描述(多行)
2. 帧识别规则（仅接收帧）：起始字节/结束字节/操作符/值/逻辑运算符，支持多条
3. 字段列表：字段名/类型简写/位宽/校验和标记，支持**拖拽排序**，统计总数和总位数
4. 字段编辑对话框（左右分栏）：左侧基本信息(名称/类型/长度/倍率/ASCII/输入类型/默认值/参与类型/端序/可配置/描述/校验和)，右侧表达式或选项配置
5. 表达式编辑：变量映射(标识符+数据源类型+来源选择) + 条件表达式(条件+表达式)
6. 十六进制字段值预览
7. 实时校验 + 保存时整体校验
8. 未保存变更检测 → 离开页面确认对话框

**导入导出**:
- 导出：全量 JSON，通过 EventBus 触发 main 进程文件保存对话框
- 导入：选择 JSON 文件 → 解析 → 验证 → 全量覆盖保存。ID 冲突直接覆盖。

### 1.4 旧系统连接页面行为

**连接列表** (6 个行为):
1. 左右分栏(24vw + 1fr)，左上网络列表 + 左下串口列表 + 右侧配置面板
2. 串口列表：端口名称/路径 + 状态(图标+颜色) + 连接/断开按钮，可展开详情
3. 网络列表：连接名/类型/host:port + Toggle 开关连接/断开
4. 状态图标：已连接(绿link)/连接中(橙hourglass)/失败(红error)/未连接(灰link_off)
5. 多连接并行显示
6. 全局刷新按钮(1000ms 防抖)

**串口配置**:
- 基础：波特率(110-1000000)/数据位(5/6/7/8)/停止位(1/1.5/2)/校验位(无/偶/奇/标记/空格)
- 高级折叠：流控制/自动打开
- 串口枚举：QSelect 下拉 + 刷新按钮，显示连接状态图标

**网络连接配置**:
- 基础：名称(≤50字符)/类型(TCP/UDP/WebSocket)/主机/端口/描述
- TCP vs UDP 差异：UDP 额外管理远程主机列表（卡片式展示）
- 对话框模式：新建(自动生成ID) / 编辑(传入现有配置)

**操作反馈**:
- 连接中：按钮 loading + q-spinner-dots
- 成功：状态图标变绿 + "已连接"
- 失败：红色错误信息框
- 删除配置：确认对话框（"确定删除？此操作无法撤销"）
- 断开连接：直接操作，无需确认
- 数据统计：串口详情显示收发字节数

---

## 二、决策层

### 页面 1: 帧定义列表 (/frames)

**D-FL1 布局**: 主从双栏（模式A）— DataTable(flex:1) + 详情面板(320px 固定宽度)

**D-FL2 列表展示**:
- QTable + virtual-scroll（防御性开启，帧数 < 500）
- 列定义抽到 columns.ts: #序号 / 帧ID / 名称 / 方向 / 字段数 / 类型 / 收藏 / 操作
- 行选中 QTable selection="single"

**D-FL3 搜索筛选**:
- TableToolbar 统一搜索 + 筛选
- 搜索：实时过滤，无 debounce（纯内存 < 1ms）
- 筛选：方向下拉(全部/发送/接收) + 仅收藏 toggle
- query 参数 → listFrameAssetSummaries(source, query)

**D-FL4 批量操作**:
- 新建：跳转 /frames/editor（无 frameId）
- 导入：QDialog + QFile，JSON 格式，deserializeFrames → 预览 issues → 确认导入
- 导出：serializeFrames 全量 JSON → 通过 platform facade 写文件
- 批量删除：选中多行 → $q.dialog() 确认

**D-FL5 单行操作**:
- 收藏：toggle isFavorite → replaceFrames
- 编辑：router.push('/frames/editor/' + frameId)
- 复制：cloneFrameAsset + 改 id/name → replaceFrames
- 删除：$q.dialog() 确认 → replaceFrames(移除该帧)

**D-FL6 详情面板**:
- 选中帧 → 右侧显示元数据 + 字段预览（前 5 个字段）
- 未选中 → 空状态提示

**D-FL7 导入对话框**:
- QFile 选择 JSON → deserializeFrames → 显示解析结果和 issues
- issues 按严重程度分组（error 禁用导入按钮，warning 允许）
- **只有"替换全部"模式**（旧系统行为），不提供"追加"模式

**D-FL8 方向展示**: 使用 QChip 而非 StatusBadge（只有发送/接收两个固定值，StatusBadge 用于动态状态）

### 页面 2: 帧定义编辑 (/frames/editor/:frameId?)

**D-FE1 布局**: 单栏居中（模式C），max-width 1120px

**D-FE2 页面头部**: sticky bar — [← 返回列表] 标题(编辑帧/创建帧) [取消] [保存]

**D-FE3 基本信息区**: QCard — 帧名称 / 帧ID / 帧方向（grid-cols-3）+ 描述（独占一行）+ frameType / protocol（可选，第三行）

**D-FE4 帧识别规则**: 仅 direction='receive' 时显示。规则卡片列表，每条含起始字节/结束字节/操作符/值/逻辑运算符。支持添加/删除规则。

**D-FE5 字段列表区**:
- 使用 DataTable widget（QTable），复用通用表格组件
- 列定义：名称 / 数据类型 / 长度 / 参与类型 / 输入类型 / 操作(复制/删除)
- 统计栏：字段总数 + 总位数(字节数)
- 排序：**保留拖拽排序**（旧系统有，字段顺序是高频操作，上移/下移按钮效率不足）
- 添加字段按钮在列表底部

**D-FE6 字段编辑对话框**:
- QDialog v-if，宽度 880px，最大高度 80vh
- 左右分栏：左侧 55%（基本信息）+ 右侧 45%（表达式/选项配置）
- 左侧：名称/类型/长度/倍率/输入类型/默认值/参与类型/端序/ASCII/可配置/描述/校验和(折叠)
- 右侧：根据 inputType 切换 expression（变量映射+条件表达式）或 select/radio（选项列表）

**D-FE7 表达式编辑器**:
- 变量映射：行列表，每行标识符输入 + 数据源类型下拉 + 来源选择（级联）
- 条件表达式：行列表，每行条件输入 + 表达式输入
- 校验反馈：红色警告区块，实时更新 issues

**D-FE8 校验策略**:
- QInput :rules 实时校验（非空等简单规则）
- 字段保存：validateFrameField → issues 展示在对话框底部
- 页面保存：validateFrameAsset → issues 展示在页面顶部 QBanner

**D-FE9 保存/取消**:
- 脏检测：JSON.stringify 快照比较（数据量 < 5KB，性能无影响）
- 离开提示：onBeforeRouteLeave + $q.dialog()
- 保存流程：validate → replaceFrames → router.push('/frames')

**D-FE10 字段复制**: 保留（旧系统有，相似字段复制显著减少重复输入）

**D-FE11 拖拽排序**: 保留（旧系统有，字段顺序直接影响数据解析，是高频操作）。实现方式待定（可评估 vuedraggable 或简易拖拽）。

### 页面 3: 连接管理 (/connection)

**D-CO1 布局**: 单栏居中（模式C，max-width 1120px）— 连接数少，不需要主从双栏

**D-CO2 连接列表**:
- 分两区：串口连接区 + 网络连接区，各有 section header
- 每行 QCard flat bordered：StatusBadge + 名称 + 路由信息 + 连接/断开按钮 + 删除按钮
- 连接数 < 20，无需 virtual-scroll
- **无右侧详情面板**（用户反馈：连接页不需要控制台，RX/TX 统计不怎么看）

**D-CO3 状态展示**:
- StatusBadge 组件，lifecycle 映射：

| lifecycle | Quasar color | 标签 | 脉冲 |
|-----------|-------------|------|------|
| idle | grey | 未连接 | 无 |
| connecting | warning | 连接中 | 有 |
| connected | positive | 已连接 | 无 |
| disconnecting | warning | 断开中 | 有 |
| disconnected | grey | 已断开 | 无 |
| error | negative | 错误 | 无 |

**D-CO4 新建连接对话框**:
- 第一步：类型选择（2x2 QCard 网格：串口/TCP Client/TCP Server/UDP）
- 第二步：配置表单（**单一表单组件 + v-if 按 kind 切换字段**，不拆成 4 个独立组件）
- 串口表单简化：只有 portPath + baudRate（新系统 SerialTransportConfig 无数据位等字段）
- 串口枚举：QSelect + 刷新按钮，数据源 discoverResources()
- 确认后调用 connect(config)

**D-CO5 操作反馈**:
- 连接/断开：按钮 loading + $q.notify()
- 删除：$q.dialog() 确认
- 失败：$q.notify('negative')

**D-CO6 自动连接**: 所有连接类型（串口/TCP Client/TCP Server/UDP）均支持 `autoConnect` 配置。应用启动时自动连接标记了 autoConnect 的配置。**需要类型变更**：BaseTransportConfig 加 `autoConnect?: boolean` 字段。新建连接对话框和连接卡片中均有 Toggle 开关。

**D-CO7 已移除的功能**（用户确认不需要）:
- 右侧详情面板 / 控制台
- RX/TX 收发字节数统计
- 重连状态展示
- UDP 多远程主机（新类型只支持单个）
- WebSocket 连接类型
- 帧列表参数数/时间范围筛选

### 跨页面决策

**D-CROSS1 编辑模式统一**:
- 页面级编辑（帧编辑）：sticky bar [取消][保存] + dirty tracking + 离开提示
- 对话框级编辑（连接新建、导入）：QDialog 底部 [取消][确认]

**D-CROSS2 Widget 使用**:
- DataTable: 帧列表使用（P0）
- TableToolbar: 帧列表使用（P1，配置化 widget，各页面通过 props 差异化）
- StatusBadge: 连接状态使用（动态状态场景）。帧方向用 QChip（固定值场景）。
- FrameSelector: 不在当前 3 页面出现（在发送/接收/任务/SCOE 页面使用）

---

## 三、自检层

### R1 假设验证

| 假设 | 验证方式 | 结果 |
|------|---------|------|
| Frame service 只有 replaceFrames | 读 frame/index.ts + service | ✅ 确认，无单帧 CRUD |
| SerialTransportConfig 只有 portPath + baudRate | 读 connection/core/types.ts | ✅ 确认，无数据位等字段 |
| ConnectionService 没有 removeConfig | 读 connection service | ✅ 确认，第一阶段删除只做 disconnect + UI 移除 |
| 帧定义 < 500 条 | 旧系统实际数据 + 合理预估 | ✅ 合理，纯内存操作 |
| 连接数 < 20 | 旧系统实际数据 | ✅ 合理，不需要虚拟滚动 |
| FrameOptionsDefinition 有 UI 编辑入口 | 旧系统 FrameBasicInfo.vue 第 114-116 行被注释掉 | ✅ 旧系统也无 UI，不建是合理覆盖 |
| 连接配置有持久化机制 | 搜索 connection feature 目录 | ❌ 无持久化，仅内存态。autoConnect 依赖此能力 |
| 旧系统串口有 dataBits/stopBits/parity 等字段 | 旧系统 SerialOptionsForm.vue | ⚠️ 旧系统有 6 个可编辑字段，新类型只有 portPath+baudRate |
| 旧系统有测试工具 tab | 旧系统 ConnectConfigPage.vue + SerialTestTools.vue | ⚠️ 旧系统有完整的 HEX/文本收发测试工具 |
| 旧系统有连接编辑功能 | 旧系统 NetworkConnectionEditDialog.vue | ⚠️ 旧系统可编辑已有网络连接配置 |

### R2 旧行为覆盖度

**帧列表** (10 行为 → 全部覆盖):

| 旧行为 | 新设计 | 状态 |
|--------|--------|------|
| 表格列 | columns.ts 8 列 | ✅ 扩展 |
| 实时搜索 | TableToolbar 搜索框 + listFrameAssetSummaries | ✅ |
| 筛选面板 | 方向下拉 + 仅收藏 toggle（简化） | ✅ 简化合理 |
| 批量导入导出 | QDialog + serializeFrames/deserializeFrames | ✅ |
| 单行操作(4项) | 全部保留 | ✅ |
| 单选+详情面板 | QTable selection + 右侧面板 | ✅ |
| 排序 | QTable 内建排序 | ✅ |
| 虚拟滚动 | QTable virtual-scroll | ✅ |
| 选中高亮 | QTable selection 样式 | ✅ |
| 导入导出 | JSON，全量替换 | ✅ |

**帧编辑** (8 行为 → 全部覆盖):

| 旧行为 | 新设计 | 状态 |
|--------|--------|------|
| 基本信息 | FrameBasicInfoForm | ✅ |
| 帧识别规则 | FrameIdentifierRulesEditor | ✅ |
| 字段列表+拖拽排序 | FrameFieldList + 拖拽 | ✅ |
| 字段编辑对话框 | FrameFieldEditorDialog 左右分栏 | ✅ |
| 表达式编辑 | FrameFieldExpressionConfig | ✅ |
| 十六进制预览 | MVP 简化，字段列表已有类型+长度信息 | ⚠️ 简化 |
| 校验 | validateFrameAsset/Field + :rules | ✅ |
| 未保存检测 | JSON.stringify 快照 + onBeforeRouteLeave | ✅ |

**帧编辑补充 — 显式不建项**:

| 旧行为 | 决策 | 理由 |
|--------|------|------|
| SCOE帧复选框 (isSCOEFrame) | 不建 | CLAUDE.md 规定 SCOE 不再独立模块，帧定义全局唯一，SCOE 过滤通过 frameType 或 commandIngress feature 处理 |
| FrameOptionsDefinition 编辑 (autoChecksum/bigEndian/includeLengthField) | 不建 UI | 旧系统也无 UI（FrameBasicInfo.vue:114-116 被注释掉），字段级 bigEndian 已有编辑入口，帧级 options 通过 JSON 导入设置 |
| 字段结构预览 (FrameFieldPreview 多列网格) | 不建 | 旧系统有但使用率低，字段列表 DataTable 已展示类型+长度信息 |

**连接管理** (6 行为 → 5 覆盖 + 1 简化):

| 旧行为 | 新设计 | 状态 |
|--------|--------|------|
| 左右分栏 | 模式C 单栏居中（用户确认不需要详情面板） | ✅ 简化 |
| 串口+网络分区 | 串口区 + 网络区 section | ✅ |
| 状态图标 | StatusBadge + 脉冲动画 | ✅ 增强 |
| 串口配置 | 简化为 portPath + baudRate | ⚠️ 简化（新类型约束，默认 8N1） |
| 网络配置 | 对话框 + 类型选择 | ✅ |
| 操作反馈 | $q.notify + loading + 确认对话框 | ✅ |

**连接管理补充 — 显式不建项**:

| 旧行为 | 决策 | 理由 |
|--------|------|------|
| 串口测试工具 tab (SerialTestTools) | 不建 | 用户确认"用都没用过"。功能可通过外部串口调试工具替代 |
| 网络测试工具 (NetworkTestTools) | 不建 | 旧系统已注释掉，未被使用 |
| 连接编辑功能 | Phase 1 不建 | 旧系统有 NetworkConnectionEditDialog 编辑已有配置，新系统简化为新建+删除（service 无 updateConfig）。后续迭代可加 |
| 串口高级选项 (dataBits/stopBits/parity/flowControl) | 不建 | 新系统 SerialTransportConfig 只有 portPath+baudRate，默认 8N1。如需其他配置需先改类型层 |
| 网络配置上限 (≤9) | 不建 | 旧系统有上限，新系统无此约束 |
| 网络远程主机列表 (UDP RemoteHost[]) | 不建 | 用户确认不需要 UDP 多远程主机 |
| WebSocket 连接类型 | 不建 | 用户确认不需要 |
| 连接配置持久化 (localStorage) | Phase 1 不建 | 新系统 connection feature 无持久化机制，autoConnect 依赖此能力（见 R1） |

### R3 交互一致性

| 维度 | 结论 | 说明 |
|------|------|------|
| 搜索/筛选 | ✅ | 帧列表用 TableToolbar，连接数少无需搜索 |
| 编辑保存/取消 | ✅ | 页面级 vs 对话框级两种模式，已明确规则 |
| 删除确认 | ✅ | 统一 $q.dialog() |
| 状态展示 | ✅ | 动态状态用 StatusBadge，固定标签用 QChip |
| 布局模式 | ✅ | 帧列表模式A（主从双栏），连接页模式C（单栏居中，用户确认简化） |
| 空状态/loading | ✅ | 所有列表/表格显式处理 |
| 操作反馈 | ✅ | 统一 $q.notify() |

### 过度设计审查

| 项 | 结论 | 理由 |
|----|------|------|
| 拖拽排序 | 保留 | 旧系统有，字段顺序是高频操作。引入 vuedraggable 作为 Q1 例外（与 grid-layout-plus 同类——单一能力工具） |
| TableToolbar widget | 保留 | 已锁定 P1 widget，配置化设计合理 |
| 4 个独立连接表单 | 简化为单一表单 + v-if | 避免代码重复 |
| StatusBadge 显示帧方向 | 改用 QChip | 只有 2 个固定值，StatusBadge 用于动态状态 |
| 导入"追加"模式 | 移除 | 旧系统只有覆盖，无追加 |
| 连接统计面板 | 不建 | 旧系统有但用户确认不需要 |
| 字段复制 | 保留 | 旧系统有，减少重复输入 |
| 表达式可视化编辑器 | 不建 | 旧系统只有文本输入 |

### 跨页面决策补充

**D-CROSS3 Display 页面动态面板布局**:
- 使用 vue-grid-layout（grid-layout-plus Vue 3 版本）实现可拖拽、可调整大小的网格面板
- 作为 Q1 规则例外（与 ECharts 同类——单一能力布局引擎，非 UI 组件库替代）
- 面板支持自由增删、拖拽位置、拖拽尺寸
- 面板上限 ≤ 6（DOM 节点预算）
- 面板配置持久化到 DisplayPreferences
- 此决策影响 display-ui-design，需在 display 页面设计时更新

### R4 审查问题跟踪（第二轮自检）

基于旧对话审查结果 + 6 个子 agent 深度验证，以下问题需在 design 层修正：

| # | 问题 | 严重度 | 修正方案 | 状态 |
|---|------|--------|---------|------|
| 1 | FrameOptionsDefinition 编辑 UI 缺失 | 低 | 旧系统也无 UI（已注释），显式声明"不建" | ✅ R2 补充 |
| 2 | autoConnect 不可实施（无持久化） | 高 | Phase 1 仅内存态 autoConnect，不跨重启。持久化作为 Phase 2 | ✅ design 已更新 |
| 3 | 连接配置持久化完全不存在 | 高 | Phase 1 不做持久化。Phase 2 通过 settings 或独立存储实现 | ✅ design 已更新 |
| 4 | 串口配置简化 8N1 未论证 | 中 | 新类型层约束，非设计简化 | ✅ R2 补充 |
| 5 | 测试工具 tab 遗漏 | 低 | 用户确认不需要，显式声明"不建" | ✅ R2 补充 |
| 6 | 连接编辑功能缺失 | 中 | Phase 1 不建，显式声明 | ✅ R2 补充 |
| 7 | brainstorm R2 连接页写"模式A"实际是"模式C" | 低 | 修正措辞 | ✅ R3 修正 |
| 8 | design 数据流 runtime.routingTick 措辞不当 | 中 | 改为独立 setInterval 轮询，不用 tick driver | ✅ design 已更新 |
| 9 | 导出数据流未指定 API | 低 | serializeFrames + platform facade 写文件 | ✅ design 已更新 |
| 10 | 连接错误状态卡片展示未设计 | 中 | lifecycle='error' 时 StatusBadge negative + lastError | ✅ design 已更新 |
| 11 | 字段编辑对话框 880px 应标注用语义 class | 低 | 使用 rw-dialog-lg 语义 class | ✅ design 已更新 |
| 12 | vuedraggable 是否允许 Q1 例外 | 低 | 是，与 grid-layout-plus 同类 | ✅ 过度设计审查补充 |
| 13 | replaceFrames 读-改-写模式迫使 UI 打补丁 | 高 | S1: service 暴露 upsertFrame / removeFrame | ✅ design S1 |
| 14 | connect(unknown) 类型不安全 | 高 | S2: 改签名为 connect(config: TransportConfig) | ✅ design S2 |
| 15 | connect 失败幽灵 config | 高 | S3: adapter 成功后才 upsertConfig | ✅ design S3 |
| 16 | discoverResources 只在 adapter 上 | 高 | S4: ConnectionReader 接口暴露 discoverResources | ✅ design S4 |
| 17 | 连接页用 tick driver 刷新 UI（误用全局引擎） | 中 | C3: 改为独立 setInterval | ✅ design C3 |
