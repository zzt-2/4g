# [S012] 实时测试页录制功能重设计 — TDD 实施（H014）

> 2026-06-28 | 实施 | 状态: 代码完成（全量测试+tsc+lint 过），**待用户目标 Linux 机实测卡顿**
> 关联决策: D002（新建，录制架构：独立路径 + 原始字节 + 主进程写盘）
> 前序: H014-recording-redesign-implementation-handoff.md（实施型 handoff，已执行）

## 目标

按 H014 handoff + spec + plan（12 任务 TDD）实施录制功能重设计，解决 4 个用户诉求：
①切走再回来录制取消（组件级→全局）②要有录制设置只录设置的 ③录帧而非整表快照 ④省空间存法。

## 记录

### 开工前：先落地 S015/D013 基线（handoff 未明说的前置依赖）

报到时发现工作区有一大批未提交改动——正是 S015/D013 治本（routing-tick 删 fanOutToStorage、receive-storage-bridge 删除、storage-local append-only、D013 决策等），但都没提交。本录制 plan 的红线前提（routingTick 无写盘）依赖这批改动已落地。用户选"先提交 S015 那批再开工"，故先拆 6 个 commit 落地（S015 治本 / 性能配套 / S015 治理落档 / gitignore / H012 / pnpm-workspace），建立干净 HEAD 基线（1868 passed / tsc src 0 错），再开 `feat/recording-redesign` 分支开工。

### T1-T11 实施（按 plan 逐任务 TDD，feature 分支 12 commit）

| Task | 内容 | 关键点 |
|---|---|---|
| T1 | 二进制序列化纯函数 | magic "RCD1" + 帧记录(uint32秒+uint16 len+frameId+bytes)，6 单测 |
| T2 | disk-rotation-writer 共享写盘工具 | 从 storage-filter 提取，参数化目录/前缀/扩展名 |
| T5a | platform-bridge Recording 类型 | **提前于 T3**（T3 依赖 RecordingFrameInput，plan 依赖图微调）|
| T3 | 主进程 recording-writer | 包装 T2 + 注入 T1 序列化，主进程用 @/ 别名（tsconfig paths 已配）|
| T4 | storage-filter 重构复用 T2 | -141/+38 行去重，Stats 映射保持契约，91/91 无回归 |
| T5b | IPC 通道 | facade+handlers+preload+main 接线，6 粗粒度方法（R6）|
| T6 | recording feature 主体 | types/state/service/composable，6 service 单测 |
| T7 | DisplayPreferences 扩展 | **发现白名单是 5 处不是 4 处**（见下），82/82 |
| T8 | routing-tick 采集接线 | RecordingBridge.collect O(1) 早退（S015 守约），6 bridge 单测 |
| T9 | RecordingConfigDialog + FrameSelector 多选 | 向后兼容单选调用方，只列接收帧 |
| T10 | DisplayPage 接线删内联 | 治诉求①根因，-57/+36 净删内联录制 |
| T11 | 持久化 RecordingConfig | 存整个 preferences 自动跟随，hydrate 走 normalize 补默认 |

### 关键发现：DisplayPreferences 加字段白名单是 5 处不是 4 处（修正 plan）

plan T7 说"加字段必须改 4 处（types/defaults/normalize/clone）"。实测发现是 **5 处**：
1. types.ts（字段 + Patch）✓ plan 有
2. defaults.ts ✓ plan 有
3. normalize.ts ✓ plan 有
4. clone.ts ✓ plan 有
5. **applyDisplayPreferencesPatch（patch 合并）**——漏这处会导致 patch 合并丢 recording；且 **cloneRecordingConfig 必须防御 undefined**（旧 snapshot fixture 的 preferences.recording 缺失）✗ plan 漏

症状：加字段后 7 个 display 测试崩（TypeError: Cannot read 'selectedFrameIds'）+ 深比较不等。修 5 处 + fixture 加字段后全绿。已落 D002 记此教训。

### S015/D013 红线守约（本计划最高优先级约束）

- T8 RecordingBridge.collect **第一行 `if (!isRecording) return`**（O(1) 早退）✓
- 录制不碰 storage-local 的 records 数组（D013 单一入口 appendLocalRecords 未被新代码触碰）✓
- renderer 侧无数组累积/深拷贝（appendFrames 直接 fire-and-forget IPC）✓
- 写盘在主进程（WriteStream 顺序 append）✓

**但架构上规避 ≠ 验收完成。** 见下"验证"——目标机实测未做。

## 决策引用

- **D002**：新建。录制架构决策（独立路径不碰 storage-local + 记原始字节 + 主进程写盘 + 采集点在 routingTick matched 帧），含 5 处白名单教训。
- D013（ui-feature-bugs 专题）：唯一 records 写入口是 appendLocalRecords，禁止 routingTick 写盘——本设计遵守。
- D001（本专题）：三视图独立刷新节奏——无关，仅编号相邻。

## 范围确认

- 本轮在 scope boundary 内：是（DisplayPage 录制按钮是 display-group-management 专题的，录制重设计属该页功能演进）。
- 不含：History 页改造（消费 .bin 的查看器，下一轮 spec）；northbound（另一专题）。

## 验证（诚实标注）

| 验证项 | 结果 | 说明 |
|---|---|---|
| recording 单测 | ✅ 18/18 | serialization 6 + service 6 + bridge 6 |
| display 单测 | ✅ 82/82 | 含 3 新迁移/往返测试 |
| storage-highspeed 回归 | ✅ 91/91 | T4 重构无回归 |
| runtime 回归 | ✅ routing-tick 11 + bootstrap 11 | helpers mock 补 recordingBridge |
| 全量测试 | ✅ 11 failed / **1889 passed** | 11 失败全 pre-existing（heartbeat 5 + tcp 4 + frame-selector 1 + event-truncation 1），与 S015 基线一致，0 新增；新增 21 passed 是本轮测试 |
| tsc | ✅ src/ 0 错 | 仅 plugin-vue 3 个工具噪声 |
| lint | ✅ 本轮文件 0 error | 2 个 pre-existing lint error（serial-handlers/use-display-refresh.spec）与本轮零关系 |
| **S015 目标机实测** | ⚠️ **未做** | 需用户在 Linux（银河麒麟）连真实数据源实测，看 `[routingTick] slow` 是否出现、切路由录制是否继续 |
| 诉求①切路由不中断 | ⚠️ 待实测 | 代码层已治（状态全局+组件卸载只停 polling），需实测坐实 |
| 落盘 .bin | ⚠️ 待实测 | 需实测 `{userData}/dongfanghong/recordings/*.bin` 存在 + 重启还在 |

## 后续

- **待用户目标机实测**（本计划最终判据，不能跳）：连真实数据源 → 开录制选 1-2 接收帧 → 看 routingTick 耗时无显著上升 + 无 slow warn → 切路由再回来录制继续 → 停录制检查 .bin → 重启 App 文件还在。若卡顿，记 trace 用 analyze-perf.py 消化，回 T8 优化。
- **下一轮 spec：History 页改造**为"读 .bin → parseReceiveFrameFields 解析 → 画图"（本轮故意留的债务，录制出 .bin 暂无人消费）。
- 旁路 bug `HistoryPage.vue:15` 拼写（storageLocalService vs storageService）本轮未顺带修，独立 bug。
- feature 分支 `feat/recording-redesign` 待实测后决定合并方式（finishing-a-development-branch）。
