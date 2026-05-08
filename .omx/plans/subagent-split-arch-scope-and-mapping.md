# 子 agent 分工方案：Step 2 Architecture Scoping Memo + Step 3 Feature-to-Architecture Mapping

## Scope
- 仅提供分工与顺序建议
- 不重做仓库分析
- 目标是让主 agent 保持决策收口，子 agent 并行产出可集成材料

## Step 2：最适合并行的 2-4 个子任务

1. 现状约束抽取
- 产物：已有 spike 结论中的约束清单、已知非目标、必须兼容项、风险边界
- 推荐 agent role：`analyst`

2. 目标架构切面定义
- 产物：候选架构切面草图，例如 domain/module boundary、data flow、state ownership、integration seam
- 推荐 agent role：`architect`

3. 风险与决策点清单
- 产物：需要 memo 明确回答的关键决策、未决问题、tradeoff 表
- 推荐 agent role：`critic`

4. 验证与落地门槛整理
- 产物：后续 mapping pass 和实现阶段的验收门槛、验证路径、哪些问题必须先回答
- 推荐 agent role：`test-engineer` 或 `verifier`

## Step 3：最适合并行的 2-4 个子任务

1. Feature inventory 分桶
- 产物：按 feature / use case / flow 分组的清单，去重并标记优先级或复杂度
- 推荐 agent role：`analyst`

2. Feature -> architecture touchpoint 映射
- 产物：每类 feature 对应的模块、边界、状态、接口、数据依赖映射表
- 推荐 agent role：`architect`

3. 交叉影响与冲突扫描
- 产物：共享依赖、潜在耦合、跨 feature 冲突、需要统一抽象的热点
- 推荐 agent role：`critic`

4. 测试/验证面映射
- 产物：每类 feature 对应需要覆盖的 integration / contract / regression 面
- 推荐 agent role：`test-engineer`

## 必须由主 agent 保留的工作

- 统一 Step 2 memo 的结论口径，避免多子任务各自定义边界
- 决定哪些架构问题是“现在定”还是“留到实现期”
- 合并 Step 3 的 feature 映射结果，裁决冲突与重复抽象
- 把 Step 2 的原则强制施加到 Step 3，防止 mapping 反向改写架构范围
- 最终输出对外版本：memo 定稿、mapping pass 定稿、执行顺序

## 必须顺序依赖的步骤

1. 先完成 Step 2 的主结论收口，再进入 Step 3
- 原因：feature mapping 必须建立在已冻结的架构范围和决策边界上

2. Step 2 内部顺序
- 可先并行：约束抽取、目标架构切面定义、风险与决策点清单
- 后收口：主 agent 合并为 architecture scoping memo
- 最后补齐：验证与落地门槛，作为进入 Step 3 的 gate

3. Step 3 内部顺序
- 可先并行：feature inventory 分桶、初步 touchpoint 映射
- 后并行：交叉影响扫描、测试/验证面映射
- 最后由主 agent 收口：统一 mapping，标出必须先落地的基础能力和可延后项

## 推荐并行组织方式

- Step 2 用 3 个子 agent 最合适：`analyst` + `architect` + `critic`
- 若需要更强可执行性，再加第 4 个 `test-engineer`
- Step 3 用 3 个子 agent 最稳妥：`analyst` + `architect` + `test-engineer`
- 如果 feature 面很多、冲突多，再补第 4 个 `critic`

## 极简执行建议

- 主 agent 不下放“定边界”和“做最终裁决”
- 子 agent 负责“拉清单、做映射、列冲突、给验证面”
- 所有并行输出都应回收到主 agent 统一模板，避免多份半成品文档
