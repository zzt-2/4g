# [S008] emergent 分组语义 + buffer 累积修复（接收页鬼畜）

> 2026-06-21 | 修复 (3xx) | active
> 上游: S007 / H001（已收口） | 直接合同: 设计文档 §2.1/5（局部偏离，见 D-record）

## 目标

排查并修复用户报告的接收页两个现象：
1. 收到一个帧后，分组列表"莫名其妙多了一个分组"（用户没手动建过分组）
2. 表格"鬼畜"——内容在"有值"和"暂无字段数据"之间反复横跳，约 1 次/秒

## 根因（系统性调试定位，非猜测）

### 现象 1：多出来的分组 = emergent 分组，label 是 frameId 裸值

- bridge（`receive-display-bridge.ts:37-49`）对未分组帧用 `groupId: f.frameId` 透传 —— **设计内行为**（设计文档 line 19/171/258 明文支持）
- `DisplayPage.groups` computed 原实现扫 `getTable1Rows()` 的 groupId 算出 emergent 分组，**label 直接用 frameId** → 用户看到看不懂的 id

这不是 bug，是 UX 呈现问题。emergent 分组不写 persistence（分组管理弹窗看不到它、重启消失），符合设计。

### 现象 2：鬼畜 = 两个独立缺陷叠加

**缺陷 A（整表闪"暂无字段数据"）**：`buildPlaceholderRows` 对 emergent 分组返回空。
- 用户选中 emergent 分组（value=frameId）后，`configuredGroups.find(g => g.id === frameId)` 找不到（emergent 不在 configuredGroups）→ `return []`
- placeholder 兜底失效，表格完全靠 live buffer
- 见缺陷 B → buffer 覆盖瞬间 live 空 → 整表闪"暂无字段数据"

**缺陷 B（内容闪空）**：display buffer 整体覆盖语义。
- `display-service.ts:194` 每次 `ingestSourceMaterial` 把 `buffer.sourceFields` 整体替换成当前批字段
- routing tick 100ms 一次（`ROUTING_TICK_DEFAULT_INTERVAL_MS=100`），`processReceiveBatch` 一批只匹配一帧
- 一秒十几帧、不同帧分属不同 batch → buffer 在不同帧之间反复横跳 → 非本批帧在表格消失
- 诊断日志证据：`[INGEST] 8/16/112/123` fields 数在跳，证实每批覆盖
- **设计不一致**：图表 chartBuffer 用累积（Map 合并），表格 buffer 用覆盖，同一 feature 两套语义

### 用户指路（关键）

用户原话点破缺陷 A 本质："只有没有接收帧定义或者分组啥也没有的时候才会（出现暂无字段数据）。但肯定是有定义的？" —— 完全正确，emergent 分组在 `buildPlaceholderRows` 眼里就是"分组啥也没有"。

## 修复（3 文件，TDD）

| 文件 | 改动 | 解决 |
|------|------|------|
| `DisplayPage.vue` `groups` computed | emergent 分组改为**从接收帧定义生成**（每个没归入手动分组的接收帧 = 一个分组项，value=frameId/label=帧名），不再扫表格行 | 分组名中文；有帧定义就有分组（不依赖收到数据）；分组列表不再抖 |
| `DisplayPage.vue` `buildPlaceholderRows` | 选中的分组在 configuredGroups 找不到时，按 frameId 走 frameReader 兜底建占位，不再 return [] | 选中 emergent 分组不再整表闪"暂无字段数据" |
| `display-service.ts` `ingestSourceMaterial` | buffer 整体覆盖 → **按 dataItemId 累积（upsert）** | 内容不再闪空；不同帧交替到达保留最后值；与图表 chartBuffer 累积语义对齐 |

新增 2 个 TDD 测试（`display-core-service-state-selector.spec.ts`）：
- `accumulates source material across batches (upsert by dataItemId)` —— 先红（覆盖语义下 frame1 丢失）后绿
- `upsert updates existing field value in place (same dataItemId)`

## 决策引用（本 session 新建）

- **D-buffer-accumulate**：display sourceFields buffer 从整体覆盖改为按 dataItemId 累积。偏离设计文档 line 182"线性 pipeline"隐含的覆盖语义；理由是与图表 chartBuffer 累积语义对齐（同 feature 不该两套 buffer 语义），且实时遥测应显示最后已知值。**新行为：停发的帧保留最后值不自动清除**（用户已确认可接受，未来如需超时清理再议）。
- **D-emergent-from-frame-def**：emergent 分组从接收帧定义生成，不依赖运行时数据。偏离设计文档 line 100/171/258（原定 emergent 靠运行时数据/groupId=frameId 透传呈现）；理由是 R19 精神（静态元数据立足于配置层），避免分组列表被动态数据流牵着抖。emergent 仍不写 persistence、不进分组管理弹窗（设计内约束不变）。

> 两条决策均偏离设计文档明文。如后续做设计文档修订，需同步更新 line 100/171/258/182 四处。

## 范围确认

- 本轮是否在 scope boundary 内：**是**（display-group-management feature 的接收页行为修复）
- 未触碰：bridge 透传逻辑（设计内）、projection 层、persistence、图表累积逻辑、手动分组 CRUD

## Step 验证状态

- **Test**：display 服务层 41/41（含 2 新累积测试）；display + bridge 68/68；display-projection 17/17、routing-tick-regression 10/10，总计 **105/105 断言通过**
- **Lint**：改动 3 文件（DisplayPage.vue / display-service.ts / 测试文件）0 error
- **诊断日志**：临时 `[INGEST]`/`[P1]`/`[P2]` 日志已全部撤除（grep 确认无残留）
- **预存问题（非本轮）**：vitest 并发下 `.vue` transform 加载失败（vite-plugin-vue），clean tree 同样复现，topic-index 已记录；H001 的主干测试坏掉已收口（use-display-refresh.spec.ts 4/4 过）

## 后续

- 用户运行时确认：分组名中文 / 表格不闪 / 手动分组正常（日志写时刚交付，待用户回测）
- 如停发帧残留旧值不可接受 → 加超时清理或按连接状态清 buffer
- 设计文档修订（line 100/171/258/182）待需要时做，与本轮代码解耦
