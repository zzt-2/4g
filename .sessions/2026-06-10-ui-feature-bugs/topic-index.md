# UI 与 Feature Bug 集中修复

> 状态: active | 创建: 2026-06-10 | 最后更新: 2026-06-19 S004 三个 UI 修复完成(进度计数按发送次数计 / 保存按钮去 disable / 发送失败错误提示 tooltip)

## 进展线索

- **S001** 帧迁移 + 表达式修复 (06-10 ~ 06-11)：3 agent 调查串口/网口/northbound 状态（全部已实现），3 agent 调查 3 个 send bug 根因，写帧迁移脚本+删 legacy 代码+修表达式引擎+变量解析修复
- **H001** Bug 修复对话提示词 (06-10)：3 个已知 bug（状态丢失/UDP发不出/IP显示错误）的根因分析和修复提示词
- **H002** 帧发送管线修复 (06-11)：5 个系统性修复全部完成 — 字段预览显示、拓扑排序、表达式回写、截断警告、hex 预览（已确认已有）。测试覆盖补充 25 个新用例
- **H003** 接收帧分组管理讨论提示词 (06-11)：用户倾向弹窗代替独立页面，需讨论分组粒度/归属/UI/持久化
- **H004** 速度模拟帧调试交接 (06-11)：H002 代码修复完成（单测通过），但运行时速度累加仍不生效。需确认实际帧数据配置和运行时链路。详见 H003-speed-simulation-debug.md
- **H005** 接收管线调试 (06-11)：根因定位 — `refreshFrameReferences()` 运行时从未被调用，导致 refFrames=0，所有帧 config-error。已修复 3 处。字节序、expressionCache、帧列表问题待讨论
- **H006** Display 页面表格改进 (06-11)：用户反馈接收显示页表格不好用。7 项改进已实现 — 删帧列、删更新时间列、加原始Hex列（float/double→'-'）、加字段排序按钮（可切换）、加值 tooltip、加点击复制、加列可见性切换。含自检修复（双触发 bug、clipboard 错误处理、dataType 过滤提到 bridge 层、SCSS token 化）
- **S002** task 参数变化机制拍板 (06-17)：纠正 H007 误判（线 A 速度模拟早于 4375857 修复，非当前活）；扫归档 53 会话确认 S010 三问题从未拍板；用户拍板"两个都要"。**v2 转折**：主对话讨论问题一时发现两机制共用 step 内执行骨架，改"分开决策、合一实施"。详见 D001 + S002 + voice.md
- **H008** task step 级参数变化机制 (06-17 交接, 06-18 实施完成)：**两个问题合一实施**(共用 FieldValueResolver 骨架)。问题一表达式连续累积(单 step 边界 / repeat×iteration 全局递增 / 公式归帧 / step 级临时上下文 / **accumulation 复用帧侧 self-ref + task 补 writeback**) + 问题二字段级可变参数(响应式联动一次性触发 / clamp) + 顺手修两 bug(progress 爆表 / maxIterations 覆盖)。v1（分开做）已废弃。**实施形状见 D002**。
- **S003** H008 实施对话 (06-18)：落地 6 个设计待决点 + accumulation 复用帧侧 self-ref + task 补 writeback。**续接1**:独立审查 pass-with-known-gaps,补清 console.info + accumulation 端到端集成测试。**续接2(简化)**:用户指出"步进表达式自己递增不需要填",accumulation 从"用户填的 resolver"彻底改为"task 自动 writeback"——删 FieldValueResolver union,fieldResolvers → fieldVariations(只剩离散值列表),writeback 无条件写所有 resolvedFieldValues。用户零配置。task+command-ingress+send 543 tests 全过,lint 0 新增。详见 D002 + S003 + voice.md 2026-06-18
- **S003 续接(可变参数输入清空 bug)** (06-19)：H008 简化后用户发现"可变参数值列表输入后被清空"。排查耗时较长,走过两个误判(派生 model-value 重算 / blur 不可靠),最终根因是 **Vue props 异步回流 + `onVariationValuesInput` 内两次链接 emit 之间 stale 覆盖**:`updateFieldVariation`(emit1 带 fv)→ `patchRepeat`(emit2 不带 fv,读 `props.step.fv` 仍是旧值 `[]`)→ `{...props.step, repeat}` 把 fv 又写成 `[]` 覆盖第一次。修复:fv + repeat 联动合并到同一次 patchConfig emit,单次原子更新。详见 D003 + S003 + voice.md 2026-06-19。用户另提三个新问题(发送失败错误提示 / 保存按钮 disable / 进度计数回退),待处理。
- **S004** 三个 UI 修复 (06-19)：①进度计数按发送次数计(双维度:保留 steps,新增 sends;sendsTotal=iteration×ΣmaxCount;非 repeat 用例仍走 steps)②保存按钮去 disable(hasErrors 响应式滞后,save() 已有 validate 拦截)③发送失败悬停显示具体报错(sendResult.error.message,回退 SEND_RESULT_STATUS_MAP 标签)。task+command-ingress+send 422 tests 全过,tsc 0 错,lint 0 新增。详见 D004 + S004 + voice.md 2026-06-19

## 已确认结论

### Bug 根因分析

| Bug | 根因位置 | 类型 |
|-----|---------|------|
| 发送帧页面导航后状态丢失 | `use-send-instances.ts` 组件局部 ref + 无 keep-alive + persistence stub | UI 状态管理 |
| UDP 发不出去 | remoteHost/remotePort optional，adapter 双重拦截返回 write-failed | 适配器逻辑 + UX |
| 输出口显示本机 IP | `lifecycle.ts` routeLabelForConfig UDP 回退显示 localHost | 显示逻辑 |
| 帧发送页面更多问题 | 用户反馈"一大堆问题"，待后续专门对话修 | 待调查 |

### 帧迁移完成

- `scripts/migrate-frames.mjs` 转换 27 个旧帧定义到新格式
- 删除 `legacy-normalizers.ts` 及所有引用（6 个文件）
- 3 个 SCOE 帧移除（旧 SCOE 走 command-ingress），剩余 24 帧
- 输出：`public/data/templates/frames-v2.json`

### 表达式引擎修复

- 变量标识符正则改为 Unicode `\p{L}`，支持中文变量名
- `extractExpressionIdentifiers` 改用 tokenizer 输出（不再误匹配字符串内容中的标识符）
- 修复了 `'RS编码'` 被误报为"未定义变量 RS"的问题
- `resolveExpressionVariables` 新增：表达式求值前把 `current_field` 变量的 `sourceId` 映射到 `identifier`
- `ExpressionConfig.variables` 类型加 `sourceId?` 字段
- 测试修正为 `{ identifier, sourceType }` 格式，新增 3 个 `current_field` 测试

### 实现状态确认

| 模块 | 状态 | 测试 |
|------|------|------|
| 串口 (serial) | 完整实现，serialport v13 | 47 tests passed |
| 网口 (TCP/UDP) | 完整实现，Node net/dgram | 同上 |
| Northbound | 12 入站 + 9 出站 + JWT + FTP | 86 tests passed |

### 接收帧分组管理设计决策 (06-11 H003 讨论)

| 项 | 决策 |
|----|------|
| 粒度 | 只管"帧→分组"映射 + 每帧可见字段选择，不引入 DataItem 级别配置 |
| 归属 | display feature |
| UI 形式 | 弹窗 rw-dialog-lg，从 DisplayPanel 分组下拉旁设置按钮触发 |
| 操作集 | 创建/删除/重命名分组，分配帧到分组，移除帧，排序，勾选每帧可见字段 |
| 帧与分组关系 | 一帧一分组（或未分组），一个分组可含多帧 |
| 字段可见性 | 默认不显示，显式勾选才显示；只存 frameId + visibleFieldIds，不存字段细节，支持热更新 |
| 持久化 | 扩展 DisplayPreferences，新增 groups: DisplayGroupConfig[] |
| 数据结构 | `DisplayGroupConfig { id, label, frames: DisplayGroupFrameEntry[] }`，`DisplayGroupFrameEntry { frameId, visibleFieldIds[] }` |
| bridge 改动 | 收到字段时查 group config，frameId 在某分组且 fieldId 在 visibleFieldIds 中 → groupId=group.id 输出，否则不输出 |

### Display 页面表格改进 (06-11 H006)

| 改动 | 实现 |
|------|------|
| 删帧列 | `panelTableColumns` 移除 frameId 列 |
| 删更新时间列 | `panelTableColumns` 移除 updatedAt 列 |
| 加原始Hex列 | bridge 层传递 rawHex（float/double 已在 bridge 过滤为 undefined），DisplayPanel 显示 |
| 字段排序 | `DisplayGroupFrameEntry.fieldOrder` 持久化，projection 按 fieldOrder 排序，DisplayPanel 排序模式下显示上/下箭头 |
| 值 tooltip | `fieldMeta` Map（从 frameReader 取 description）传入 DisplayPanel |
| 点击复制 | 值/hex 单元格点击调用 `navigator.clipboard.writeText`，含错误处理 |
| 列可见性切换 | `TableDisplayPreference.visibleColumns` 持久化，header view_column 按钮弹出勾选菜单 |

数据管线改动：`rawHex` 从 receive 层经 bridge → `DisplayFieldMaterial` → projection → `TableRowProjection` → DisplayPanel。`dataType` 不传递到 display 层（bridge 层直接过滤 float/double）。

涉及文件：types.ts, clone.ts, normalize.ts, projection.ts, receive-display-bridge.ts, display-columns.ts, DisplayPanel.vue, DisplayPage.vue

## 未决项

- 发送帧状态丢失的修复方案待确认（Pinia / keep-alive / 持久化三选一）— H001
- UDP 问题修 UI 校验还是修错误反馈待确认 — H001
- 帧发送页面"一大堆问题"待用户补充 — H001
- `frames-v2.json` 需要接入应用启动自动初始化逻辑
- **5 个帧发送管线系统性问题已修复 — H002 (06-11)**：
  1. ✅ 表达式/不可配置字段显示 `--` → FieldEditWidget 新增 `previewValues` prop，SendPage 计算预览值传入
  2. ✅ 无拓扑排序 → `resolveFieldValues` 两阶段重构，复用 shared `kahnSort`
  3. ✅ 表达式结果不回写 → `SendResult.resolvedFieldValues` 新字段，onSend 成功后回写表达式字段值
  4. ✅ 整数静默截断无警告 → `INTEGER_RANGES` 常量 + buildFrame 范围校验 warning
  5. ✅ hex 预览 → 已确认现有代码已实现（use-frame-preview + SendPage 右面板）
- **速度模拟帧运行时问题 — H004 (06-11)**：代码修复+单测通过，但实际运行速度不累加。待下轮用 console.log 追踪实际帧数据和运行时链路
- **字节序**：帧定义 `bigEndian: false` 但硬件发大端数据，需用户确认
- **expressionCache**：`processReceiveBatch` 运行时未传 expressionCache，表达式字段跳过求值
- **调试日志**：3 个文件有 `[RX-PROC]`/`[RX-SVC]`/`[ROUTE-TICK]` 临时日志待清理
- **字段排序跨帧限制**：当前 fieldOrder 按帧分组排序，不支持跨帧穿插排序

## 当前位置

**H008 task step 级参数变化机制实施完成 + 独立审查通过(2026-06-18)**。两个问题合一实施完成:字段级可变参数 + 表达式连续累积(共用 FieldValueResolver 骨架),顺手修 progress 爆表 + maxIterations 覆盖两 bug。accumulation 采用"复用帧侧 self-ref + task 补 writeback"路径(用户拍板,偏离 H008 v2 原设计但语义一致)。

**独立审查结论:pass-with-known-gaps**(无 revise-required 问题,架构零违规,核心语义全部正确且有 USER CASE 测试覆盖)。审查指出的两个 known gap 已补清:4 处 [task-debug] console.info 清理 + accumulation 端到端集成测试(真实 frame-resolver 递推 + writeback 闭环)。

验证状态:task+command-ingress+send **546 tests 全过**(含 3 USER CASE + 2 e2e),tsc 源码 0 错,lint 0 新增 error。build 未跑通(electron 打包 EBUSY 文件锁,环境问题非代码)。预先存在的 6 个失败(heartbeat-timer/connection-core)与本任务无关。

待用户确认:build 环境锁解除后跑一次完整 build(验证 .vue script 编译);以及是否需要真实硬件运行时验证(速度模拟帧 S-FPGA-004 在 task 下实际连续累积)。

### H007 表达式累加问题(2026-06-17, 已部分作废)

详见 `H007-expression-accumulation-handoff.md`。⚠️ **2026-06-17 用户纠正**:H007 把"线 A = send 速度模拟运行时调试"当当前待办是定性错误——该 bug 已于 commit 4375857(2026-06-11)修复。H007 描述的"线 A 当前待办"作废。真正当前活是线 B(task 参数变化),已由 S002/D001 落实拍板,H008 v2 合一实施。H007 文档保留可追溯,不再作为执行依据。

## H008 task step 级参数变化机制（2026-06-18 实施完成）

详见 `H008-field-level-variable-parameters-handoff.md`。**两个问题合一实施完成**(共用 FieldValueResolver 骨架):问题二字段级可变参数 + 问题一表达式连续累积 + 顺手修两个 bug(progress 爆表 / maxIterations 覆盖)。**实施形状见 D002**(resolver 挂 SendStepConfig.fieldResolvers / accumulation 复用帧侧 self-ref + task 补 writeback / counter 穿透 / 联动 flag / iteration-counter 协同)。

## 决策与原话

- **D001**(decisions.md):task 参数变化机制——两个需求都要,分开决策、合一实施。详细语义 + 理由 + 排除方案 + 影响范围。
- **D002**(decisions.md):H008 实施形状落地 —— resolver 挂 SendStepConfig + accumulation 复用帧侧 self-ref + 6 个设计待决点最终方案 + accumulation 路径偏离记录。
- **voice.md**:2026-06-17 用户拍板原话(连续累积语义 / 字段级可变参数语义 / 纠正线 A 误判) + 2026-06-18 accumulation 路径拍板。
