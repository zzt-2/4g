# Handoff Verification Sections

写 handoff 时添加这些段落（Trigger 4），收 handoff 时执行这些检查（Trigger 5）。

## 段落 1：接收方验证清单（所有 handoff 必须包含）

```markdown
## 接收方验证（续接对话时必须完成）

- [ ] 已读取 topic-index 的不变量段落
- [ ] 已验证本文件中的至少 3 条关键事实声称
  - 声称1：[内容] → 验证结果：[PASS/FAIL + 证据]
  - 声称2：[内容] → 验证结果：[PASS/FAIL + 证据]
  - 声称3：[内容] → 验证结果：[PASS/FAIL + 证据]
- [ ] 已检查 _registry.yaml 中本专题的 depends_on 和 conflicts_with
- [ ] 已确认当前范围未违反"明确不含"
```

## 段落 2：接口变更清单（handoff 涉及代码改动时）

```markdown
## 接口变更

```yaml
contracts:
  - id: C001
    type: interface-change
    description: "..."
    location: "..."
    change: "..."
    consumed_by: "..."
    verification_result: null
    verified_by: null
```

完整格式见 [contract-schema.yaml](contract-schema.yaml)。

## 段落 3：失败数据附录（handoff 提及路线失败时）

```markdown
## 失败数据附录

### [方案名称]
- 核心失败机制：[...]
- 具体数据：[原文 vs 产出对比、丢失项列表等]
- 已排除方向：[...]
- 可复用部分：[...]
```

不能只写"失败了"。必须传递具体失败数据，让接收方判断新方案是否能避免同类问题。

## 段落 4：已知债务声明（原则与现实有差距时）

```markdown
## 已知债务

| 债务 | 原则 | 当前状态 | 触发解决条件 |
|------|------|---------|-------------|
| [债务描述] | [应达到的标准] | [实际状态] | [什么条件下必须解决] |
```

已知债务不是"未决问题"——它是"已确定的标准目前未达到"的状态。必须声明触发解决条件，避免债务在多个 handoff 中被原样传递而不解决。

## 段落 5：验证阈值契约（handoff 涉及验证体系时）

```markdown
## 验证阈值

| 验证项 | PASS 标准 | 阈值来源 | 历史通过率 |
|--------|----------|---------|-----------|
| [验证项名] | [精确的 PASS 条件] | [人工/推导/标准] | [历史数据] |
```

每个验证项的 PASS/FAIL 必须有量化标准。不能用"看起来不错"、"基本通过"。

## 接收方执行流程

收到 handoff 后，按以下顺序执行：

1. 读 topic-index 的不变量段落 → 确认理解
2. 读 registry 的 depends_on / conflicts_with → 确认依赖状态
3. 识别 handoff 中的至少 3 条事实声称 → 逐条验证
4. 检查接口变更是否已在代码中体现
5. 检查并行产出的依赖关系是否有遗漏
6. 将验证结果写回 handoff 的验证清单
7. 任何 FAIL → 阻断并报告用户
