---
name: Rewrite 硬边界
description: 不可违反的架构边界约束——platform、feature、UI、shared 四大领域
type: feedback
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## Platform 边界
- renderer 不直接访问 Node/Electron/IPC/fs/path/net/serialport
- preload 只暴露 typed bridge，不暴露裸 invoke/send/on
- main 只做平台资源、生命周期、必要 buffering/backpressure，不写业务语义
- runtime 只做 composition root，不变成全局业务中心

**Why:** 旧系统 main 进程业务化、window.electron 直连是最大的维护灾难。
**How to apply:** 任何涉及 platform/main/preload/renderer 的改动必须先检查边界。

## Feature 边界
- feature 之间只通过 root public API、runtime 编排或显式事件通信
- 禁止 import feature internal state
- shared 不能变成垃圾桶；src/utils 旧代码不能天然搬进 shared
- statistics/read model 不写回 frame definition
- history/CSV/local export 不等同 report/northbound delivery
- northbound/result/report/TestReport 不能在甲方 schema/枚举/错误码未明确前冻结契约

**Why:** 旧系统 shared/common 边界不清导致逻辑四处散落。
**How to apply:** 每次 cross-feature 引用必须走 public API，shared 新增必须论证必要性。

## UI 边界
- rewrite UI 不允许写死颜色/间距/圆角/阴影/字体等视觉 token
- 视觉 token 必须归口到 rewrite/src/css SCSS token / Quasar token
- UnoCSS 只做最小结构 utility，不承载业务视觉样式
- UI 实现前必须引用 rewrite-ui-style-baseline.md

**Why:** 避免 UI 代码中散落大量硬编码值导致后续主题和统一修改困难。
**How to apply:** 每次 UI 相关改动必须静态扫描 hardcoded hex/rgb/hsl 和 raw visual px/rem/em。

## 节奏边界
- 真实 serial/TCP/UDP、SCOE、高速存储、report/northbound 必须单独设计和验证
- 不要提前混进普通 feature 实现
- 不运行 build 除非明确要求或本轮改动涉及 build/style/platform/packaging
