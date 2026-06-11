# 探索记录合集索引

> 生成时间: 2026-06-11

## 1. 统计

| 类别 | 文件数 | 大小 |
|------|--------|------|
| Session Notes (S/R/H) | 81 | 1.6M |
| 对话历史 (JSONL + MD) | 81 JSONL + 81 MD | 99M |
| 架构设计文档 | 163 | 7.5M |
| 规范/参考文档 | 41 | 384K |
| **总计** | **~450** | **108M** |

---

## 2. Session Notes 按专题

### 2.1 重写主线全程记录 (2026-04-23 ~ 2026-05-19, active)

核心专题，记录从架构设计到 UI 实现的完整推进。

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| S001 | 架构边界锁定与 CodeStable 建立 | 10 大 feature 归口、质量红线、方法论确立 |
| S002 | 七大基础 feature 实现与交叉审查 | frame/settings/connection/receive/task/status/display/northbound |
| S003 | Send + Bridge + SCOE 三线并行 | send design 完成、bridge prep G3/G4 blocked |
| S004 | Task/SCOE/Send 统一决策 | 统一执行引擎、step 多态化、SCOE 复用 task |
| S005 | Receive Real 设计与审计 | 管线设计 5 决策锁定、2 子 feature 拆分 |
| S007 | Real Feature 实施 | expression engine 112 tests, frame-real, TCP/UDP, 580+ tests |
| S008 | Feature 验收 + Command-Ingress | task-real 748 tests, command-ingress 803 tests |
| S009 | 简化审计与 UI 设计 | 代码精简审计、UI 基础设施方案 |
| S011 | UI 基础设施与六页面实现 | 85 文件 +8652 行, 47 项 UI 审计 |
| S014 | Runtime Real 主控 | 跨 11 天, 7 阶段, 30+ 子对话, ~30%→~80% |

**关键结论:** Feature 归口体系已确立；selector 不可变、platform facade、shared 纯 TS、main 不承载业务逻辑是硬红线；第一版一步到位不磨蹭。

### 2.2 甲方对接闭环分析 (2026-05-18 ~ 2026-06-10, active)

基于甲方 V1.0.1 接口文档，分析 northbound 对接闭环。

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| S001 | 闭环讨论与决策拍板 | 5 问题分析、代码级验证、所有核心决策拍板 |
| S002 | Northbound feature 实施 | 8 步全部完成, 43 单测通过 |
| S004 | Connectivity brainstorm | 实时控制接口分析 |
| S005 | Connectivity 实施 | 74 tests + 32 补测 |
| S006 | Mock Task + Stub 补全 | 7 stub handler + FTP, 1394 tests |
| S008 | 中心对接 UI 设计 | 配置弹窗/任务列表/上报弹窗/状态面板 |

**关键结论:** 甲方 testCase = 我们的 TaskDefinition；MVP 6 接口已实现；HTTPS server 放 main；immediate/isEnd 始终 true。

### 2.3 集成测试体系建立 (2026-05-19 ~ 2026-05-20, dormant)

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| S001 | 历史讨论提取 | 12 agent 并行, 835 tests 全部单元级 |
| S002 | Feature 设计文档提取 | 43 条 feature 交互路径零集成测试覆盖 |
| S003 | 旧系统可观测行为提取 | 236 条提取, 194 条保留 |
| S004 | 新系统接缝审计 | 22 个接缝 (7 高风险 + 10 中 + 5 低) |
| S005 | 集测范围综合 | 36 条集测项 (P0×10 + P1×12 + P2×14) |
| S006 | 集测实施 | 343 tests passing, 全部 36 条完成 |

**关键结论:** fanOutToStorage await bug 已修复；端到端数据通路 6 条链路此前零测试；onSettled 竞态待解决。

### 2.4 缺失页面规划与实施 (2026-05-21 ~ 2026-05-26, active)

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| S001 | 调研 + 规划 | 三页深度调研, 6 agent 回溯主线程 |
| S002 | 系统设置页 Wave 1-3 | 5 分组 + 串口扩展 |
| S003 | Display 扩展 | 14 文件实施, 27 项修复 |
| S004 | 历史分析页 UI | 18/18 覆盖, 1259 tests |
| S005 | 高速存储设计 | 9 项架构决策 |
| S006 | 高速存储实施 | 21 项实施, 91 tests |
| S007 | DisplayPage UX 设计 | 8 项设计决策 |

**关键结论:** 每个页面分两步 — 先扩 feature API (service readiness) 再做 UI。

### 2.5 UI 与 Feature Bug 集中修复 (2026-06-10, active)

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| H001 | Bug fix prompt | 帧迁移脚本 + 表达式修复 + 串口枚举 |
| H002 | 帧发送管线修复 | 5 个系统性修复, 25 个新用例 |
| H003 | 接收管线调试 | refreshFrameReferences() 从未被调用, 已修复 |
| H005 | 接收管线调试 | 根因定位修复 |

**关键结论:** 发送帧状态丢失 (keep-alive)、UDP 双重拦截、IP 显示错误为已知 bug。

### 2.6 接收帧分组管理 (2026-06-11, active)

| 编号 | 标题 | 核心内容 |
|------|------|----------|
| S001 | 实施与修复 | 基础实施 + 15 项质量问题修复 + 运行时修复 + 持久化 |

---

## 3. 对话历史按时间

### ★★★ 核心里程碑 (架构决策 / 大规模实现 / 主控对话)

| UUID | 大小 | 首条消息摘要 |
|------|------|-------------|
| `030d34c4` | 5.5M | runtime 真正跑起来 — 9 feature 全建成, 接真实能力 |
| `8cd4b1c4` | 5.1M | 巨型主对话 (local command 触发) |
| `fcd7d3b7` | 4.5M | integration testing handoff → 集成测试体系实施 |
| `f900cf31` | 3.4M | UI bug fix prompt — 帧迁移 + 串口枚举 + 中心对接 |
| `9070a80e` | 3.2M | display-group-management feature 实施 |
| `e591898f` | 3.0M | Northbound 框架讨论 + 甲方接口文档分析 |
| `dc8eae8a` | 2.9M | 接收管线调试 — 分组讨论 |
| `8f546f1d` | 2.7M | 甲方接口文档分析 + FTP + 集成系统规范 |
| `b8d68cad` | 2.3M | Frame + Connection 简化 + Readiness 实施 |
| `520c81ff` | 2.2M | 帧域 + 连接页面设计 (3 页面) |
| `ba47853b` | 2.1M | 修复测试失败 + Send/Task 简化收尾 |
| `81d74a21` | 2.1M | missing pages 对话 B — display 扩展 |
| `0a607373` | 2.0M | missing pages 对话 D — 高速存储设计 |
| `8870d692` | 1.7M | 主对话 → sessions 拆分 (子 agent 分析) |
| `e60a4bee` | 1.7M | missing pages 对话 A — 系统设置 |
| `d36c3133` | 1.9M | connectivity 实施 handoff |
| `ef4b1a31` | 1.5M | UI handoff — 中心对接 UI |
| `112ad1b1` | 1.6M | 帧发送管线修复 |
| `471dd9ec` | 1.0M | session note backfill handoff |
| `5823d8c5` | 1.0M | 全局 UI 架构设计 (brainstorm → design) |

### ★★ 重要实现 (feature 实现 / 审计 / 设计)

| UUID | 大小 | 首条消息摘要 |
|------|------|-------------|
| `dc9d3527` | 691K | integration testing 对话 1 |
| `0c2c786d` | 1.1M | missing pages 对话 C — 历史分析 |
| `11e420a7` | 946K | integration testing 对话 10 |
| `2dd0dca7` | 837K | integration testing 对话 11 |
| `2e38b40c` | 955K | integration testing 对话 9 |
| `3cf91260` | 1.0M | integration testing 对话 8 |
| `aa24f945` | 981K | integration testing 对话 6 |
| `abd57e07` | 927K | integration testing 对话 4 |
| `d88d91ec` | 1.0M | integration testing 对话 7 |
| `91919c76` | 1.0M | integration testing 对话 12 |
| `145fc589` | 753K | Send/CommandIngress/Task 三页面全面审计 |
| `2281612a` | 760K | 甲方对接闭环讨论 — 核心链路分析 |
| `3e99ba09` | 985K | 全 feature 待办项整理 — 一次收口 |
| `3f891982` | 978K | 任务 + 发送 + 指令页面设计文档对标修复 |
| `42307e1a` | 762K | 指令接入页实现 |
| `0771be24` | 1.0M | 任务管理页实现 |
| `60b503be` | 959K | 任务域 + 发送 + 指令页面 Design |
| `6190ff02` | 839K | Connection 原子化 connect + reconnect |
| `67ed8d9c` | 1.1M | Receive 数据展示页 + 可视化组件 |
| `70e14fef` | 1.2M | 前端页面 UI 审计 — 6 页面全覆盖 |
| `722c9527` | 931K | rewrite 前端全面自检审计 |
| `7412d5aa` | 1.0M | task-real brainstorm |
| `764d1979` | 1.2M | audit fix prompt — 设计-代码对齐 |
| `7797bae1` | 1.2M | 持久化层 — storage adapter + 启动加载 |
| `95680e4b` | 1.1M | 简化 + Readiness (Send + Task) |
| `b4fa875a` | 671K | 简化 + Readiness (Frame + Connection) |
| `b717a258` | 1.1M | 设计-代码对齐验证 + 已验收 feature 回归 |
| `a6907ef0` | 703K | rewrite 前端审计修复 — 一次性执行 |
| `a6d96ec4` | 891K | Task UI Overhaul 实施 |
| `de3bea8c` | 357K | 前端 UI 审计问题全量修复 |
| `de65dd18` | 371K | Home 页面 (总览页) 实现 |
| `ec17c0bf` | 893K | Feature 代码简化审计 (5 feature) |
| `ef5da558` | 933K | 帧域 + 连接页面对标修复 |
| `8ed41665` | 1.0M | 帧发送页实现 |
| `f692bfb7` | 919K | 帧定义编辑页实现 |
| `8862a360` | 1.0M | UI design 文档对齐修正 |
| `933ecedf` | 611K | missing pages — task-real Phase 2 |
| `a094972e` | 805K | task-real Phase 2 |
| `2be7d2cf` | 616K | missing pages 对话 DP — DisplayPage UX |
| `59304441` | 999K | 侧边栏导航补全 + icon 修复 |

### ★ 辅助 / 小修复 / 工具性对话

| UUID | 大小 | 首条消息摘要 |
|------|------|-------------|
| `0108eb75` | 542K | integration testing 对话 2 |
| `1e70be19` | 627K | integration testing 对话 3 |
| `3406d358` | 710K | H002 local TCP loopback 执行 |
| `5e2043ab` | 555K | test report handoff |
| `7dbd2baa` | 459K | Platform File Facade |
| `84739cc2` | 394K | Frame Editor 代码精简 |
| `96dd26ff` | 215K | frame + connection 设计文档小修正 |
| `9a146f5c` | 450K | command-ingress 对齐 + Readiness |
| `c0cb43c1` | 551K | send 域对齐 + Readiness |
| `c430e301` | 46K | SendPage 帧列表为空 — direction 值错误 |
| `cd448a9f` | 351K | 文件恢复助手 (从 JSONL 恢复丢失文件) |
| `1f252873` | 504K | UnoCSS 间距迁移 |
| `af70f70b` | 745K | UnoCSS 间距迁移重做 |
| `2aca96f4` | 735K | Command-ingress 简化 + Readiness |
| `fa9a7e84` | 397K | paper evaluation 讨论 |
| `0e090c31` | 461K | local command |
| `60ecd267` | 646K | local command |
| `8a8f4230` | 3K | local command (极小) |
| `f7ee5742` | 14K | 问对话历史位置 |
| `f5253cd5` | 128K | 当前对话 (合集整理) |
| `392e36d7` | 401K | 改旧程序/编图 |

---

## 4. 架构文档清单

### architecture/ (系统设计)

| 文件 | 主题 |
|------|------|
| `rewrite-system-architecture.md` | 系统架构总览 |
| `rewrite-target-structure.md` | 目标目录结构 |
| `rewrite-feature-boundaries.md` | Feature 边界定义 |
| `rewrite-feature-interaction-matrix.md` | Feature 交互矩阵 |
| `rewrite-platform-api-surface-reduction.md` | Platform API 瘦身 |
| `rewrite-pre-design-gate-and-sequencing.md` | 设计门控与排序 |
| `rewrite-shared-tooling-audit-plan.md` | shared/ 提取审计 |
| `rewrite-connection-platform-bridge.md` | 连接平台桥接 |
| `rewrite-connection-transport-boundary.md` | 连接传输边界 |
| `rewrite-ui-style-baseline.md` | UI 样式基线 |
| `rewrite-thin-ui-runtime-wiring.md` | 薄 UI + Runtime 接线 |
| `overview-architecture-decision-frame.md` | 架构决策框架 |
| `boundary-desktop-capability-access.md` | 桌面能力访问边界 |
| `boundary-northbound-collaboration-delivery.md` | Northbound 交付边界 |
| `boundary-runtime-state-ownership.md` | Runtime 状态归属 |
| `domain-scoe-position.md` | SCOE 定位 |
| `domain-task-system-ownership.md` | 任务系统归属 |
| `topology-receive-send-mainlines.md` | 收发主线拓扑 |
| `analysis-current-architecture-gap.md` | 架构 gap 分析 |
| `analysis-target-architecture-gap-round-2.md` | 架构 gap 分析第二轮 |
| `rewrite-platform-app-shell-file-dialog.md` | 文件对话框 |

### architecture/compound/ (跨域分析与学习)

| 文件 | 主题 |
|------|------|
| `2026-04-28-rewrite-execution-charter.md` | 重写执行章程 |
| `2026-04-28-northbound-overlap-and-gap-map.md` | Northbound 重叠与 gap |
| `2026-04-28-rewrite-scope-default-preserve.md` | 重写范围与保留策略 |
| `2026-04-29-rewrite-domain-order-and-first-batches.md` | 域顺序与首批 |
| `2026-05-06-task-scoe-send-execution-engine-unification.md` | 执行引擎统一决策 |
| `2026-05-06-outbound-routing-and-response-decisions.md` | 出站路由决策 |
| `2026-05-07-architecture-audit-report.md` | 架构审计报告 |
| `2026-05-07-dependency-audit-result.md` | 依赖审计结果 |
| `2026-05-07-old-new-system-coverage-matrix.md` | 新旧系统覆盖矩阵 |
| `2026-05-08-platform-expansion-brainstorm.md` | Platform 扩展讨论 |

### architecture/features/ (Feature 设计文档)

| 目录/文件 | Feature |
|-----------|---------|
| `bootstrap/` | 启动引导 |
| `rewrite-connection/` | 连接管理 |
| `rewrite-frame/` | 帧定义 |
| `rewrite-display/` | 显示/可视化 |
| `rewrite-receive/` | 数据接收 |
| `rewrite-send/` | 数据发送 |
| `rewrite-task/` | 任务系统 |
| `rewrite-scoe/` | SCOE 协议 |
| `rewrite-status/` | 状态指示 |
| `rewrite-settings/` | 系统设置 |
| `rewrite-result/` | 结果报告 |
| `rewrite-northbound/` | 甲方对接 |
| `rewrite-command-ingress/` | 指令接入 |
| `rewrite-ui-architecture/` | UI 架构 |
| `rewrite-storage-local-baseline/` | 本地存储 |
| `rewrite-storage-highspeed/` | 高速存储 |
| `2026-06-11-display-group-management/` | 分组管理 |

### architecture/roadmap/ (Roadmap)

| 文件 | 主题 |
|------|------|
| `receive-real/receive-real-roadmap.md` | 接收真实管线 roadmap |
| `receive-real/receive-real-items.yaml` | 接收真实管线 items |
| `receive-real/receive-real-pipeline-acceptance.md` | 接收管线验收 |

---

## 5. 规范与参考文档

### docs/quality/ (质量规范)

| 文件 | 用途 |
|------|------|
| `rewrite-quality-rules.md` | 重写质量规则 |
| `rewrite-review-checklist.md` | 审查 checklist |
| `rewrite-frontend-conventions.md` | 前端 UI 规范 (必读) |
| `rewrite-frontend-checklist.md` | 前端自检 checklist |
| `rewrite-validation-fixture-oracle-baseline.md` | 测试 fixture 基线 |
| `code-simplification-audit.md` | 代码精简审计报告 |
| `cross-feature-identity-audit.md` | 跨 feature 标识审计 |
| `design-code-alignment-audit.md` | 设计-代码对齐审计 |
| `pre-ui-implementation-checklist.md` | UI 实施前 checklist |
| `ui-audit-2026-05-15.md` | UI 审计报告 |

### docs/reference/ (参考资料)

| 文件 | 用途 |
|------|------|
| `rewrite-frontend-quickref.md` | 前端速查卡 (必读) |
| `session-handoff-templates.md` | 会话交接模板 |
| `shared-conventions.md` | 共享约定 |
| `maintainer-notes.md` | 维护者笔记 |
| `tools.md` | 工具参考 |

---

## 6. 跨主题关键结论

### 已验证的模式

1. **Feature 归口体系**: 10 大 feature 各自拥有领域规则、状态、public API。跨 feature 通过 public API 交互。
2. **三层真相源**: sessions (过程记录) / codestable (长期工件) / roadmap (大需求状态)，互不覆盖。
3. **Lane 判定**: Fastforward / Single-thread / Roadmap-Oriented，按复杂度选流程。
4. **Service Readiness 先行**: UI 页面前先审计 feature API 是否就位。
5. **shared/ 纯 TS**: 零 Vue/Pinia/Electron 依赖，任何 feature 可 import shared，shared 不 import feature。
6. **Selector 不可变**: 返回只读快照，消费方不得反向修改。
7. **表达式引擎归口 shared/**: 纯函数，预编译 + 依赖排序。
8. **执行引擎统一**: task/SCOE/send 共享同一引擎，step 多态化。

### 被拒绝的方向

1. **旧 SCOE 独立模块** → 统一归口到"指令接入"feature
2. **旧 store 全局穿透** → feature 内部闭包 + selector 只读快照
3. **裸 IPC 暴露** → platform facade + typed preload
4. **业务逻辑塞 main** → main 只管平台资源和生命周期
5. **northbound task ≈ send task** → northbound 是独立边界
6. **CSV/本地导出 ≈ TestReport** → file delivery 是独立闭环
7. **碎 commit (每步一提)** → 每对话只提交一次

### 未决问题

1. **Task-real 测试间歇性失败** 待彻底解决
2. **onSettled 竞态** (CI 内部也调 onSettled) — 高优先级
3. **errorPolicy stop/pause 不 resolve settle promise** — 高优先级
4. **发送帧状态丢失** 修复方案待确认 (Pinia/keep-alive/持久化三选一)
5. **expressionCache 运行时未传** 导致跳过求值
6. **速度模拟帧** 代码修复+单测通过，实际运行速度不累加
7. **持久化未生效** (display-group) 待 DevTools 日志排查
8. **HTTPS 库选型**、TLS 配置、sessionId 生命周期管理
9. **真实串口/SCOE/设备** 硬件验证未开始
10. **真 TCP 测试** CI 环境 (WSL2/Windows) 兼容性待验证
