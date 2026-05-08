# frame-real 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-05-08
> 关联方案 doc：`codestable/features/rewrite-frame/frame-real-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**名词层"现状 → 变化"逐项核对**：

- [x] **FR-NOUN-001 标识规则类型化**：`IdentifierRule` 接口（startIndex, endIndex, operator, value, logicOperator）已定义在 `core/types.ts:38-44`，operator 枚举 `'eq'|'neq'|'gt'|'lt'|'range'|'mask'|'any'`，logicOperator 枚举 `'and'|'or'`。`FrameAsset.identifierRules` 从 `unknown[]` 改为 `IdentifierRule[]`。→ 一致
- [x] **FR-NOUN-001b factor 字段保留**：`FrameFieldDefinition.factor?: number` 已添加在 `core/types.ts:70`。→ 一致
- [x] **FR-NOUN-001c validOption 类型修正**：`FrameChecksumDefinition.startFieldIndex/endFieldIndex` 从 `string` 改为 `number` 在 `core/types.ts:46-47`。→ 一致
- [x] **FR-NOUN-001d checksumMethod 枚举**：`ChecksumMethod` 类型 `'sum8'|'xor8'|'crc16'|'crc32'|'custom'` 已定义在 `core/types.ts:24`。`checksumMethod` 字段从 `string?` 改为 `ChecksumMethod?` 在 `core/types.ts:48`。→ 一致
- [x] **FR-NOUN-002 ExpressionDefinition 对齐验证**：`validation-expression.ts` 新增 `compileExpression` 调用做编译级语法检查。变量 identifier 引用检查逻辑保留。→ 一致
- [x] **FR-NOUN-003 Frame JSON Schema**：`FrameAssetFile { schemaVersion: 1, frames: FrameAsset[] }` 定义在 `services/frame-asset-service.ts`。`serializeFrames` / `deserializeFrames` 实现完整。→ 一致
- [x] **FR-NOUN-004 FrameReader L0 接口确认**：`FrameAssetReader` 接口签名与方案一致，所有返回值通过 `cloneFrameAsset` 深拷贝 + `ReadonlyDeep<>` 标注。→ 一致
- [x] **FR-NOUN-005 Selector 不可变修复**：`cloneFrameAsset` 中 `identifierRules` 从 `cloneUnknownValue` 改为 `cloneIdentifierRules`（显式 `.map(rule => ({ ...rule }))`），所有 primitive 字段 `{ ...rule }` 即为深拷贝。selector 不可变单测验证通过。→ 一致

**流程图核对**（第 2.2 节 mermaid 图）：

- [x] Legacy JSON → migrate → FrameAsset[]：`migrateLegacyFrameConfig` in `core/legacy.ts`
- [x] Import JSON → parse → schemaVersion check → validate/migrate：`deserializeFrames` in `services/frame-asset-service.ts`
- [x] Export → FrameAssetFile → JSON：`serializeFrames` in `services/frame-asset-service.ts`
- [x] FrameStateContainer → snapshot → FrameAssetReader：`createFrameAssetReader` in `services/frame-asset-service.ts`
- [x] FrameReader → 只读 → receive/send/task/指令接入：receive-service.ts, send-service.ts, task/adapters/ports.ts 均通过 public API 消费

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] 帧定义 JSON schema 定稿：`FrameAssetFile` + round-trip 单测通过
- [x] 真实 frameReader 实现（L0 依赖）：`FrameAssetReader` 通过 `createFrameAssetReader` 构造，receive 9 测试 + runtime 28 测试通过
- [x] 旧格式迁移脚本：`migrateLegacyFrameConfig` 处理所有字段归一化，4 个 fixture 全通过
- [x] selector 不可变修复：`cloneIdentifierRules` 替代 `cloneUnknownValue`，不可变单测通过

**明确不做逐项核对**（方案 §0 + §3 反向核对）：

- [x] Frame 编辑器/列表页面 **确实没做**（grep `FrameEditor` / `FrameListPage` 无命中）
- [x] Frame 导入导出对话框 UI **确实没做**
- [x] Runtime 启动装配帧加载顺序 **确实没做**
- [x] 真实串口/TCP/UDP 硬件验证 **确实没做**
- [x] SCOE/指令接入命令流程 **确实没做**
- [x] 打包态 data path / HTTP/FTP / northbound **确实没做**

**关键决策落地**：

- [x] §1.1 表达式引擎已实现为 shared/ 纯函数：validation-expression.ts 调用 `compileExpression` from `@/shared/expression`
- [x] §1.2 条件匹配在 shared/condition-operators/：frame 未引入独立条件系统，确认不冲突
- [x] §1.3 Selector 不可变约束：cloneIdentifierRules 显式深拷贝 + ReadonlyDeep 标注 + 单测
- [x] §1.4 帧定义全局唯一：无模块维护独立帧列表（grep 无独立 frame store）
- [x] §1.5 旧 SCOE 独立帧列表不得复制：public API 不提供创建帧实例副本能力
- [x] §1.6 不使用 new Function：shared/expression tokenizer+parser 完全替代

**编排层"现状 → 变化"逐项核对**：

- [x] FR-ORCH-001 Legacy Migration 完善：`coerceToNumber` helper + factor/identifierRules/validOption 归一化 + checksumMethod 枚举校验
- [x] FR-ORCH-002 Import/Export 序列化：`serializeFrames` / `deserializeFrames` + schemaVersion 检查
- [x] FR-ORCH-003 FrameReader 生产路径：`createFrameAssetReader(state.getSnapshot)` 通过 runtime feature-wiring 注入

**挂载点反向核对**（方案 §2.3）：

- [x] FrameAssetReader 接口（`features/frame/index.ts` 导出）：receive/send/task 通过此读取帧定义 → grep 确认 receive-service.ts, send-service.ts, task/adapters/ports.ts 均引用
- [x] FrameAsset 类型（`features/frame/core/types.ts`）：全系统唯一帧模型 → 无其他模块定义独立帧类型
- [x] Legacy migration 入口（`features/frame/core/legacy.ts`）：唯一迁移入口 → 无其他迁移代码
- [x] JSON schema 序列化（`features/frame/services/`）：唯一序列化/反序列化规则 → grep `serializeFrames|deserializeFrames` 仅在 frame 模块内
- [x] **反向 grep**：`@/features/frame` 外部引用共 17 处，全部通过 index.ts public API，无一命中内部路径
- [x] **拔除沙盘推演**：删除 frame 目录后，receive/send/task/runtime 的 import 会断裂但无残留逻辑。序列化函数仅 frame 内部使用，无外部消费。

## 3. 验收场景核对

- [x] **SC1 帧定义 JSON schema 定稿**
  - 证据：单测 `round-trips frames through serialize then deserialize`（39 pass）
  - 结果：通过

- [x] **SC2 旧格式迁移**
  - 证据：4 个 fixture 迁移单测（legacyFrameConfigSample + WithoutDataParticipationType + WithFactorAndRules + Minimal）
  - 结果：通过

- [x] **SC3 FrameReader 只读快照**
  - 证据：单测 `deep-clones identifierRules so mutating the returned frame does not affect state`
  - 结果：通过

- [x] **SC4 表达式对齐**
  - 证据：单测 `accepts legacy expression samples through the shared expression compiler` + `rejects malformed expression syntax at compile level`
  - 结果：通过

- [x] **SC5 identifierRules 类型安全**
  - 证据：单测 `accepts identifierRules with valid operators` + `rejects identifierRules with invalid operator or negative indices`
  - 结果：通过

- [x] **SC6 导入导出 round-trip**
  - 证据：单测 `round-trips preserves factor and identifierRules values`
  - 结果：通过

- [x] **SC7 factor 字段迁移**
  - 证据：单测 `migrates legacy factor from string to number`（`toBeCloseTo(0.01)`）
  - 结果：通过

- [x] **SC8 validOption 类型迁移**
  - 证据：单测 `migrates legacy validOption startFieldIndex/endFieldIndex from string to number`（typeof 检查）
  - 结果：通过

**前端改动**：本 feature 无 UI 页面改动，不涉及浏览器肉眼验证。

## 4. 术语一致性

对照方案第 0 节 + 第 2.1 节命名 grep 代码：

- `IdentifierRule`：代码命中 6 处（types.ts, clone.ts, legacy-normalizers.ts, fixtures, validation-frame.ts, receive/clone.ts），全部一致 ✓
- `ChecksumMethod`：代码命中 3 处（types.ts, legacy-normalizers.ts, index.ts），全部一致 ✓
- `FrameAssetFile`：代码命中 3 处（frame-asset-service.ts, index.ts, tests），全部一致 ✓
- `FrameDeserializeResult`：代码命中 2 处（frame-asset-service.ts, index.ts），全部一致 ✓
- `factor`：作为 `FrameFieldDefinition` 字段，代码命中 2 处（types.ts, legacy-normalizers.ts），全部一致 ✓
- 防冲突：`identifierRules` 不再有 `unknown[]` 用法（grep `identifierRules.*unknown` 零命中）✓

## 5. 架构归并

对照方案第 4 节（Cross-feature interface registry）：

**名词归并**：
- [x] `rewrite-target-structure.md`：frame feature 已在现有架构中定义目录结构，本次新增类型（IdentifierRule、ChecksumMethod、FrameAssetFile）属于 feature 内部类型扩展，不改变目录结构或跨模块交互形态。不需要更新。

**动词骨架归并**：
- [x] serialize/deserialize 路径是 frame feature 内部能力，尚未被外部消费。不需要更新架构交互图。

**跨层纪律归并**：
- [x] selector 不可变约束已在 CLAUDE.md §"Selector 不可变约束"中记录，本次实现是对该约束的具体落地，不需要新增架构条目。

**判据评估**：本次 feature 是现有 frame feature 的内部能力完善（类型修正 + 迁移 + 序列化），不改变 feature 对外交互形态和目录结构。架构 doc 不需要更新。

## 6. requirement 回写

方案 frontmatter `requirement:` 为空。

本 feature 新增的能力：
- 帧定义 JSON schema（开发者/infra 能力，非用户可感）
- 旧格式迁移（一次性工具）
- selector 不可变修复（内部质量改进）

这些均为内部平台能力，不直接面向终端用户。不新增 requirement。

## 7. roadmap 回写

方案 frontmatter `roadmap: runtime-next-phase` / `roadmap_item: frame-real`。

`codestable/roadmap/runtime-next-phase/` 目录不存在。roadmap 尚未通过 `cs-roadmap` 流程正式创建 items.yaml，规划状态仅在 compound planning doc 中。

**处理方式**：本 feature 实施不依赖 roadmap items.yaml 存在。roadmap 正式创建时，frame-real 条目应标记为 `done`。

## 8. AGENTS.md / CLAUDE.md 候选盘点

本 feature 未暴露需要补入 AGENTS.md / CLAUDE.md 的通用环境/工具/工作流信息。

## 9. 遗留

- 后续优化点：无
- 已知限制：`deserializeFrames` 的 legacy path 目前在 JSON.parse 失败时直接报错，不支持尝试裸 legacy 数组字符串（需要调用方先 JSON.parse 成功后再走 legacy 识别）
- 实现阶段"顺手发现"列表：无
