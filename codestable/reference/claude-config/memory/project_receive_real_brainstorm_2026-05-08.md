---
name: receive-real brainstorm 结论 2026-05-08
description: receive-real feature brainstorm 的决策、拆分方案和留空项
type: project
originSessionId: e862ac7f-002e-4774-be02-f21228e9240f
---
# receive-real Brainstorm 结论 (2026-05-08)

## 核心管线

```
refreshFrameReferences → 预编译表达式 Map<frameId, CompiledGroup>
ingestBatch → 帧匹配 → 字段解析(raw+factor) → 表达式求值(独立pass) → 更新read model → 产出Outcome
routingTick → drainInputSource → 预算截断 → 扇出(display/storage/task/unmatched)
```

## 已锁定决策

| # | 决策 | 结论 | 依据 |
|---|---|---|---|
| D1 | 表达式求值位置 | 独立阶段(field-parser后) | 需要跨帧参数+全局参数，field-parser不该知道 |
| D2 | read model owner | receive持有 | 表达式闭环需要跨帧参数 |
| D3 | 扇出模型 | runtime/bridge分发 | receive不感知消费者 |
| D4 | 背压 | routingTick预算截断+各feature独立节流 | 多层协作 |
| D5 | 星座图通道 | 不需要特殊通道 | bytes解析+display侧I/Q提取 |

## 拆分：2个子feature

1. **receive-real-pipeline**: 完整管线(匹配→解析→表达式→read model→扇出)。1个design，checklist分阶段。
2. **receive-real-highspeed**(推迟): 背压压测、星座图吞吐、高速存储短路。

## 不做/推迟

- 星座图I/Q提取归display feature
- 高速存储短路需runtime边界例外登记
- 全局参数schema归settings/runtime，receive只消费VariableMap
- 未匹配帧完整记录(统计计数足够)

## 留空项(已校验，有具体建议)

1. **全局参数来源**: 按key分归属。时间类receive从Date.now()算，通信统计receive内部计数器，帧匹配统计receive内部，位置类settings持有。receive在表达式求值前从各selector收集构造VariableMap，不定义全局参数schema。
2. **display/storage节流**: display由routingTick频率控制(默认1000ms)，storage按批次聚合写入(按时间窗口或记录数阈值)。receive只管产出Outcome不等待消费方。各自feature的节流策略由各自design定义。
3. **routingTick预算N值**: 初始N=50，硬编码常量，后续压测后可配置化。依据：串口115200bps约115帧/秒，N=50单tick阻塞<5ms。
4. **高速存储短路**: pipeline阶段走标准路径不短路，highspeed阶段视压测结果登记边界例外。旧系统main侧做帧头匹配+跳过renderer，新系统main红线禁止业务逻辑，短路方案必须是main只做字节前缀匹配+文件写入+轻量通知renderer。

## 关键事实

- 表达式引擎已在编译阶段做依赖排序(Kahn算法)，运行时只需evaluateGroup
- 变量来源4种: CURRENT_FIELD(同帧)/FRAME_FIELD(跨帧)/GLOBAL_STAT/SCOE_DATA
- I/Q字段是bytes类型，bitWidth/sampleCount是运行时UI配置
- display已有ingestSourceMaterial API，storage已有appendLocalRecords API
- receive→task bridge已完成
- SCOE入站bypass receive(边界例外)

## Why: receive-real是最复杂feature，brainstorm定方案后进入cs-roadmap或cs-feat-design
## How to apply: 后续对话做receive-real design/impl时，先读此memory作为直接合同输入
