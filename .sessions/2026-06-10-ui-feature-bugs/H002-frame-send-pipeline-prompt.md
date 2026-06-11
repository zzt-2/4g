# Handoff: 帧发送管线表达式+预览+显示修复

> 来源: 全局指挥对话 S001 | 交接目标: 修复帧发送页面表达式计算、字段预览、值显示的系统性问题
> 文件名: H002-frame-send-pipeline-prompt.md

## 已完成边界

- 表达式变量解析修复已完成（`resolveExpressionVariables` 新增，`current_field` 类型变量可正确映射 identifier → sourceId → 值）
- 23 个测试通过，类型检查和 lint 通过
- esbuild 环境已修复（linux-x64 二进制已安装）
- 帧迁移脚本已完成（27 旧帧 → 24 新帧 frames-v2.json）
- Legacy 代码已清除

## 不要做什么

- **不改变 factor 方向**：设计文档明确 `raw = physical / factor`，当前实现正确
- **不引入新依赖**
- **不把 send composable 改成 Pinia store**（那是 H001 Bug 1 的范围）
- **不在 core 层引入 Vue/Pinia/Electron 依赖**（core 必须可单测）
- **不改 connection/serial/network 的核心类型定义**
- **不临场扩大边界**，修完本清单就停
- **不跳过前端规范检查**

## 必读

**动代码前必须用子 agent 并行读完以下文档（全部读完才能动手）：**

1. `codestable/features/rewrite-send/send-real-design.md` — 发送真实链路设计（factor 方向、resolveFieldValues 优先级、表达式求值流程、evaluateFieldPreviewForUI 设计意图）
2. `codestable/features/rewrite-ui-architecture/pages-task-send-command-design.md` — 发送页 UI 设计（FieldEditWidget 设计、字段分组渲染规则、hex 预览、发送后状态管理）
3. `codestable/features/2026-05-08-expression-engine/expression-engine-design.md` — 表达式引擎（compileGroup/evaluateGroup 批量求值 + Kahn 拓扑排序 API）
4. `codestable/quality/rewrite-frontend-conventions.md` — 前端 UI 规范
5. `codestable/quality/rewrite-review-checklist.md` — 审查清单
6. `codestable/reference/rewrite-frontend-quickref.md` — 前端速查卡

## Bug 清单（按修复顺序）

### Fix 1：FieldEditWidget 表达式/不可配置字段显示 `--`

**现象**：发送页面中所有 `inputType: 'expression'` 和 `configurable: false` 的字段显示 `--`，没有实际值。

**根因**：
- `rewrite/src/widgets/FieldEditWidget.vue:77-81` — `getDisplayValue(field)` 只查 `props.values[field.id]`
- `props.values` 只包含用户手动输入的 configurable 字段值
- 表达式字段和不可配置字段从未写入 `props.values`，所以全是 `undefined` → `'--'`

**设计要求**（来自 pages-task-send-command-design.md）：
- 表达式实时联动：字段值变化 → `evaluateFieldPreviewForUI(frame, fieldId, userFieldValues, variableProvider)` 重算依赖字段
- 字段分组渲染：可调字段 `color="info"`，计算参数 `color="warning"`，不可配置 `color="grey"` 只读展示

**修复方向**：
1. 在 `FieldEditWidget` 或其父组件中引入预览计算逻辑
2. 对表达式字段调用 `evaluateFieldPreviewForUI` 计算预览值
3. 对不可配置字段（无表达式），显示 `defaultValue` 或通过 `resolveFieldValues` 计算的值
4. 确保预览值随 configurable 字段的用户输入实时更新

**涉及文件**：
- `rewrite/src/widgets/FieldEditWidget.vue`
- 可能需要调整 `rewrite/src/pages/SendPage.vue` 中传给 FieldEditWidget 的 props
- 可能需要新建 `rewrite/src/features/send/composables/use-field-preview.ts`（或在已有 composable 中扩展）

**关键约束**：
- `evaluateFieldPreviewForUI` 需要 `frame`（ReadonlyFrameAsset）、`fieldId`、`userFieldValues`、`variableProvider`
- `variableProvider` 默认用 `NOOP_VARIABLE_PROVIDER`（返回空 Map），task 执行时注入真实 provider
- 预览计算是纯函数调用，不产生副作用

---

### Fix 2：resolveFieldValues 加拓扑排序

**现象**：距离模拟帧后 6 个表达式字段依赖前序表达式结果，当前按字段顺序遍历可能碰对也可能不对。速度模拟帧 `速度 = 速度 + 步进` 的自引用模式不支持。

**根因**：
- `rewrite/src/features/send/core/frame-resolver.ts` 的 `resolveFieldValues` 按字段定义顺序遍历
- 没有分析表达式间的依赖关系
- 自引用字段（`速度` 引用自己）无法获取"上一次发送的值"

**设计要求**（来自 send-real-design.md）：
- "含跨字段依赖时按依赖拓扑排序"
- 表达式引擎已提供 `compileGroup` + `evaluateGroup`（Kahn 拓扑排序）

**修复方向**：
1. 在 `resolveFieldValues` 中，收集所有表达式字段及其变量依赖
2. 用依赖关系构建拓扑排序（可复用 `shared/expression` 的排序能力，或自行实现简单版）
3. 按拓扑顺序求值表达式字段
4. 自引用字段：当前发送的"初始值"来自 `userFieldValues` 中保存的上次计算结果（需要 Fix 3 的回写机制配合）

**涉及文件**：
- `rewrite/src/features/send/core/frame-resolver.ts`

**关键约束**：
- 非表达式字段的优先级不变（configurable > default > zero fill）
- 只对表达式字段排序，不影响其他字段
- 循环依赖应报错而非死循环

---

### Fix 3：发送后表达式计算结果回写

**现象**：速度模拟帧每次发送都从原始值开始计算，`速度 = 速度 + 步进` 没有累加效果。

**根因**：
- `rewrite/src/pages/SendPage.vue` 的 `onSend()` 发送成功后只调 `incrementSendCount`
- 表达式字段的计算结果没有回写到实例的 `userFieldValues`
- 旧系统在发送后通过 `updateFieldValue` 回调 + `updateSendStatsCache` 实现状态记忆

**设计要求**（来自 pages-task-send-command-design.md）：
- "发送成功：instance.sendCount/lastSendAt 需更新"
- 旧系统还更新了 `stats.fields = instance.fields`（包含计算后的字段值）

**修复方向**：
1. `sendService.execute` 返回的 `SendResult` 中携带表达式字段的计算结果（或 send 回调提供 resolved values）
2. 发送成功后，将表达式字段的结果写入 `instance.userFieldValues`
3. 下次发送时，`userFieldValues` 中的值即为上次计算结果，自引用表达式可正确累加

**涉及文件**：
- `rewrite/src/features/send/services/send-service.ts` — execute 返回 resolved field values
- `rewrite/src/features/send/core/types.ts` — SendResult 可能需要扩展
- `rewrite/src/pages/SendPage.vue` — onSend 成功后回写
- `rewrite/src/features/send/composables/use-send-instances.ts` — 新增 updateFieldValues 方法

**关键约束**：
- 只回写表达式字段的值，不覆盖用户手动输入的 configurable 字段值
- 回写后需要触发持久化保存
- 如果发送失败（build-error/transport-error），不回写

---

### Fix 4：整数编码静默截断加 warning

**现象**：用户输入 300 给 uint8 字段，实际发送 44（300 & 0xFF），无任何提示。

**根因**：
- `rewrite/src/features/send/core/encode.ts` 的 `encodeInteger` 使用位掩码 `value & 0xff` 静默截断
- 没有范围校验，没有 warning

**修复方向**：
1. 编码前校验数值是否在数据类型范围内
2. 超出范围时记录 warning issue（不阻止发送，但告知用户）
3. 可选：在 UI 层也加前端校验，输入时就提示

**涉及文件**：
- `rewrite/src/features/send/core/encode.ts`
- 可能需要 `rewrite/src/widgets/FieldEditWidget.vue` 前端校验

---

### Fix 5：Hex 预览显示

**现象**：发送页面无十六进制预览，旧系统实时显示每帧的 hex 值。

**设计要求**（来自 pages-task-send-command-design.md）：
- "D-S4 预览 HEX：frameToBuildInput + buildFrame 纯函数计算，FrameBuildOutput.bytes 可直接格式化"

**修复方向**：
1. 在发送页面或 FieldEditWidget 下方添加 hex 预览区域
2. 用 `buildFrame` 计算当前字段值对应的字节流
3. 格式化为 hex 字符串显示

**涉及文件**：
- `rewrite/src/pages/SendPage.vue` 或新建组件
- `rewrite/src/features/send/core/frame-builder.ts`（buildFrame 纯函数）

---

## 通用流程指令

### Phase 1：必读文档

动任何代码前，用 3 个子 agent 并行读完上面「必读」列出的 6 份文档。不读完不动手。

### Phase 2：按顺序修复

严格按 Fix 1 → 2 → 3 → 4 → 5 顺序，因为它们有依赖关系：
- Fix 1（预览显示）需要预览计算正确
- Fix 2（拓扑排序）确保依赖关系正确
- Fix 3（回写）依赖 Fix 2 的正确求值结果
- Fix 4（截断 warning）独立但影响编码正确性
- Fix 5（hex 预览）依赖前面的值解析都正确

每个 Fix 按 cs-issue 流程推进：
1. **定位**：根因已在上面给出，去对应文件读代码确认
2. **方案**：列修复方案，简述 trade-off
3. **实施**：按方案修，不改范围外的代码
4. **验证**：`pnpm build` + `pnpm lint` + 相关测试（从 rewrite/ 目录执行）
5. **自检**：每个 Fix 修完后过一遍审查框架（不需要每条都展开，但必须过）

### Phase 3：收尾

- 跑完整 build + lint + test（从 rewrite/ 目录执行 `npx vitest run`）
- 产出实施摘要：Changed files / Verify evidence / Open issues
- **不提交**（全局指挥对话统一提交）

## 约束

- 修改必须遵照 rewrite 前端规范：颜色走 token、间距走 UnoCSS、组件走 Quasar
- 不引入新依赖
- core 层保持纯 TypeScript（零 Vue/Pinia/Electron 依赖）
- 错误处理：所有 catch 必须至少 log 或 notify，禁止空 catch
- 组件超 300 行必须拆分
- 不用裸 hex/rgb/px 值，走语义 class 或 token
- 每次 build + lint 通过才能宣称一个 Fix 修复完成

## 子 agent 策略

- **必读文档**：3 个子 agent 并行读（文档 1-2、3-4、5-6）
- **修复实施**：Fix 1 和 Fix 4 互不依赖可并行；Fix 2→3 有序串行；Fix 5 最后
- **验证阶段**：派独立 verifier agent 检查 build + lint + test 结果

## 测试环境说明

vitest 可直接运行：
```bash
cd /mnt/d/code/frontend/dongfanghong/rewrite
npx vitest run src/features/send/__tests__/send-frame-resolver.spec.ts
npx vitest run  # 全量测试
```

build 和 lint：
```bash
npx vue-tsc --noEmit
npx eslint <changed-files>
```
