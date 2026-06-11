---
name: 新对话必读文档分层索引
description: 所有新对话启动时的文档读取顺序，按场景分层
type: reference
originSessionId: fedf307e-5b34-4f76-a3c2-e62664096c65
---
## 必读（所有对话）
- AGENTS.md
- .sessions/rewrite-claude-handoff/2026-05-06-rewrite-handoff.md
- codestable/compound/2026-04-28-rewrite-execution-charter.md
- codestable/architecture/rewrite-target-structure.md
- codestable/quality/rewrite-quality-rules.md
- codestable/quality/rewrite-review-checklist.md

## 判断 rewrite 进度时加读
- codestable/quality/rewrite-validation-fixture-oracle-baseline.md
- codestable/architecture/rewrite-system-architecture.md
- codestable/architecture/rewrite-feature-boundaries.md
- codestable/architecture/rewrite-feature-interaction-matrix.md

## 继续当前下一步时加读
- codestable/features/rewrite-receive/rewrite-receive-design.md
- codestable/features/rewrite-status/rewrite-status-design.md
- codestable/features/rewrite-display/rewrite-display-design.md
- codestable/features/rewrite-connection/rewrite-connection-design.md
- codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md

## 涉及 UI 时必须读
- codestable/architecture/rewrite-ui-style-baseline.md
- codestable/architecture/rewrite-thin-ui-runtime-wiring.md

## 涉及 Electron/平台/串口/TCP/UDP 时必须读
- codestable/architecture/rewrite-platform-api-surface-reduction.md
- codestable/architecture/rewrite-connection-transport-boundary.md
- codestable/architecture/rewrite-connection-platform-bridge.md
- codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md

## 涉及 northbound/report/TestReport/HTTP/FTP 时必须读
- codestable/compound/2026-04-28-northbound-overlap-and-gap-map.md

## 一句话版
所有新对话先读 AGENTS + handoff + target structure + quality rules/checklist；做具体 feature 时再加对应 feature design/checklist。
