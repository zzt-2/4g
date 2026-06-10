# UI 与 Feature Bug 集中修复

> 状态: active | 创建: 2026-06-10 | 最后更新: 2026-06-10 H001

## 进展线索

- **H001** Bug 修复对话提示词 (06-10)：3 个已知 bug（发送帧状态丢失、UDP 发送失败、IP 显示错误）的根因分析和修复提示词，用户会追加更多 bug

## 已确认结论

### Bug 根因分析

| Bug | 根因位置 | 类型 |
|-----|---------|------|
| 发送帧页面导航后状态丢失 | `use-send-instances.ts` 组件局部 ref + 无 keep-alive + persistence stub | UI 状态管理 |
| UDP 发不出去 | remoteHost/remotePort optional，adapter 双重拦截返回 write-failed | 适配器逻辑 + UX |
| 输出口显示本机 IP | `lifecycle.ts` routeLabelForConfig UDP 回退显示 localHost | 显示逻辑 |

## 未决项

- 发送帧状态丢失的修复方案待确认（Pinia / keep-alive / 持久化三选一）
- UDP 问题修 UI 校验还是修错误反馈待确认
- 用户会追加更多 bug

## 当前位置

H001 提示词已准备，待用户开新对话修复。
