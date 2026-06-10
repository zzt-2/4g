# Handoff: 甲方接口连通性实施

> 来源: S004 | 交接目标: 按 approved design 实施 northbound connectivity feature
> 文件名: H001-connectivity-impl-handoff.md

## 已完成边界

- S001: 甲方闭环分析，核心映射和架构决策已拍板
- S002: northbound feature 基础框架已实现（4 入站 + 2 出站 + 43 测试 + feature-wiring）
- S003: 甲方 V1.0.4 文档差异 + 控制接口规范 V1.0 分析完成
- S004: 连通性 brainstorm 完成，架构决策 7 条已确认
- Design: `codestable/features/rewrite-northbound/northbound-connectivity-design.md` 已 approved
- Checklist: `codestable/features/rewrite-northbound/northbound-connectivity-checklist.yaml` 已就绪

## 不要做什么

- 不要改 `rewrite/src-electron/main/` 下任何文件
- 不要改 `rewrite/src/shared/platform-bridge.ts`
- 不要改 `rewrite/src/platform/http.ts`
- 不要改 task/send/receive/result/report 等其他 feature 的核心逻辑
- 不要引入 Vue/Pinia/Electron 依赖到 northbound/core/
- 不要把报告生成和 HTTP 交付混在一起（R11）
- 不要在 northbound 中写入其他 feature 的内部状态（R10）
- 不要用 fast path（涉及 northbound 必须走完整 checklist）
- 不要一次提交；按 checklist step 逐步推进，每步 build+lint+test 通过

## 必读

按优先级排序，实施前必须全部读完：

1. **直接合同（必读，决定范围和完成标准）**：
   - `codestable/features/rewrite-northbound/northbound-connectivity-design.md`
   - `codestable/features/rewrite-northbound/northbound-connectivity-checklist.yaml`

2. **甲方文档（必读，JSON 结构和字段定义的唯一真相）**：
   - `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md` — 出站接口 JSON 结构和字段表
   - `refactor/docs/甲方文档/集成系统控制接口规范V1.0.md` — JWT 认证和 9 个上报接口 URL

3. **规范（必读，质量红线）**：
   - `codestable/quality/rewrite-quality-rules.md` — R10/R11/R14 与 northbound 直接相关
   - `codestable/quality/rewrite-review-checklist.md` — 第 13 节 Result/Report/Northbound checklist
   - `codestable/architecture/rewrite-target-structure.md` — 第 12 节 Northbound Placement

4. **现有代码（必读，知道从哪里改）**：
   - `rewrite/src/features/northbound/core/types.ts` — 当前类型定义
   - `rewrite/src/features/northbound/core/outbound-translator.ts` — 当前出站翻译
   - `rewrite/src/features/northbound/services/northbound-service.ts` — 当前 service
   - `rewrite/src/features/northbound/state/northbound-state.ts` — 当前状态
   - `rewrite/src/shared/timer/timer-registry.ts` — 心跳定时器复用

5. **背景参考（选读）**：
   - `.sessions/2026-05-18-northbound-integration/S004-connectivity-brainstorm.md`
   - `.sessions/2026-05-18-northbound-integration/topic-index.md`
   - `codestable/features/rewrite-northbound/northbound-design.md` — 原始 northbound design

## 下一轮

1. 读完全部必读文档
2. 按 checklist s1→s8 顺序实施
3. 每个 step 完成后跑 build+lint+test
4. 全部完成后跑完整 build+lint+test
5. 回报实施摘要（changed files + verify evidence + open issues）
