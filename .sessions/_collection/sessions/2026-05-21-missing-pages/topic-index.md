# 缺失页面规划与实施

> 状态: active | 时间跨度: 2026-05-21 ~ | 最后更新: 2026-05-26 S007 DisplayPage UX 设计完成

## 进展线索

- **S001** 调研 + 规划 (05-21 ~ 05-24)：线1 bug修复完成，三页深度调研完成，6 agent 回溯主线程 S004-S012+northbound 完成（7类决策补充），对话级 agent 策略已规划（每对话 6-9 agent 三波结构）
- **S002** 系统设置页 Wave 1-3 (05-24)：9 agent 事实收集完成，设计方案已出（5 分组 + 串口扩展），3 agent 自检通过（SC1 70%/SC2 100%/SC3 覆盖 #1-#9），待进入 CodeStable feat 流程
- **S003** 对话 B display 扩展 (05-25)：9 agent 事实收集→设计→3 agent 自检→14 文件实施→42 问题全量扫描→27 项修复（含 historyBuffer 幽灵边界清除）→build+lint+1216 tests 通过，待提交
- **S004** 对话 C 历史分析页 UI (05-25)：Wave 1 事实收集→Wave 2 设计(6项决策+无 service gap)→Wave 3 自检(18/18 覆盖)→10 文件实施(composable+4 组件+token 迁移+路由)→build+lint+1259 tests 通过
- **S005** 对话 D 高速存储设计 (05-25)：9 agent 事实收集→9 项架构决策→3 agent 自检→设计文档+21 项 checklist→代码级验证修正 4 项
- **S006** 对话 E 高速存储实施 (05-25)：按 checklist 实施 21 项 — core(4)+state+service+selectors+composable+publicAPI+platform+bridge+preload+StorageFilter+IPCHandlers+分流集成(3点)+wiring+persistence+91 tests→build+lint+1350 tests 通过
- **S007** 对话 DP DisplayPage UX 设计 (05-26)：Wave 1 事实收集（旧系统 8 组件提取 + 新系统 display API 全量梳理）→8 项设计决策（scope/录制归口/排序/收藏/星座限制/overview 去掉/API 不改/组件原则）→组件关系图 + 文件清单确定，待新对话实施后审查

## 已确认结论

### 三页调研结果

| 页面 | Feature 覆盖度 | 核心阻塞 | 工作量 |
|------|---------------|---------|--------|
| 系统设置 | 60% (7/21项) | 串口详细参数 + 跨 feature 配置归口 | 最小 |
| 历史分析 | 30% (数据层齐全) | display 多图表 + 元数据注册表 | 中大 |
| 存储管理 | 40% (不是高速存储) | 分流机制 + Platform 文件流 + 规则模型 | 最大 |

### 共同规律

每个页面都分两步：先扩 feature 公开 API（service readiness），再做 UI 设计。

### 推荐执行顺序

1. **系统设置页**（最快出活，60% 已有，主要是 API 发现和连接）
2. **历史分析页**（display 扩展 + storage 元数据）
3. **存储管理页**（涉及 main/platform/runtime，最复杂）
4. **task-real Phase 2**（核心已实现，只差测试收尾，可穿插）
5. **Northbound 框架**（可与页面并行，框架不阻塞）

## 未决项

- 串口详细参数（dataBits/stopBits/parity）归 connection feature 还需确认具体 API
- ~~高速存储的分流机制是否需要新 feature 还是在 runtime 层解决~~ → 已决策：独立 feature + main process filter
- ~~display 多图表扩展的设计方案（单 chartSeries → 多图表实例）~~ → S004 已实施
- command-ingress 的 SCOE 配置 API 是否已暴露
- 高速存储 UI 页面（对话 F）
- connection-core.spec.ts 的 stopBits 测试失败（S002 引入）需修复

## 当前位置

S007 DisplayPage UX 设计完成，待新对话实施后回来审查。

- **H001** 对话提示词 (05-24)：8 个对话的短提示词，用户可直接粘贴开新对话
- **S005** 高速存储设计 (05-25)：对话 D 产出

- **H001** 对话提示词 (05-24)：8 个对话的短提示词，用户可直接粘贴开新对话

## 附属文件

- `S001-research-and-planning.md` — 完整调研 + agent 策略
- `S004-history-ui-design-impl.md` — 对话 C 实施记录
- `S007-display-page-ux-design.md` — 对话 DP 设计记录
- `H001-conversation-prompts.md` — 各对话短提示词
