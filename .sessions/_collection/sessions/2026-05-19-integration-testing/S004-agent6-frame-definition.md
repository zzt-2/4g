# [S004] 旧系统帧定义管理行为提取 — Agent6

> 2026-05-19 | 调研 | 事实提取完成

## 目标

调研旧系统的帧定义管理行为，提取所有必须保留的可观测业务行为。只做事实提取，不做设计或实施。

---

## 1. 帧定义 CRUD 行为

### 1.1 创建

**旧行为：** 新帧通过 `createEmptyFrame()` 工厂函数生成默认值，填入 `Frame` 结构后通过 `frameTemplateStore.createFrame()` 保存。创建后全量 `saveAll` 到持久化。

| 默认字段 | 值 | 位置 |
| --- | --- | --- |
| id | `nanoid()` | `factories.ts:64` |
| lastId | `''` | `factories.ts:65` |
| name | `'新帧配置'` | `factories.ts:66` |
| description | `''` | `factories.ts:67` |
| direction | `'send'` | `factories.ts:68` |
| fields | `[]` | `factories.ts:69` |
| timestamp | `Date.now()` | `factories.ts:70` |
| createdAt / updatedAt | `new Date()` | `factories.ts:71-72` |
| isFavorite | `false` | `factories.ts:73` |
| options | `{ autoChecksum: true, bigEndian: false, includeLengthField: false }` | `frameDefaults.ts:86-90` |
| identifierRules | `[]` | `factories.ts:76` |

**必填字段验证：** name 非空 + fields.length > 0（`frameEditorStore.ts:39`）

**代码位置：**
- 工厂函数：`src/types/frames/factories.ts:63-78`
- Store create：`src/stores/frames/frameTemplateStore.ts:43-68`
- Editor init：`src/stores/frames/frameEditorStore.ts:63-66`

**oracle 来源评估：** 工厂函数 + Store 实现完整，高可信度。

**新系统对应 feature：** frame feature 的 createFrame service。

**保留建议：** 保留。所有默认值、必填验证、direction 默认 send 等行为用户可观测。

---

### 1.2 读取（帧列表加载和缓存）

**旧行为：**
- `fetchFrames()` 调用 `dataStorageAPI.framesConfig.list()` 一次加载全部帧到 `frames: ref<Frame[]>`。
- 存储路径：`data/templates/framesConfig`（`configDefaults.ts:6`）。
- 通过 `window.electron.dataStorage.framesConfig.list()` 经 IPC 从 main 进程读文件。
- 没有分页机制；`FRAMES_PER_PAGE = 20` 只用于 UI 显示（`frameDefaults.ts:126`），不用于数据加载。
- `receiveFramesStore` 通过 `computed` 过滤 `frameTemplateStore.frames` 中 `direction === 'receive'` 的帧。
- 应用启动时 `useAppLifecycle.ts:48` 加载帧模板。

**代码位置：**
- `frameTemplateStore.ts:26-39`（fetchFrames）
- `receiveFramesStore.ts:270-273`（receiveFrames computed）
- `layouts/useAppLifecycle.ts:48`（启动加载）

**oracle 来源评估：** 完整代码链路，高可信度。

**新系统对应 feature：** frame feature 的 loadFrames / selectFrames。

**保留建议：** 保留全量加载、按 direction 过滤、启动时自动加载行为。分页为 UI 展示策略，不是核心行为。

---

### 1.3 更新

**旧行为：**
- 编辑器通过 `editorStore.setEditorFrame(frame)` 深拷贝进入编辑状态，保存初始状态 JSON 字符串用于变更检测（`frameEditorStore.ts:43-49`）。
- 深度 watch `editorFrame`，通过 JSON 序列化比较检测变更，设置 `hasChanges` 标志（`frameEditorStore.ts:21-32`）。
- 字段变更通过 `fieldStore.saveField()` → `editorStore.updateEditorFrame({ fields })` 联动（`frameFieldsStore.ts:267`）。
- 保存时：`frameTemplateStore.updateFrame()` 做 `deepClone` + `updatedAt` 时间戳更新 + `saveAll` 全量写回（`frameTemplateStore.ts:70-89`）。
- 编辑模式支持 `create` 和 `edit` 两种。编辑模式下 ID 可修改，修改后删除旧 ID 记录（`useFrameEditor.ts:111-112`）。

**可编辑字段（通过 Frame 接口 + editor 行为推断）：**
- name, description, direction, fields, options, identifierRules, isFavorite, isSCOEFrame
- id（在编辑模式下可修改，有冲突检测）

**代码位置：**
- `frameEditorStore.ts:43-61`（setEditorFrame / updateEditorFrame）
- `frameTemplateStore.ts:70-89`（updateFrame）
- `useFrameEditor.ts:82-125`（saveFrame 协调逻辑）

**oracle 来源评估：** 编辑器 + Store + composable 三层完整，高可信度。

**新系统对应 feature：** frame feature 的 updateFrame / editor 状态管理。

**保留建议：** 保留深拷贝编辑、变更检测、字段联动更新、ID 修改（含冲突检测）、全量 saveAll。

---

### 1.4 删除

**旧行为：**
- `frameTemplateStore.deleteFrame(id)` 调用 `dataStorageAPI.framesConfig.delete(id)` 后本地 filter 移除。
- 若删除的是当前选中帧，清空 `selectedFrameId`（`frameTemplateStore.ts:102-103`）。
- **无前端确认对话框**（删除操作在 `FrameList.vue:292-310`，只做 try/catch + notify，无 `$q.dialog` 确认）。
- **无级联删除**：删除帧定义后，关联的 sendFrameInstances、scoeFrameInstances、receiveConfig mappings 不会被自动清理。`receiveFramesStore.removeInvalidMappings()` 和 `removeOrphanedDataItems()` 可手动清理无效映射，但不在帧删除时自动触发。

**代码位置：**
- `frameTemplateStore.ts:91-114`
- `FrameList.vue:292-310`
- `receiveFramesStore.ts:660-754`（手动清理映射）

**oracle 来源评估：** Store 实现明确；前端无确认、无级联属于可观测行为。

**新系统对应 feature：** frame feature 的 deleteFrame。

**保留建议：**
- 保留：删除后清空选中状态。
- 排除（旧 bug）：无确认对话框。新系统应加确认。
- 排除（旧 bug）：无级联清理。新系统应在帧删除时触发关联实例/映射的清理。

---

### 1.5 复制帧

**旧行为：**
- `useFrameTemplates.duplicateFrame(id)` 找到原帧，创建深拷贝，name 加 `(副本)` 后缀，删除 id（让 store 生成新 nanoid），isFavorite 重置为 false，timestamp 更新为 `Date.now()`（`useFrameTemplates.ts:61-88`）。

**代码位置：** `src/composables/frames/useFrameTemplates.ts:61-88`

**保留建议：** 保留。复制是用户常用操作。

---

### 1.6 收藏

**旧行为：**
- `frameTemplateStore.toggleFavorite(id)` 切换 `isFavorite` 布尔值并调用 `updateFrame` 持久化（`frameTemplateStore.ts:122-127`）。
- 发送帧实例也有独立的 `toggleFavorite`（`sendFrameInsComposable.ts:265-271`）。

**保留建议：** 保留帧级和实例级独立收藏。

---

## 2. 帧实例管理行为

### 2.1 sendFrameInstancesStore vs scoeFrameInstancesStore

**sendFrameInstancesStore：**
- 管理普通发送帧实例，持久化路径 `data/templates/sendInstances`。
- 实例通过 `createSendFrameInstance(frame, id)` 从帧模板创建，复制所有字段（包括非 configurable 字段）到实例。
- 支持完整 CRUD：create / update / delete / copy / toggleFavorite / moveInstance（拖拽排序）。
- 实例编辑使用 localInstance 深拷贝模式 + applyLocalEdit 回写。
- 支持批量删除 `deleteInstances(ids)`。
- 支持帧定义更新后批量同步到关联实例 `updateInstancesByFrameId(frameId)`。

**scoeFrameInstancesStore：**
- 管理 SCOE 帧实例，持久化路径 `data/templates/scoeSendInstances`。
- 只管理 `isSCOEFrame === true` 且 `direction === 'send'` 的帧。
- 发送帧实例 + 接收指令列表（`receiveCommands`）双重管理。
- 接收指令结构包含：params（参数列表）、frameInstances（帧实例）、completionConditions（完成条件）、checksums（校验和）。
- 实例 ID 为递增数字字符串（不是 nanoid）。

**代码位置：**
- `src/stores/frames/sendFrameInstancesStore.ts`
- `src/composables/frames/sendFrame/sendFrameInsComposable.ts`
- `src/stores/frames/scoeFrameInstancesStore.ts`

**oracle 来源评估：** 两个 Store 实现完整，行为清晰。

**新系统对应 feature：**
- sendFrameInstances → send feature（或 frame feature 的实例子域）
- scoeFrameInstances → SCOE feature（统一通过指令接入 feature）

**保留建议：**
- 保留：帧模板到实例的字段复制、localInstance 编辑模式、批量同步更新。
- 排除：SCOE 实例的独立管理行为（SCOE 已统一到指令接入 feature）。

---

### 2.2 实例参数如何覆盖帧定义

**旧行为：**
- `createSendFrameInstance(frame, id)` 从帧创建实例时：
  - 所有字段（包括非 configurable 字段）都复制到实例，保留完整字段列表。
  - 每个字段的 `value` 初始化为 `field.defaultValue || ''`。
  - 字段的 `label` 来自 `field.name`。
  - select/radio 类型字段若无线有选项，自动生成默认选项。
  - `paramCount` = configurable 字段数量（仅用于显示）。
- 实例编辑时，字段值 `value` 可自由修改，不影响帧定义。
- 帧定义更新后，`createUpdatedInstanceFromFrame` 合并逻辑：已存在的字段保留 value，新字段用 defaultValue，移除的字段被删除（`sendFrameInsComposable.ts:587-657`）。

**代码位置：**
- `src/types/frames/sendInstanceFactories.ts:14-93`
- `src/composables/frames/sendFrame/sendFrameInsComposable.ts:587-657`

**保留建议：** 保留全字段复制 + 编辑不回写帧定义 + 帧更新后增量同步逻辑。

---

### 2.3 实例的 CRUD 行为

| 操作 | 行为 | 位置 |
| --- | --- | --- |
| 创建 | 从帧模板创建，自动命名 `{frameName} #{nextNumber}`，ID 为递增数字 | `sendFrameInsComposable.ts:128-159` |
| 复制 | 深拷贝 + 新 ID + 新编号，保留原字段值 | `sendFrameInsComposable.ts:222-262` |
| 更新 | localInstance 深拷贝编辑 → applyLocalEdit → saveEditedInstance，支持 ID 修改 | `sendFrameInsComposable.ts:447-512` |
| 删除 | 单个删除 + 批量删除，删除后清空选中状态 | `sendFrameInsComposable.ts:182-219` |
| 移动 | 拖拽排序，失败时重新 fetch 回滚 | `sendFrameInsComposable.ts:274-314` |
| ID 修改 | 编辑模式下可修改实例 ID，保存时检测冲突，删除旧 ID 记录 | `sendFrameInsComposable.ts:459-494` |

**保留建议：** 保留全部 CRUD 行为。ID 修改 + 冲突检测属于关键用户操作。

---

## 3. 帧导入/导出行为

### 3.1 帧定义导入/导出

**旧行为：**
- **导出格式：** JSON。通过 `fileDialogManager.exportFile()` 将 `templateStore.frames` 数组导出为文件。
- **导出内容：** 全部帧定义数组（`Frame[]`），包括 fields、options、identifierRules 等。
- **导入格式：** JSON。通过 `fileDialogManager.importFile()` 读取。
- **导入校验：** 只校验 `Array.isArray(result.fileData)`，无更深层的 schema 校验。
- **导入合并策略：** **全量覆盖**（`saveAll`），导入的数组直接替换现有所有帧。
- **导入路径：** 默认目录 `${pathAPI.getDataPath()}data/frames/configs`。

**代码位置：**
- 导出：`src/pages/frames/FrameList.vue:313-348`
- 导入：`src/pages/frames/FrameList.vue:351-387`

---

### 3.2 发送帧实例导入/导出

**旧行为：**
- **导出格式：** JSON。在 `FrameSendPage.vue:209` 调用 `dataStorageAPI.sendInstances.saveAll()` 导出。
- **导入格式：** JSON。通过 `importFromJSON(json)` 导入（`sendFrameInsComposable.ts:531-552`）。
- **导入校验：** 校验 `Array.isArray(data)`。
- **导入合并策略：** 全量覆盖。

**代码位置：**
- `src/composables/frames/sendFrame/sendFrameInsComposable.ts:529-552`
- `src/pages/FrameSendPage.vue:209-229`

---

### 3.3 接收配置导入/导出

**旧行为：**
- **导出：** `receiveFramesStore.exportConfig()` 返回 `{ groups, mappings, version }` JSON 对象。
- **导入：** `importConfig(config)` 校验 groups/mappings 是数组后全量替换，重置运行时 value/displayValue。
- **导入后同步：** 立即调用 `syncConfigToMainProcess()` 将配置同步到主进程缓存。

**代码位置：** `src/stores/frames/receiveFramesStore.ts:372-417`

**oracle 来源评估：** 导入导出代码完整，JSON 格式确认。

**新系统对应 feature：** frame feature 的 import/export；send feature 的 import/export。

**保留建议：**
- 保留：JSON 格式导出/导入。
- 保留：导入校验（至少验证数组格式）。
- 排除（旧 bug）：全量覆盖策略过于粗暴。新系统可考虑增量合并或冲突提示。
- 保留：接收配置导入后同步到主进程。

---

## 4. 帧字段管理行为

### 4.1 字段数据类型支持

**11 种数据类型**（`frameDefaults.ts:30-42`）：

| 类型 | 字节数 | fixedLength | 需要指定 length |
| --- | --- | --- | --- |
| uint8 | 1 | 1 | 否 |
| int8 | 1 | 1 | 否 |
| uint16 | 2 | 2 | 否 |
| int16 | 2 | 2 | 否 |
| uint32 | 4 | 4 | 否 |
| int32 | 4 | 4 | 否 |
| uint64 | 8 | 8 | 否 |
| int64 | 8 | 8 | 否 |
| float | 4 | 4 | 否 |
| double | 8 | 8 | 否 |
| bytes | N | null | **是** |

**注意：** `string` 类型在 `FIELD_TYPE_CONFIGS` 中定义但不在 `FIELD_TYPE_OPTIONS` 中，属于未暴露类型。

**代码位置：** `src/config/frameDefaults.ts:30-42, 67-81`

---

### 4.2 字段输入类型

**4 种输入类型**（`frameDefaults.ts:196-201`）：

| 输入类型 | needsOptions | minOptions | maxOptions | hasDefaultOption | 描述 |
| --- | --- | --- | --- | --- | --- |
| input | 否 | 0 | 0 | 否 | 普通输入框 |
| select | 是 | 2 | 20 | 是 | 下拉选择框 |
| radio | 是 | 2 | 10 | 是 | 单选按钮组 |
| expression | 否 | 0 | 0 | 否 | 自定义表达式 |

**切换输入类型时的自动行为**（`frameFieldsStore.ts:278-303`）：
- 切到 select：若无 options，自动填充 `DEFAULT_SELECT_OPTIONS`（3 选项）。
- 切到 radio：若无 options，自动填充 `DEFAULT_RADIO_OPTIONS`（2 选项）。
- 切回 input：清空 options，defaultValue 重置为 `'0x00'`。

**代码位置：** `src/config/frameDefaults.ts:162-201`，`src/stores/frames/frameFieldsStore.ts:278-303`

---

### 4.3 字段属性完整列表

| 属性 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| id | string | 是 | nanoid() | 唯一标识 |
| name | string | 是 | '新字段' | 字段名称 |
| dataType | FieldType | 是 | 'uint8' | 数据类型 |
| length | number | 是 | 1 | 长度（字节/元素数） |
| factor | number | 否 | 1 | 因子 |
| description | string | 否 | '' | 描述 |
| validOption | ValidationParam | 否 | DEFAULT_VALID_OPTION | 校验设置 |
| defaultValue | string | 否 | '0' | 默认值 |
| inputType | FieldInputType | 是 | 'input' | 输入控件类型 |
| configurable | boolean | 是 | true | 发送用例中是否可配置 |
| bigEndian | boolean | 否 | true | 端序 |
| isASCII | boolean | 否 | - | ASCII 模式 |
| options | Option[] | 否 | [] | select/radio 选项 |
| dataParticipationType | 'direct'\|'indirect' | 否 | 'direct' | 数据参与类型 |
| expressionConfig | ExpressionConfig | 否 | - | 表达式配置 |

**代码位置：** `src/types/frames/fields.ts:48-71`，`src/types/frames/factories.ts:13-30`

---

### 4.4 字段操作行为

| 操作 | 行为 | 位置 |
| --- | --- | --- |
| 添加 | 末尾追加，自动选中 | `frameFieldsStore.ts:239-242` |
| 删除 | splice 移除，调整选中索引 | `frameFieldsStore.ts:80-95` |
| 复制 | 紧接原位置之后插入，name 加 `(副本)` 后缀，新 id | `frameFieldsStore.ts:97-115` |
| 移动 | splice 拖拽，更新选中索引 | `frameFieldsStore.ts:117-142` |
| 编辑 | tempField 深拷贝 → 编辑 → saveField 回写 → editorStore.updateEditorFrame | `frameFieldsStore.ts:167-271` |

**验证规则**（`frameUtils.ts:244-319`）：
- 字段名称非空
- dataType 必填
- bytes 类型 length > 0
- expression 类型必须有 expressionConfig
- 字段名称在帧内唯一

**代码位置：** `src/utils/frames/frameUtils.ts:244-319`

---

### 4.5 校验和字段配置

**ValidationParam 结构**（`fields.ts:82-87`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| isChecksum | boolean | 是否为校验和字段 |
| startFieldIndex | string | 起始字段索引 |
| endFieldIndex | string | 结束字段索引 |
| checksumMethod | string | 方法：crc16 / crc32 / xor8 / sum8 |

默认校验方法：`sum8`（`frameDefaults.ts:120`）。

**帧级 options**（`frames.ts:9-13`）：
- autoChecksum: boolean — 自动计算校验和
- bigEndian: boolean — 全局端序
- includeLengthField: boolean — 是否包含长度字段

**保留建议：** 全部保留。校验和计算是帧编码的核心能力。

---

### 4.6 表达式字段

**旧行为：**
- 字段可设置 `inputType: 'expression'`，此时字段 `configurable` 默认为 false，`dataParticipationType` 为 `'indirect'`。
- 表达式配置 `ExpressionConfig` 包含：多条件表达式列表（condition + expression）、变量映射列表。
- 变量映射支持 4 种数据源：current_field / frame_field / global_stat / scoe_data。
- 变量标识符（identifier）用于表达式中引用。
- 表达式验证：至少一个表达式 + 变量标识符唯一性。
- 表达式字段不参与帧匹配（`directDataFrames` computed 过滤掉 indirect 字段）。
- 接收数据时，表达式字段跳过正常更新，由 `frameExpressionManager.calculateAndApplyReceiveFrame` 单独计算。

**代码位置：**
- 类型定义：`src/types/frames/fields.ts:7-45`
- 工厂函数：`src/types/frames/factories.ts:38-57`
- 默认配置：`src/utils/frames/defaultConfigs.ts:88-205`
- 接收过滤：`src/stores/frames/receiveFramesStore.ts:823-843`
- 表达式计算：`src/stores/frames/receiveFramesStore.ts:1091-1099`

**保留建议：** 保留表达式字段的完整配置能力（多条件表达式、变量映射、4 种数据源）。表达式执行引擎归口 shared/，但配置 UI 和触发逻辑归 frame feature。

---

### 4.7 帧识别规则

**旧行为：**
- `IdentifierRule` 结构：startIndex、endIndex、operator、value、logicOperator（and/or）。
- 帧可定义多条识别规则，用于接收时帧匹配。
- 默认值：startIndex=0, endIndex=7, operator='eq', value='0x00', logicOperator='and'。

**代码位置：**
- 类型：`src/types/frames/frames.ts:15-21`
- 默认值：`src/config/frameDefaults.ts:105-111`

**保留建议：** 保留帧识别规则作为帧定义的一部分。

---

## 5. 旧 JSON 格式与新格式的关键差异

### 5.1 帧定义存储格式

**旧格式（持久化到 JSON 文件）：**
- 存储路径：`data/templates/framesConfig`
- 格式：`Frame[]` 数组，每个 Frame 包含完整 fields、options、identifierRules。
- 通过 `dataStorageAPI.framesConfig.saveAll()` 全量写入。
- Date 类型在序列化时转为 ISO 字符串，nanoid 生成字符串 ID。

**新系统已有的帧定义**（从 `rewrite/src/features/frame/` 推断）：
- 新系统帧定义核心结构类似，但已重构为 feature 架构。
- 具体格式差异需对照新系统 `FrameDefinition` 类型确认。

### 5.2 实例存储格式

**旧格式：**
- 发送实例：`data/templates/sendInstances`，`SendFrameInstance[]`
- SCOE 发送实例：`data/templates/scoeSendInstances`
- SCOE 接收指令：`data/templates/scoeReceiveCommands`
- 接收配置：`data/templates/receiveConfig`，`{ groups, mappings, version }` 对象

### 5.3 迁移注意事项

- 旧系统 Date 字段 `createdAt`/`updatedAt` 在 JSON 中为 ISO 字符串，反序列化后需转回 Date。
- `lastId` 字段用于编辑模式下跟踪 ID 变更，新系统可简化。
- 旧系统 `Frame.timestamp` 是 number（毫秒时间戳），`createdAt`/`updatedAt` 是 Date 对象。
- 旧系统实例的 `paramCount` 仅用于 UI 显示，非核心数据。

**保留建议：** 旧 JSON 可作为迁移 oracle，但不污染新系统核心模型。迁移时需做格式转换。

---

## 6. 帧模板的使用行为

### 6.1 帧模板管理（frameTemplateStore）

**旧行为：**
- 帧模板即帧定义，不存在独立的"模板"概念。`frameTemplateStore` 是所有帧定义的唯一 Store。
- 帧列表页面（`FrameList.vue`）展示所有帧，支持搜索、过滤（方向、日期范围）、排序（ID/名称/日期/使用次数）。
- 帧详情面板展示选中帧的字段列表和参数。
- 帧编辑器（`FrameEditor.vue`）是独立路由页面，支持创建/编辑两种模式。

### 6.2 帧与实例的关系

- 帧定义是模板（1），实例是从模板创建的具体配置（N）。
- 实例保留帧 ID 引用（`frameId`），但不维护反向引用。
- 帧更新时可触发关联实例的批量同步（`updateInstancesByFrameId`），但不是强制的。

### 6.3 基于 SCOE 标记的特殊帧

- 帧有 `isSCOEFrame` 布尔标记。
- SCOE 帧在 `scoeFrameInstancesStore` 中独立管理。
- SCOE 帧的过滤条件：`isSCOEFrame === true && direction === 'send'`（或 `'receive'`）。

**代码位置：**
- `src/stores/frames/scoeFrameInstancesStore.ts:55-65`
- `src/types/frames/frames.ts:39`（isSCOEFrame 字段）

**保留建议：**
- 排除 `isSCOEFrame` 标记。新系统中 SCOE 统一通过指令接入 feature，不再需要帧级 SCOE 标记。
- 保留帧列表的搜索/过滤/排序行为。
- 保留帧编辑器的独立路由页面模式。

---

## 7. 过滤与排序行为

**旧行为：**
- 搜索：按 name、description、fields.name 模糊匹配（不区分大小写）。
- 方向过滤：按 `direction` 精确匹配。
- 日期范围过滤：按 `createdAt` 范围过滤。
- 排序选项：ID（localeCompare）、name（localeCompare）、date（降序）、usage（降序）。

**代码位置：** `src/utils/frames/frameUtils.ts:354-456`

**保留建议：** 保留全部过滤和排序行为。

---

## 8. 自动保存与配置同步

**旧行为（receiveFramesStore 特有）：**
- 监听 `groups` 和 `mappings` 变化（排除运行时 value/displayValue），1 秒防抖自动保存。
- 监听帧模板变化，500ms 防抖同步到主进程缓存。
- 主进程缓存用于数据接收时的帧匹配，避免每次接收数据都 IPC 传配置。

**代码位置：** `src/stores/frames/receiveFramesStore.ts:168-267`

**保留建议：** 保留配置同步到主进程缓存的行为（性能关键）。新系统应通过 platform facade 实现，不直接暴露 IPC。

---

## 9. 帧定义的完整数据流

```
用户操作 → FrameEditor.vue
  → useFrameEditor (composable, 协调)
    → frameEditorStore (编辑状态)
    → frameFieldsStore (字段状态)
    → frameTemplateStore (持久化)
      → dataStorageAPI.framesConfig (IPC → main → 文件)
```

**帧实例数据流：**
```
用户选帧 → sendFrameInstancesStore.createInstance(frameId)
  → frameTemplateStore.frames → 找到帧定义
  → createSendFrameInstance(frame, id) → 从帧创建实例
  → dataStorageAPI.sendInstances.save → 持久化
```

---

## 10. 汇总：必须保留的行为清单

### 高优先级（核心业务行为）

1. **帧 CRUD**：全量加载、深拷贝编辑、变更检测、saveAll 持久化、ID 修改（含冲突检测）
2. **字段 11 种数据类型**：uint8/int8/.../double/bytes，含 fixedLength 和 needsLength 配置
3. **字段 4 种输入类型**：input/select/radio/expression，含自动选项生成
4. **字段操作**：添加、删除、复制（含命名后缀）、移动、编辑（tempField 模式）
5. **帧验证**：name 非空、至少一个字段、字段名唯一性、bytes 类型 length > 0
6. **实例从帧创建**：全字段复制、configurable 标记、选项自动生成
7. **帧更新后实例同步**：已存在字段保留 value，新字段用 defaultValue
8. **校验和配置**：isChecksum、startFieldIndex/endFieldIndex、checksumMethod（4 种方法）
9. **表达式字段**：多条件表达式、变量映射（4 种数据源）、indirect 数据参与
10. **帧识别规则**：startIndex/endIndex/operator/value/logicOperator
11. **帧选项**：autoChecksum / bigEndian / includeLengthField
12. **JSON 导入/导出**：帧定义全量导出/导入
13. **收藏功能**：帧级 + 实例级独立收藏
14. **配置同步到主进程缓存**（接收帧匹配性能关键）

### 中优先级（可观测 UI 行为）

15. **帧列表过滤**：搜索（name/desc/fieldName）、direction、日期范围
16. **帧列表排序**：ID、name、date、usage
17. **帧复制**：深拷贝 + `(副本)` 命名 + 新 ID
18. **实例 CRUD**：创建、复制（含自动编号）、删除（含批量）、拖拽排序、ID 修改
19. **实例编辑**：localInstance 深拷贝模式、十六进制值显示、校验和自动计算

### 低优先级（可简化或排除）

20. **SCOE 帧标记 isSCOEFrame** — 排除，新系统统一通过指令接入
21. **FRAMES_PER_PAGE = 20** — UI 展示策略，非核心
22. **全量覆盖式导入** — 排除旧策略，新系统应提供冲突处理
23. **lastId 字段** — 编辑模式 ID 变更跟踪，新系统可简化实现
24. **receiveConfig 的 groups/mappings 结构** — 属于 receive feature，非帧定义核心

---

## 后续

无。本文件为纯事实提取，供后续设计和实施参考。
