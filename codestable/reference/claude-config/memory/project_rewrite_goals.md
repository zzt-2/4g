---
name: Rewrite 目标与方法论
description: 东方红上位机 rewrite 的目标、方法论、当前阶段和下一步
type: project
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## 为什么要 rewrite
旧系统功能能用但难以维护：跨 store 写入、window.electron 直连、main 进程业务化、高频数据逐包推送、src/utils 混入大量业务逻辑和重复工具、shared/common 边界不清。

目标不是整理旧代码，而是保留旧系统可观测业务行为和页面入口，但不继承旧代码组织、旧全局状态、旧 IPC 暴露方式、旧 main 业务逻辑。

## Rewrite 方法论
1. 先锁架构边界
2. 再做 feature design/checklist
3. 用小实现验证分层是否顺手
4. 通过后多条窄线并行提速
5. 每一轮明确 Direct contract / Boundary guards / Verify evidence / Open issues
6. 无真实验证证据，不宣称硬件/打包/客户/northbound 闭环完成

**Why:** 之前的代码经验表明不锁边界就写代码会重蹈旧系统覆辙。
**How to apply:** 每个新 feature 或新阶段必须先过边界检查，不能跳过设计直接实现。

## 当前阶段
- 已过最初校准期，可以提速
- 7 个 feature 完成小闭环：frame/settings/storage-local-baseline/connection/receive/status/display
- 下一步：交叉审查 → 决定 connection real bridge 或 send/task design
- UI 只做了 thin wiring + style baseline，大批 UI 等逻辑和 public API 稳定后

## 已完成但 not started / do not start without design
- send / task / SCOE / result/report/northbound / 真实 serial/TCP/UDP / 高速存储 / full UI / TestReport/HTTP/FTP
