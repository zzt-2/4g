# 重写主线全程记录

> 状态: active | 时间跨度: 2026-04-23 ~ 2026-05-19 | 最后更新: 2026-05-19 H002 执行 + 集测起点

## 进展线索

- **S001** 架构边界锁定与 CodeStable 体系建立 (04-23 ~ 04-28)
- **S002** 七大基础 feature 实现与交叉审查 (04-29 ~ 05-06)
- **S003** Claude Code 迁移、Send/Bridge/SCOE 三线并行 (05-06) — 补充 6 项关键决策过程
- **S004** Task Service/Settings/Runtime Wiring 实施 (05-07)：统一执行引擎决策、task service/state/selectors 层、result design、settings 完整闭环、runtime wiring 三连、架构文档 34 处同步
- **S005** Receive-Real 设计与架构审计 (05-07 ~ 05-08 上午)：6 维度审计 A+、依赖审计零违规、旧系统三线调研、新旧覆盖矩阵、交叉审查 16 项修复、condition-matching、bootstrap、frame-real design update
- **S006** Runtime 全局规划 (05-07) → 详见 `../2026-05-07-runtime-global-planning/`
- **S007** Real Feature 实施期 (05-08 下午 ~ 05-09)：expression engine 112 tests、frame-real、receive-real 四阶段、TCP/UDP transport、connection 580+ tests、send-real 100 tests
- **S008** Feature 验收 + Command-Ingress 全流程 (05-10 ~ 05-11)：task-real Phase 1+2 验收 748 tests、command-ingress W1-W3 验收 803 tests、receive-real 最终验收、storage-real 验收
- **S009** 简化审计 + UI 架构 + 页面设计 (05-12)：代码简化审计 5 feature、前端规范 39 条、身份标识审计、UI 架构 D1-D6、6 页面域 design、File Facade、UnoCSS
- **S010** 测试修复与 Send/Task 简化 (05-12)：66 个测试失败修复、暂存状态
- **S011** UI 基础设施与六页面实现 (05-13 ~ 05-15)：Wave 0-4、pre-ui checklist、85 文件 +8652 行、47 项 UI 审计、Home 总览页
- **S012** 持久化层与项目管理规范化 (05-15)：RealLocalMaterialAdapter + FeaturePersistence + LazyPersistence
- **S013** 甲方对接闭环分析 (05-18) → 详见 `../2026-05-18-northbound-integration/`
- **S014** Runtime Real 主控对话 (05-07 ~ 05-18)：跨 11 天主控，7 阶段（规划→审计→Wave 1-4→质量→UI 设计→恢复→甲方），驱动 30+ 子对话，~30%→~80% 进度
- **S015** H002 TCP 环路接线 (05-19)：composite adapter 完成，build+lint 通过 → 集成测试独立建专题，详见 `../2026-05-19-integration-testing/`

## 已确认结论

- 重写方法论: CodeStable 体系 + Lane 判定 + 三类真相源
- Feature 归口: frame / settings / storage / connection / receive / send / task / status / display / northbound
- 质量红线: selector 不可变、platform facade、shared 纯 TS、main 不承载业务逻辑
- 第一版偏好: 一步到位，不磨蹭不多轮

## 已知覆盖缺口

全部 132 个有效对话已完成提取和归档：

- **05-07 的 19 个对话**：✅ S004
- **05-08 上午 8 个对话**：✅ S005 追加
- **05-13 的 11 个对话**：✅ S011 全面覆盖
- **05-14 的 7 个对话**：✅ S011 全面覆盖
- **05-18 runtime real**：✅ S014
- **05-18 剩余 5 对话**：✅ 确认已被 S011/S013/S014 覆盖
- **05-08 下午~09**：✅ S007 已有逐对话详细覆盖
- **05-10~11**：✅ S008 已有逐对话详细覆盖
- **05-12**：✅ S009/S010 已有合理覆盖
- **05-06**：✅ S003 补充 6 项关键决策过程
- **05-13 大文件 8cd4b1c4**：✅ S011 Wave 0-4 覆盖

各 note 可信度评估：

| Note | 可信度 | 备注 |
|---|---|---|
| S001 | 中 | 无 JSONL（04-23 前），从 git history + memory |
| S002 | 中高 | memory 写的框架 + S003 补充决策过程 |
| S003 | 高 | JSONL 回溯补充 6 项决策过程 |
| S004 | 高 | 全部 19 对话 JSONL 提取 |
| S005 | 高 | 原有中 + 追加 4 对话 JSONL 提取 |
| S007 | 高 | agent 确认无重大缺口 |
| S008 | 高 | agent 确认无重大缺口 |
| S009/S010 | 中高 | agent 确认无重大策略级缺口 |
| S011 | 高 | Wave 0-4 详细 commit 级覆盖 + 5.3M 文件确认 |
| S014 | 高 | 5.6M 主控对话 JSONL 提取 |

## 未决项

- Task-real 测试间歇性失败待彻底解决
- Command-ingress G5/G6 待后续确认
- Send/Task 简化未完成（05-12 暂存状态，见 S010）
- Northbound MVP 6 接口实现未启动
- 串口/SCOE 真实硬件验证未开始

## 当前位置

S001-S014 + conversation-index 全部完成。132 个有效对话全部已提取或确认覆盖。各 note 可信度从中提升到中高~高。

## 附属文件

- `conversation-index.md` — 132 个对话的完整索引（按日期分组，含 ID、大小、主题）
