# Voice — Checksum SUM32/SUM16 Feature 实施

> 用户/导师原话档案，按日期。除零信息推进/应答外都收，不去重。

## 2026-06-19

- "显式优于隐式" → D001
- "不要改 checksum.ts 的算法实现（sum32 等是对的）"
- "不要碰 identifierRules / 帧匹配（那是另一个问题）"
- "改完跑测试，418 个 send 测试必须还全过"
- "两种方案对比一下告诉我"（指 JSON 直改 vs send-service 兜底）→ D001排除B方案
- "如果 JSON 改不了（比如是导入的），再考虑兜底逻辑"
