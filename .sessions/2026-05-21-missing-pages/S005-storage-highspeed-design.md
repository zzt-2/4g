# [S005] 存储管理 — 高速存储 feature 设计

> 2026-05-25 | 设计 | 完成

## 目标

对话 D 执行：设计高速存储三层架构（规则模型 + 分流机制 + Platform 文件流），产出设计文档 + checklist，不写代码。

## 记录

### Direct contract

- S001 §存储管理关键发现 + §存储管理补充
- Boundary guards: R5 + R6 + CLAUDE.md main 不承载业务逻辑

### Wave 1 事实收集（9 agent）

**Batch 1（旧系统）：**
- D1: 旧系统单规则(1条 FrameHeaderRule)，config 含 enabled/rule/maxFileSize/enableRotation/rotationCount，状态 5 态(disabled→enabled→active)
- D2: main process WriteStream 追加写入，文件轮转(size-based)，hex string 格式，规则热更新
- D3: 网络分流短路 — networkHandlers:505-517 shouldStore→storeData→return

**Batch 2（新系统）：**
- D4: connection drainAdapterEvents() 是唯一数据汇聚点，CompositeAdapter 路由 serial/network
- D5: Platform 缺 createWriteStream/checkFileSize/ensureDir/listFiles/deleteFile
- D6: storage-local-baseline 是 JSON 持久化 + Material bucket，类型可复用，持久化层完全不同

**Batch 3（约束）：**
- D7: 5 层结构，feature ownership，Electron 边界规则
- D8: R5 允许 main 做高频数据缓冲/分流，R6 要求粗粒度 IPC；旧系统在 main 做帧匹配是 R5 边界例外
- D9: 16 项行为基线 — 6 项 baseline 已覆盖，6 项需本 feature(STO-009~014)，4 项部分覆盖

### Wave 2 设计（9 项决策）

| 决策 | 内容 |
|------|------|
| AD1 | 新建 `features/storage-highspeed/`，不扩 storage-local-baseline |
| AD2 | 匹配在 main（分流需在 IPC 前），规则管理在 renderer（注册为 runtime 边界例外） |
| AD3 | 分流插入点在 transport handler 内、event buffer 前 |
| AD4 | 粗粒度 Platform API（activateFilter/deactivateFilter/getStats/resetStats/updateConfig） |
| AD5 | 文件格式同旧系统（hex per line） |
| AD6 | 统计在 main，renderer 1s 轮询 |
| AD7 | 配置单源真理在 renderer，main 只接收 compiled active rules |
| AD8 | 单规则 + 多 headerPattern（与旧系统一致） |
| AD9 | routing-tick 无改动 |

### Wave 3 自检（3 agent）

**SC1 架构+过度设计：**
- 有效发现：分流短路需注册边界例外 → 已修正
- 误判：声称 feature 应放 storage 子目录（实际独立 feature 合理）、声称 R5 违反（R5 允许分流）

**SC2 质量+精简：**
- 有效发现：adapter 层过度抽象 → 已去掉，service 直接调 facade；reader 多余 → 已去掉
- 有效发现：D8 多规则无证据 → 改为单规则+多 pattern
- 误判：声称与 receive/frame-matcher.ts 重复（实际不同层次不同用途）

**SC3 覆盖度：**
- STO-009~014 全部覆盖
- STO-003/015/016 显式 deferred，有理由和预计时机

### 产出

- `codestable/features/rewrite-storage-highspeed/rewrite-storage-highspeed-design.md`
- `codestable/features/rewrite-storage-highspeed/rewrite-storage-highspeed-checklist.yaml`（21 项）

## 后续

- 对话 E：按 checklist 实施（需先确认 platform 扩展方案）
- 对话 F：UI 设计实施（前置对话 E 完成）
