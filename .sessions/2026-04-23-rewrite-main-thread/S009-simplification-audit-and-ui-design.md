# [S009] 简化审计 + UI 架构 + 页面设计

> 2026-05-12 | 转折阶段 | 已完成

## 目标

从后端 service 层全面转向前端 UI 的关键转折日。同步推进四条工作线：代码简化审计、前端规范定稿、全局 UI 架构与页面设计、简化实施。同时完成跨 feature 身份标识审计、Platform File Facade、UnoCSS 间距迁移等基础设施准备。

## 记录

### 一、代码简化审计

**对话**: 95680e4b（审计编排）

10 agent 三批审计覆盖 5 个 feature（frame / connection / send / task / command-ingress），逐文件评估层间增值，产出 `codestable/quality/code-simplification-audit.md`。

**关键发现**：

1. **Clone 函数极严重重复**：4 个 feature 各自独立实现手动 clone，合计约 400 行。核心语义差异在于 conditional spread 会省略 undefined key，而 structuredClone 会保留，不能无脑替换。
2. **Selector 层大面积死 surface**：send selector 100% 纯透传（可删），connection selector 约 90% 纯透传（可删），task selector 约 60% 简单查询（可合并到 state）。frame selector 有真实投影逻辑（保留）。
3. **Validation 重复**：frame 的 3 个验证文件各自定义了 createIssue / toResult / isOneOf / hasText，可提取公共辅助函数。
4. **command-ingress 零消费方代码**：northbound-protocol-adapter（14 行）和 selectors（83 行）无外部消费，可直接删除。

**分级结论**：

| 优先级 | 建议 | 预估节省 |
|--------|------|---------|
| HIGH | send/task clone 用 structuredClone 替代 | ~163 行 |
| HIGH | send/task selector 删除或合并到 state | ~78 行 |
| MEDIUM | frame validation 辅助函数提取 | ~100 行 |
| MEDIUM | connection clone 逐函数确认后替代 | ~126 行 |
| LOW | command-ingress 死 surface 清理 | ~97 行 |

### 二、前端规范定稿

**对话**: 819c5d57

从参考项目 `refactor/docs/quality/frontend.md` 和 `refactor/docs/conventions/frontend.md` 提取适用于 rewrite 的规范，适配技术栈差异（shadcn-vue + TailwindCSS → Quasar + UnoCSS + SCSS tokens），产出 `codestable/quality/rewrite-frontend-conventions.md`。

**规范结构**（10 章、26 条规则）：

- T1-T8 表格设计：QTable/QVirtualScroll 选型、列宽、排序、分页、空状态、loading、选中态
- F1-F5 表单设计：QForm + Quasar 组件、校验、错误提示、禁用态、防重复提交
- L1-L5 页面布局：三段式结构、间距 token、侧边栏、弹窗宽度语义 class
- Q1-Q5 Quasar 组件使用：选型映射、颜色 prop、Dialog/Notify plugin、禁止 CSS 覆盖 prop
- S1-S3 间距与响应式：UnoCSS spacing scale、桌面不做移动端适配
- C1-C3 颜色与状态色：semantic-colors token、状态色固定映射
- D1-D6 数据展示：数字/时间格式化、状态 badge、空值、单位、截断 + tooltip

**性能专项扫描**（3 个子 agent 并行）：

- 旧系统性能反模式：高频数据直接驱动 UI（串口每包触发 Vue 响应式更新）、deep watch 大对象、computed 处理大量数据、全局 store 持有大量运行时数据、500ms/1s 定时器 DOM 更新
- Quasar/Vue3/Electron 最佳实践：QTable 性能、大表单优化、Electron UI 特有问题
- rewrite 现有 UI 代码：无硬编码视觉值、无响应式反模式

**技术栈适配要点**：排除了 SSR/移动端/SEO/auto-import 等不适用规则，与 CLAUDE.md 样式规则无冲突。

### 三、跨 Feature 身份标识审计

**对话**: 3d174b27（逐 feature 审计）、29aae6c4（跨 feature 统一讨论）

18 agent 三批审计（9 逐 feature + 5 跨 feature 映射 + 4 综合分析），产出 `codestable/features/rewrite-display/display-identity-brainstorm.md`。

**审计结论**：

| Feature | 标识模型 | 与 frame 对齐 |
|---------|---------|-------------|
| frame | frameId + fieldId | 基准源头 |
| receive | 直接透传 frameId + fieldId | 干净 |
| send | 直接透传 frameId + fieldId | 干净 |
| display | groupId + dataItemId | **需改**（纯重命名） |
| status | groupId + dataItemId | **需改**（与 display 同源） |
| storage | channel + field.key | 有意独立（按连接源分组 + 人可读 key） |
| task | taskId + stepId | 独立概念，无冲突 |
| connection | connectionId | 独立概念，无冲突 |
| command-ingress | 纯消费方，引用外部标识 | 无独立标识 |

**推荐方案 C（部分统一）**：

- Display + Status：groupId → frameId，dataItemId → fieldId（消除无理由重命名，影响 13 个文件）
- Storage：保持 channel + key 不变（不同的抽象维度，有语义理由）
- 两种标识模型并存：定义标识（frameId + fieldId）和存储标识（channel + key）
- 实施时机：现在（零用户数据、零迁移成本）

Bridge 不全删（仍做过滤和结构裁剪，12 字段 → 6 字段），只是去掉无语义的重命名。projection.ts 中 ChartSeriesProjection.fieldId（复合键）与 DisplayFieldMaterial.fieldId（原始 ID）同名但语义不同，建议参数名改为 compositeKey 消除歧义。

### 四、全局 UI 架构设计

**对话**: 83539898（brainstorm）、5823d8c5（design）

20+ agent 四批编排，完成 brainstorm 和 design 两阶段。产出 `codestable/features/rewrite-ui-architecture/rewrite-ui-architecture-brainstorm.md` 和 `rewrite-ui-architecture-design.md`。

**六大设计决策（D1-D6）**：

| 决策 | 方案 | 关键参数 |
|------|------|---------|
| D1 导航体系 | 二级折叠侧边栏 + 顶部连接选择器 + 面包屑 | QDrawer 232px，mini 状态 localStorage 持久化 |
| D2 布局骨架 | 3 种标准模式：A 主从双栏 / B 三栏固定+弹性 / C 单栏居中 | 模式 B 左 240px 右 300px，模式 C max-width 1120px |
| D3 共享 Widget | 6 个跨页面 Widget：DataTable(P0)、StatusBadge/TableToolbar/SendTargetSelector/FrameSelector(P1)、ChartWidget(P2) | 不提前建 FormBuilder/ConfirmDialog/FormDialog |
| D4 实时数据展示 | rAF + cadenceMs 节流 + shallowRef 整组替换 | 默认 200ms、快速 100ms、后台暂停 |
| D5 暗色模式 | 只做暗色（默认唯一主题），不实施双主题切换 | surface 改深灰/深蓝灰，text 改浅色，brand 不变 |
| D6 路由表 | 11 个路由覆盖旧系统 10 个入口 | / → 运行总览，/frames/send → 帧发送，/tasks → 任务管理 |

**旧行为覆盖度**：旧系统 10 个页面入口全部有对应路由，无遗漏。

### 五、页面设计

**对话**: b81f7de9（Visualization）、f74a2091（Task+Send+Command brainstorm）、520c81ff（Frame+Connection design）、60b503be（Task+Send+Command design）

四组页面设计覆盖全部 6 个业务页面域。

**Visualization 页面**（b81f7de9）：
- brainstorm + design 两阶段，17 agent 四批编排
- 发现新系统没有 visualization feature，而是已有完整 display feature（core/service/selector 层齐全，291 行测试），缺 UI 层
- 旧系统性能问题：双面板布局 + 3 种显示模式 + 多层定时器嵌套 + 星座图无数据上限
- 设计方案：双面板（参数表左 + 图表右）、ECharts 图表、rAF + cadenceMs 节流、虚拟滚动 100+ 参数

**Frame + Connection 页面**（520c81ff）：
- 帧定义列表、帧定义编辑、连接管理 3 个页面
- 帧列表用模式 A（主从双栏），帧编辑用模式 C（单栏居中 1120px），连接管理用模式 A
- 10 agent 三批：事实收集 → 逐页面设计 → 交互一致性 + 规范合规 + 过度设计审查
- 产出 `pages-frame-connection-brainstorm.md` + `pages-frame-connection-design.md`

**Task + Send + Command 页面**（f74a2091 brainstorm → 60b503be design）：
- 12 agent 三批 brainstorm → design
- 发送页用模式 B（三栏：格式选择 240px + 实例表 + 预览 300px）
- 任务页用模式 A（主从双栏，左侧任务列表 Tab 活动/历史 + 右侧编辑器/监控）
- 指令接入页 3 个 Tab（SCOE 运行与测试 / SCOE 配置 / 中心对接）
- 跨页面共享 3 个组件：useJsonPersistence composable、TaskExecutionDetail widget、FieldEditWidget
- **B2 design 审查判定 REVISE**：前端规范违规 6 项（弹窗宽度未指定、7+ 表格没列规格表、没空状态/loading、任务编辑器没校验规则、裸颜色名），任务编辑器 360px 固定宽度塞不下，CommandIngressState 混入配置编辑数据。修订后通过。
- 产出 `pages-task-send-command-brainstorm.md` + `pages-task-send-command-design.md` + checklist.yaml

**result-report brainstorm**（489c9f87）：
- 确认三层分离硬约束：result（结果事实）→ report（报告生成）→ northbound（外部交付）
- result 只消费 TaskInstanceCompletion 事件，手动操作通过 task 包装解决
- report 依赖 storage（素材收集可能需要 receive-real），但 result 核心不依赖
- 不把旧 history/CSV 直接等同 TestReport

### 六、简化实施

**Frame + Connection 简化**（b8d68cad，对话 14）：

Frame（先改，被 Connection 消费）：
- F-S1：提取 validation 辅助函数到 validation-utils.ts，三个原文件改为 import
- F-S2：legacy.ts（31 行）合并到 legacy-normalizers.ts，删除原文件
- F-R1：frame-asset-service.ts 新增 upsertFrame / removeFrame 委托方法

Connection（后改）：
- C-S1：clone.ts 保留不删（16 处 conditional spread 保护真正的 optional 字段，逐函数确认后不改）
- C-S2：selectors 目录删除，有逻辑的 3 个 selector（toSummary / matchesTarget / reconnectStatus）内联到 service 的 createConnectionReader
- C-R2：原子化 connect（先 adapter.connect → 成功后 upsertConfig，失败不留幽灵 config）
- C-R3：新增 discoverResources（adapter 可选方法）
- C-R4：BaseTransportConfig 新增 autoConnect?: boolean

**Send + Task 简化**（95680e4b 对话 11 → ba47853b 对话 15）：

Send 改动（对话 11）：
- S-S1：clone.ts 用 JSON.parse(JSON.stringify()) 替代，删除文件
- S-S2：validation.ts（3 个 if 检查）内联到 send-service.ts，删除文件
- S-S3：selectors/ 删除，createSendReader 改为直接从 state 取值 + spread
- S-R1：新增 SendFrameInstance 类型（UI 消费）
- S-R2：feature index.ts re-export 核心纯函数（buildFrame, resolveFieldValues, applyFactor 等）
- S-R3：新增 evaluateFieldPreview（frame + userFieldValues → 单字段预览值）

Task 改动（对话 11 + 15）：
- T-S1：clone.ts 用 structuredClone 替代，独立 cloneSendResultRef 不引入 task → send clone 依赖
- T-S2：selectors 合并到 state，selectActiveInstances 搬到 state
- T-R1~R5：新增 validateTaskDefinition、step builders、selectActiveInstances、TaskService.retryTask/stopAll、serializeTaskDefinition/deserializeTaskDefinition

**测试修复**（对话 15）：
- 修复 66 个测试失败（stash pop 冲突导致部分改动丢失）
- send-checksum-patch 18 个：恢复 applyBuildPostPatch 和 checksumCrc32 导出
- task-condition-system 24 个：ConditionMatchInput API 签名对齐
- send-integration 10 个：send-service 重写后使用 core/frame-resolver 完整版
- Known gaps（不在本轮修）：connection-reconnect 7 个、bootstrap 1 个

### 七、Platform File Facade

**对话**: 7dbd2baa

新增 `rewrite/src/platform/files.ts`，提供 renderer 侧文件读写和对话框能力的 typed facade。

实现链路：
- `platform/files.ts`：FileFacade 接口 + createFileFacade 工厂
- `shared/platform-bridge.ts`：新增 FileBridge 类型，RewritePlatformBridge 增加 file 属性
- `src-electron/preload/index.ts`：FileBridge IPC 实现
- `src-electron/main/file-handlers.ts`：4 个 IPC handler（readTextFile / writeTextFile / showSaveDialog / showOpenDialog）

中途被另一个对话的 bridge-types 搬迁冲掉 import 路径，补回 5 处修复后 build 通过。

### 八、UnoCSS 间距迁移

**对话**: 1f252873

将 rewrite 中现有组件的间距和结构性布局属性从 SCSS `var(--rw-space-*)` 和内联 `display:flex/grid` 迁移到 UnoCSS utility class。

**迁移范围**：
- `uno.config.ts`：添加 theme.spacing.page / page-compact 语义映射
- `app.scss`：移除全部 `--rw-space-*` CSS 变量注册
- `HomePage.vue`：spacing + structural layout 迁到 UnoCSS
- `SummaryMetricGrid.vue`：同上
- `AppNavigation.vue`：spacing 迁到 UnoCSS
- `_base.scss`：`margin: var(--rw-space-0)` → `margin: 0`

**关键教训**：初始任务标题"间距迁移"导致只做了 spacing token 替换，漏了 display/flex/grid/align/justify 等 CLAUDE.md 明确归 UnoCSS 管的结构性属性。补充了规则：涉及 `<style>` 改动时，逐条声明对照职责划分审查，不限于任务提到的属性。

同步更新了 `rewrite-frontend-conventions.md`：L1 从 SCSS token 引用改为 UnoCSS class，头部交叉引用加上 UnoCSS 结构性布局职责划分说明。

**验证**：build 成功，lint 零错误，815/816 tests passed（1 个超时是既有问题）。

### 九、对话密度统计

15 个对话按工作线分布：

| 工作线 | 对话数 | 总大小 | 子 agent 数 |
|--------|--------|--------|------------|
| 前端规范 + 性能审计 | 1 | 836K | ~10 |
| 身份标识审计 + 统一 | 2 | 1.9M | ~28 |
| 全局 UI 架构（brainstorm + design） | 2 | 1.2M | ~35 |
| 页面设计（4 组） | 4 | 6.4M | ~50+ |
| result-report brainstorm | 1 | 760K | ~4 |
| 简化实施（Frame/Conn + Send/Task + 测试修复） | 3 | 4.6M | ~6 |
| Platform File Facade | 1 | 448K | 0 |
| UnoCSS 间距迁移 | 1 | 492K | 0 |

全天子 agent 调用约 130+ 个，是至今 agent 密度最高的一天。

## 后续

1. 05-13 续接后进入 UI 实施阶段：Wave 0-4 代码准备 → 6 页面一次性实现（详见 S011）
2. 身份标识统一方案 C 待确认后实施（影响 13 个文件，零迁移成本）
3. result-report brainstorm 结论待用户确认后再进入 design
4. Send/Task 简化收尾：S-S1~S-S3 和 T-S1~T-S2 已在后续对话完成，S006 暂存状态已解除
5. 已知测试缺口：connection-reconnect 7 个、bootstrap 1 个（非阻断）
