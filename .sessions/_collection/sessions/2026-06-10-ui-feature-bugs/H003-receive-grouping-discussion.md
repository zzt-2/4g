# 接收帧分组管理设计决策

> 来源: S001 全局指挥对话 | 2026-06-11 | 讨论 | 已锁定

## 目标

确认新系统接收帧分组管理的范围、归属、数据结构和 UI 方案。

## 事实基础

### 新系统现状

- `receive-display-bridge.ts` 硬编码 `groupId = frameId`，每帧字段自然形成一组
- `DisplayService` 无分组 CRUD，groups 从 `DisplayFieldMaterial` 中 emergent 提取
- `DisplayPage.vue` 遍历 table1Rows + table2Rows 收集 distinct groupId 排序后给 QSelect
- `DisplayPreferences` 已有 `selectedGroupId`、`selectedItems`

### 旧系统参考（不复制）

- `DataGroup` 承载了过多职责（isVisible/isFavorite/dataType/label/expression）
- `FrameFieldMapping` 是 M:N 映射（一帧字段可分散到多分组）
- 新系统已有归口替代：isVisible→Preferences, 表达式→shared/引擎, 数据类型→frame field 定义

## 设计决策

### 1. 粒度：帧级映射 + 每帧可见字段选择

- 只管"帧→分组"映射，不引入 DataItem 级别配置
- 每帧可勾选哪些字段显示在分组中
- 默认不显示，显式勾选才显示

### 2. 归属：display feature

- 分组是展示组织概念，不影响 receive 解析逻辑
- groupId 已在 display 类型体系中
- 映射关系在 display preferences 中管理，bridge 消费映射结果

### 3. UI 形式：弹窗

- `rw-dialog-lg`（720px）
- 从 DisplayPanel 分组下拉旁的设置图标按钮触发
- 遵守 QDialog 规范：v-model + @hide 清理

### 4. 操作集

| 操作 | 说明 |
|------|------|
| 创建分组 | 输入名称，生成 groupId |
| 删除分组 | 有映射帧时二次确认 |
| 重命名 | 改 label |
| 分配帧到分组 | 选择帧，勾选可见字段 |
| 移除帧 | 从分组中移除帧 |
| 排序 | 分组显示顺序 |
| 勾选可见字段 | 每帧独立控制，默认空 |

### 5. 帧与分组关系：一帧一分组

- 一个分组可含多帧
- 一帧只属于一个分组（或"未分组"）
- 不做 M:N（一帧字段分散到多分组），避免 UI 复杂度

### 6. 数据结构

```typescript
interface DisplayGroupFrameEntry {
  readonly frameId: string;
  readonly visibleFieldIds: readonly string[];  // 空 = 不显示该帧任何字段
}

interface DisplayGroupConfig {
  readonly id: string;
  readonly label: string;
  readonly frames: readonly DisplayGroupFrameEntry[];
}
```

扩展 `DisplayPreferences`：

```typescript
interface DisplayPreferences {
  // ...existing fields...
  readonly groups: readonly DisplayGroupConfig[];
}
```

### 7. 持久化

扩展 `DisplayPreferences`，随 preferences 一起持久化。复用已有 `updatePreferences()` 方法。

### 8. Bridge 改动

`receive-display-bridge.ts` 的 `fanOutToDisplay` 逻辑改为：

1. 收到 `(frameId, fieldId, value)` → 查 groups 找到该 frameId 的 entry
2. 有 entry 且 `visibleFieldIds` 包含该 fieldId → `groupId = group.id`，输出
3. 无 entry（未分组）→ 保持当前行为 `groupId = frameId`
4. 有 entry 但 fieldId 不在 visibleFieldIds → 不输出

### 9. 热更新

只存 frameId + visibleFieldIds，不存字段细节（名称、类型、偏移等）。帧定义改了字段后自动生效，配置不需要同步更新。

## 后续

- 待开 feature design 对话，产出 `{slug}-design.md` + checklist
- 需要先做 Service Readiness Audit：display service 是否需要新增 group CRUD 方法
- bridge 改动需要同步更新相关单测
