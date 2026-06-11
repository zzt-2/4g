# UI 与 Feature Bug 集中修复

> 状态: active | 创建: 2026-06-10 | 最后更新: 2026-06-11 S001 帧迁移+表达式修复

## 进展线索

- **S001** 帧迁移 + 表达式修复 (06-10 ~ 06-11)：3 agent 调查串口/网口/northbound 状态（全部已实现），3 agent 调查 3 个 send bug 根因，写帧迁移脚本+删 legacy 代码+修表达式引擎
- **H001** Bug 修复对话提示词 (06-10)：3 个已知 bug 的根因分析和修复提示词

## 已确认结论

### Bug 根因分析

| Bug | 根因位置 | 类型 |
|-----|---------|------|
| 发送帧页面导航后状态丢失 | `use-send-instances.ts` 组件局部 ref + 无 keep-alive + persistence stub | UI 状态管理 |
| UDP 发不出去 | remoteHost/remotePort optional，adapter 双重拦截返回 write-failed | 适配器逻辑 + UX |
| 输出口显示本机 IP | `lifecycle.ts` routeLabelForConfig UDP 回退显示 localHost | 显示逻辑 |
| 帧发送页面更多问题 | 用户反馈"一大堆问题"，待后续专门对话修 | 待调查 |

### 帧迁移完成

- `scripts/migrate-frames.mjs` 转换 27 个旧帧定义到新格式
- 删除 `legacy-normalizers.ts` 及所有引用（6 个文件）
- 3 个 SCOE 帧移除（旧 SCOE 走 command-ingress），剩余 24 帧
- 输出：`public/data/templates/frames-v2.json`

### 表达式引擎修复

- 变量标识符正则改为 Unicode `\p{L}`，支持中文变量名
- `extractExpressionIdentifiers` 改用 tokenizer 输出（不再误匹配字符串内容中的标识符）
- 修复了 `'RS编码'` 被误报为"未定义变量 RS"的问题

### 实现状态确认

| 模块 | 状态 | 测试 |
|------|------|------|
| 串口 (serial) | 完整实现，serialport v13 | 47 tests passed |
| 网口 (TCP/UDP) | 完整实现，Node net/dgram | 同上 |
| Northbound | 12 入站 + 9 出站 + JWT + FTP | 86 tests passed |

## 未决项

- 发送帧状态丢失的修复方案待确认（Pinia / keep-alive / 持久化三选一）
- UDP 问题修 UI 校验还是修错误反馈待确认
- 帧发送页面"一大堆问题"待用户补充，将纳入 H001 修复对话
- `frames-v2.json` 需要接入应用启动自动初始化逻辑
- 帧发送功能整体的 UI/UX 需要系统性审查

## 当前位置

S001 帧迁移和表达式修复已完成。用户准备压缩上下文后继续作为全局指挥规划下一步。
