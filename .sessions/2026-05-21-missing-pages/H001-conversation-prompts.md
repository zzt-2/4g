# Handoff: 各对话短提示词

> 来源: S001 | 交接目标: 给用户开新对话时粘贴
> 文件名: H001-conversation-prompts.md

## 已完成边界

S001 调研完成，6 agent 历史回溯完成，7 类决策补充写入，对话 A~F + task-real + northbound 全部规划完毕。对话 A 已完成并验证提示词缺陷，已修正。

## 不要做什么

- 不要跳过 Wave 1 直接设计
- 不要在 Wave 2 未完成时派 Wave 3
- 不要跳过必读文档（frontend conventions / checklist / quickref）
- 不要把 northbound/report/file delivery 和页面混在一起
- 不要自编审查/自检方法 — CLAUDE.md 已有完整框架，必须引用
- 不要闷头跑自检 — 自检方案先说出来等用户确认再执行

## 必读

1. `.sessions/2026-05-21-missing-pages/S001-research-and-planning.md` — 完整 agent 策略
2. `.sessions/2026-05-21-missing-pages/topic-index.md` — 专题总览

## 对话 A 经验教训

对话 A 实际执行中发现提示词存在以下缺陷，已在本版修正：

1. **只写了 Wave 1/2/3，没提 CodeStable 流程** → 现在明确要求按 cs-feat-design → impl → accept 走
2. **没指定自检方法** → 现在引用 CLAUDE.md 的完整审查框架
3. **没强调实施前必读规范** → 现在列为硬门槛
4. **没要求自检前先说方案** → 现在明确要求

## 通用流程指令（所有 Lane B/C 对话适用）

以下指令适用于所有页面对话（B/C/D/E/F/Northbound），直接附加在提示词中：

```
## 流程（必须严格按顺序）

### Phase 1: 事实收集（Wave 1）
- 按 S001 对应对话的 Wave 1 派 agent（6-9 个，每批 ≤3 并发）
- 全部完成后汇总事实，先写入 session note 或设计文档

### Phase 2: 设计（cs-feat-design）
- 汇总 Wave 1 事实，产出设计文档 + checklist
- 设计完成后，用 CLAUDE.md 中的以下框架自检（先说方案等用户确认再执行）：
  - 过度设计审查（5 维：上游消费方式/下游需求匹配/驱动需求真实性/链路位置优化/跨模块一致性）
  - 代码精简审查（5 维：层间增值/死 surface/传递函数/重复模式/过度抽象）
  - Service Readiness Audit（5 项：method 存在/签名对齐/副作用管理/selector 字段/read-for-edit 路径）
  - 覆盖度检查（对照集测行为基线逐条确认）
- 自检方案必须先说给用户听，等确认后再执行
- 自检发现的问题必须修正后才能进入实施

### Phase 3: 实施（cs-feat-impl）
- **实施前硬门槛**：必须先读 codestable/quality/rewrite-frontend-conventions.md + rewrite-frontend-checklist.md + rewrite-frontend-quickref.md
- 按 CLAUDE.md "实施前检查"确认 7 项（直接合同/旧系统覆盖/feature 归口/public API/Electron/platform/northbound）
- 实施完成后必须验证：pnpm build + pnpm lint + pnpm test（如适用）
- 实施摘要必须含：Changed files / Verify evidence / Open issues

### Phase 4: 验收（cs-feat-accept）
- 对照 checklist 逐条确认
- 审查结论按 4 档：pass / pass-with-known-gaps / revise-required / blocked
- 缺少用户决策、直接合同、关键 baseline 时结论必须是 blocked
```

---

## 对话 B：历史分析 — display 扩展

```
Lane B | 历史分析页 display feature 扩展设计实施

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §历史决策补充 + §对话 B
再读 .sessions/2026-05-21-missing-pages/topic-index.md

目标：扩展 display feature 支持多图表实例(1-4) + 元数据注册表 + storage→display 数据转换

直接合同：S001 §历史分析关键发现 + §历史分析补充
边界护栏：R7（多图表偏好归 display，数据归 storage）+ R4

按 H001 §通用流程指令执行。Wave 1 按 S001 §对话 B 派 9 agent。
```

## 对话 C：历史分析 — UI 设计实施

```
Lane B | 历史分析页 UI 设计实施 | 前置：对话 B 完成

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §对话 C
再读 .sessions/2026-05-21-missing-pages/topic-index.md
再读 .sessions/2026-05-21-missing-pages/S003-display-multi-chart-extension.md（对话 B 实施记录）
再读对话 B 产出的 display 扩展代码（重点：core/types.ts, services/display-service.ts, selectors/）

目标：基于对话 B 的 display 扩展，设计实施历史分析页面（Mode A 布局：左控制面板 + 右图表区）

直接合同：对话 B 产出 + S001 §历史分析关键发现
边界护栏：R4（UI 不承载业务逻辑）+ 前端 conventions

重要边界变更（对话 B 已确认）：
- display feature 不负责时间序列历史积累。ChartSeriesProjection.points 在 display 层永远为空
- 时间序列数据由 storage feature 提供
- 页面 composable 负责桥接 storage → ChartSeriesProjection：从 storage 取时间序列数据，用 display 的 fieldId 映射关系（groupId:dataItemId）构造带 points 的 ChartSeriesProjection
- display 用 groupId:dataItemId 复合键，storage 用 channel+key 标识，composable 做转换
- 多图表：1-4 个 ChartInstanceProjection，每个独立 selectedItems + yAxis
- 统计量（mean/RMSE）在 UI 层计算，不在 display state

按 H001 §通用流程指令执行。实施前必须先做 Service Readiness Audit。

对话 B 遗留项（C 必须处理）：
1. WaveformChart 颜色硬编码 → 迁移到 CSS token（BUG/SMELL）
2. UI 页面组件实现：HistoryPage / HistoryDataSelector / HistoryTimeSelector / CSVExportDialog
3. storage→ChartSeriesProjection 转换 composable（identity: channel+key → groupId:dataItemId）
4. 统计量计算（mean/RMSE）在 UI 层实现
5. 多图表集成测试补全
6-15. 其他 UI 相关测试覆盖缺口（yAxis merge 边界、charts>4 truncation、getChartInstances 集成测试等）
```

## 对话 DP：实时显示页 UX 重做

```
Lane B | 实时显示页(DisplayPage) UX 重设计重实施

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §历史分析补充（display 部分）
再读 rewrite/src/pages/DisplayPage.vue（当前新系统 — 277行壳子，功能仅旧系统15%）
再读旧系统对比文件：
  - src/pages/DisplayPage.vue 或 src/components/display/ 下所有文件
  - src/stores/dataDisplayStore.ts（1073行，双面板+三模式+录制+分组+统计）

目标：重做 DisplayPage，达到旧系统同等 UX 水平。核心差距：
  - 旧系统有双面板（2个独立可配置面板），新系统只有单视图
  - 旧系统有三种显示模式（表格/折线图/星座图）可切换，新系统无
  - 旧系统有图表配置（字段选择/Y轴/统计叠加），新系统无
  - 旧系统有录制控制（开始/停止/CSV），新系统无
  - 旧系统有分组管理，新系统无
  - 旧系统有字段排序/收藏，新系统无
  - UI 设计丑、UX 不合理是主要问题

直接合同：旧系统 DisplayPage 行为 + display feature 现有 API
边界护栏：R4（UI不承载业务逻辑）+ 前端 conventions + display feature API 不改（只做 UI 层）

按 H001 §通用流程指令执行。
Wave 1 重点：
  - 旧系统完整交互提取（双面板操作流/模式切换/图表配置/录制/分组）
  - 新系统 display service API 全量梳理（确认哪些能力已就绪）
  - 前端规范 + 旧系统 UI 截图参考（如有）
```

## 对话 D：存储管理 — feature 设计

```
Lane B/C | 存储管理高速存储 feature 设计（只设计不实施）

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §存储管理补充 + §对话 D
再读 .sessions/2026-05-21-missing-pages/topic-index.md

目标：设计高速存储三层架构 — 规则模型 + 分流机制 + Platform 文件流。产出设计文档 + checklist，不写代码

直接合同：S001 §存储管理关键发现 + §存储管理补充
边界护栏：R5 + R6 + CLAUDE.md main 不承载业务逻辑

按 H001 §通用流程指令执行（Phase 1-2，不进 Phase 3 实施设计文档 + checklist 产出 + 自检通过即可。
Wave 1 按 S001 §对话 D 派 9 agent。
```

## 对话 E：存储管理 — feature 实施

```
Lane B | 存储管理 feature 实施 | 前置：对话 D 设计通过

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §对话 E
再读对话 D 产出的设计文档 + checklist

目标：按对话 D 的设计实施高速存储 feature（规则模型 + 分流机制 + Platform 文件流）

直接合同：对话 D 的设计文档 + checklist
边界护栏：R5 + R6 + CLAUDE.md main 不承载业务逻辑

按 H001 §通用流程指令执行（Phase 3-4 实施+验收。实施前必须先读前端规范 + 做实施前检查 7 项。
具体 Wave 1 agent 派法根据 D 设计文档调整。
```

## 对话 F：存储管理 — UI 设计实施

```
Lane B | 存储管理 UI 设计实施 | 前置：对话 E 完成

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §对话 F
再读对话 D 设计 + 对话 E 实现产出

目标：设计实施存储管理页面（Mode C 布局）

直接合同：对话 E 实现 + 对话 D 设计
边界护栏：R4 + 前端 conventions

按 H001 §通用流程指令执行。实施前必须先做 Service Readiness Audit。
```

## 穿插：task-real Phase 2

```
Lane A | task-real Phase 2 测试收尾

先读 codestable/features/rewrite-task/task-real-design.md
再读 rewrite/src/features/task/ 下测试文件

目标：补全 Phase 2 缺失测试，确认全部通过

不需要子 agent。直接跑测试、补缺失、验证通过。完事后 build + lint 确认。
实施摘要含：Changed files / Verify evidence / Open issues。
```

## 并行：Northbound 框架

```
Lane B | Northbound 框架搭建（与页面对话并行）

先读 .sessions/2026-05-21-missing-pages/S001-research-and-planning.md §Northbound 补充 + §并行对话 Northbound
再读 .sessions/2026-05-18-northbound-integration/S001-closed-loop-analysis.md

目标：搭建 northbound feature 框架 — inbound/outbound translator + HTTPS server bridge + result 接线

直接合同：northbound S001（4 接口 + 7 条已拍板决策）
边界护栏：R5 + R6 + R10 + S001 已拍板 7 条决策

按 H001 §通用流程指令执行。Wave 1 按 S001 §并行对话 Northbound 派 6 agent。
```
