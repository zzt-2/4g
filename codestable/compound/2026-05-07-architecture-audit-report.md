# 架构风险审计报告

> 日期：2026-05-07
> 性质：6 维度并行审计，实施前全面架构风险扫描
> 背景：9 个 feature 骨架搭建完成，runtime wiring 完成，330+ 测试通过。下一阶段是让 runtime 真正跑起来之前，先揪出已有代码的架构风险。

---

## 一、审计总览

| 维度 | Agent | 评分 | 违规 | 风险 | 建议 |
|------|-------|------|------|------|------|
| Feature 边界隔离 | 1 | A+ | 0 | 0 | 3 |
| Store 单点写入 | 2 | 85/100 | 0 | 4 | 2 |
| Runtime 职责 | 3 | 9/10 | 0 | 0 | 3 |
| Shared 层纯净性 | 4 | 基本合规 | 0 | 2 | 1 |
| Platform 边界 | 5 | 9/10 | 0 | 1 | 1 |
| 测试质量 | 6 | 良好 | 1 | 3 | 3 |

**总计：1 个违规、10 个风险、13 个建议。**

**整体结论：架构根基扎实，核心边界原则执行良好。唯一违规在测试层（非生产代码）。主要风险集中在 selector 返回值可变性和端到端测试覆盖缺失。**

---

## 二、违规项（必须修复）

### V-1：测试直接导入内部状态

- **文件**：`rewrite/src/features/task/__tests__/task-service-state-selector.spec.ts`
- **问题**：`import { createTaskState, type TaskStateContainer } from '../state/task-state'` 直接导入内部 state 模块，绕过 public API
- **风险**：内部重构时测试会不稳定，无法验证 public API 契约
- **修复方向**：通过 feature 的 public API 测试，或在 public API 中导出必要的测试辅助类型

---

## 三、风险项（建议修复）

### R-1：Display Selector 浅拷贝（风险等级：中高）

- **文件**：`rewrite/src/features/display/selectors/display-selectors.ts`
- **行号**：20, 24, 28-32, 36-40, 44
- **问题**：多处使用 `{ ...r }` 浅拷贝，如果 `TableRowProjection`、`ChartSeriesProjection`、`ScatterProjection` 内部有嵌套对象，外部可通过返回值修改原数据
- **修复方向**：检查类型定义是否有嵌套，如有则使用深拷贝或 readonly 修饰

### R-2：Storage Selector 浅拷贝（风险等级：中）

- **文件**：`rewrite/src/features/storage-local-baseline/selectors/storage-selectors.ts`
- **行号**：42-48, 62-66, 78
- **问题**：对象展开只做一层拷贝，嵌套结构可能可变
- **修复方向**：同 R-1

### R-3：Frame Selector 返回引用（风险等级：中低）

- **文件**：`rewrite/src/features/frame/selectors/frame-selectors.ts`
- **行号**：56-58, 160-171
- **问题**：`getFrames` 直接返回 `source.frames` 数组引用
- **修复方向**：返回拷贝或明确标注为只读辅助函数

### R-4：Task/Status Selector 对象展开（风险等级：低）

- **文件**：`rewrite/src/features/task/selectors/task-selectors.ts:33`
- **文件**：`rewrite/src/features/status/selectors/status-selectors.ts:26`
- **问题**：`{ ...snapshot.statistics }` 浅拷贝
- **修复方向**：检查 `TaskStatisticsSnapshot` 是否有嵌套对象

### R-5：Shared 层业务语义泄露（风险等级：低）

- **文件**：`rewrite/src/shared/condition-operators/types.ts:4-8`
- **问题**：`FieldCondition` 包含 `frameId`、`fieldId`、`sourceId` 等业务语义字段名
- **修复方向**：考虑重命名为更通用名称，或接受当前命名（因为这些类型确实用于条件匹配的跨 feature 共用场景）

### R-6：Shared 层平台类型过于具体（风险等级：低）

- **文件**：`rewrite/src/shared/platform-bridge.ts`
- **行号**：13-20, 28-34
- **问题**：`SerialPortCandidate`、`SerialConnectConfig`、`TransportBridgeEventTarget` 包含硬件/业务相关具体字段
- **修复方向**：可考虑移到 connection feature 内，shared 只保留最基础的桥接接口。但当前方案也可接受，因为 preload 和 renderer 共享这些类型是合理需求

### R-7：Platform bridge 类型断言（风险等级：低）

- **文件**：`rewrite/src/platform/index.ts:42`
- **问题**：`bridge.transport as TransportBridge` 使用类型断言，无运行时验证
- **修复方向**：添加 duck typing 验证函数，在 preload 接口变更时能在运行时检测到

### R-8：端到端测试覆盖缺失（风险等级：中）

- **已有覆盖**：
  - routing-tick.spec.ts：connection → receive → routingTick 基础链路
  - task-service-state-selector.spec.ts：task 完整生命周期
  - feature-wiring.spec.ts：feature 间连接
- **缺失链路**：
  - fake adapter → routingTick → receive → task → send → result 完整链路
  - 跨 feature 错误处理链路
  - 完整用户操作链路
- **修复方向**：下一阶段（A 组完成后）立刻补一条端到端集成测试，后续每组扩展

### R-9：测试边界不一致（风险等级：中低）

- **问题**：多个测试文件直接从内部模块导入类型（`TaskStateContainer`、settings 状态类型、display 状态类型），部分通过 public API
- **修复方向**：统一测试入口，需要的类型通过 public API 导出

### R-10：测试隔离性不足（风险等级：低）

- **问题**：大多数测试文件缺少 `beforeEach`/`afterEach` 清理钩子，依赖测试函数内部独立状态创建
- **修复方向**：当前因无共享可变状态所以风险不高，但后续添加共享状态时需注意

---

## 四、合规项确认

### Feature 边界隔离 — 完全合规

- 所有 9 个 feature 都通过 `index.ts` 导出 public API
- 0 跨 feature 内部目录 import
- 0 跨 feature store 直读写
- runtime 所有 bridge 和 wiring 都通过 public API 访问 feature
- 依赖层级清晰：L0（frame/settings/storage）→ L1（connection）→ L2（receive/send）→ L3（task）

### Store 单点写入 — 完全合规

- 10 个 feature 共 36 个写入点，全部在各自 `state/` 目录内
- 0 非业主写入
- 未使用 `$patch`、`defineStore` 等 Pinia 直操作模式
- 跨 feature 依赖仅限于只读类型和接口

### Runtime 职责 — 完全合规

- `wireFeatures`：纯依赖注入装配（L0→L3）
- `routingTick`：纯 drain→transform→emit 接线
- `destroy`：纯资源清理
- 0 业务判断逻辑、0 业务状态持有
- 4 个 bridge 文件全部为纯格式转换

### Shared 层纯净性 — 基本合规

- 0 feature 依赖、0 Vue/Pinia/Electron 依赖
- 0 模块级可变全局状态
- `TimerRegistry` 状态封装在类实例内（合规）
- `platform-bridge.ts` 基本只定义桥接接口

### Platform 边界 — 完全合规

- facade 只暴露桌面能力，0 业务语义
- 0 Node/Electron 直接导入（renderer 侧）
- `TransportFacade` 与 preload `TransportBridge` 7 个方法 100% 对齐
- SSR 保护、错误处理、单例缓存齐全

### 测试质量 — 基本合规

- 23 个测试文件、约 417 个测试用例
- Fake adapter 使用模式良好
- Mock 使用合理（仅 2 处 spyOn，无 vi.mock）
- 状态不可变性测试充分

---

## 五、优先级排序修复建议

### P0（阻塞后续开发前建议修复）

1. **R-8 端到端测试缺失**：下一阶段开始前补一条完整的跨 feature 集成测试，作为后续扩展的基础骨架
2. **V-1 测试内部导入**：修复或明确为 public API 导出

### P1（建议在后续 feature 实现时顺带修复）

3. **R-1 Display selector 浅拷贝**：display feature 实现可视化数据管道时统一修复
4. **R-2/R-3/R-4 其他 selector 浅拷贝**：在各自 feature 填肉时检查并修复

### P2（可延后）

5. **R-5/R-6 shared 层类型命名**：不影响功能，可在后续统一 review 时处理
6. **R-7 platform bridge 类型断言**：当前有 SSR 保护兜底，风险可控
7. **R-9/R-10 测试质量改进**：持续改进，不阻塞开发

---

## 六、架构健康度总评

| 维度 | 健康度 | 说明 |
|------|--------|------|
| 边界隔离 | 🟢 优秀 | 完全合规，无穿透 |
| 单点写入 | 🟢 优秀 | 36 个写入点全部归口正确 |
| Runtime 职责 | 🟢 优秀 | 纯 composition root，无越界 |
| Shared 纯净性 | 🟢 良好 | 零外部依赖，轻微类型命名问题 |
| Platform 边界 | 🟢 优秀 | 隔离完整，接口对齐 |
| 测试质量 | 🟡 良好 | 417 用例覆盖好，缺端到端 |
| Selector 不可变性 | 🟡 需关注 | 多处浅拷贝，需确认嵌套安全性 |

**总评：架构根基扎实，核心设计原则执行到位。唯一需要优先补充的是端到端集成测试，确保跨 feature 链路在后续填肉过程中不被破坏。Selector 返回值保护是最大的潜在风险点，建议在 feature 实现阶段逐个排查。**
