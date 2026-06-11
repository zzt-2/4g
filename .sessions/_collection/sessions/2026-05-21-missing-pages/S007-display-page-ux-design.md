# [S007] DisplayPage UX 重设计

> 2026-05-26 | 设计 | 待实施

## 目标

设计实时显示页 DisplayPage 的 UX 重做方案，达到旧系统同等 UX 水平。

## 记录

### 事实收集（Wave 1）

**新系统现状（277 行，旧系统 ~15%）：**
- Stats bar（匹配率/总批次/已匹配/未匹配/错误/字节数）+ 两 tab（数据总览/可视化）
- 数据总览：字段值表 + 帧匹配统计表 + 最近输入表（直接查 receive service）
- 可视化：单波形图（displayRefresh.chartInstances[0]）+ 单星座图
- 无双面板、无模式切换、无分组选择、无图表配置、无录制

**Display feature API 已就绪但当前页面几乎未用：**

| 能力 | API | 当前页面 |
|------|-----|---------|
| 双面板偏好 | preferences.table1/table2 | 未用 |
| 三种显示模式 | DisplayMode = table/chart/special | 未用（硬编码 tab） |
| 分组选择 | selectedGroupId | 未暴露 |
| 多图表实例 | ChartInstanceProjection[] (1-4) | 只取 [0] |
| Y 轴配置 | YAxisPreference { autoScale, min, max } | 未暴露 |
| 星座图 | ScatterProjection + ScatterDisplayPreference | 有组件无配置 |
| 图表性能 | ChartPerformancePreference | 未暴露 |
| 刷新 composable | useDisplayRefresh(service) | 在用 |

**旧系统 UX 核心（dataDisplayStore 1073 行 + 8 组件）：**
1. 双面板并排，各独立配置
2. 三模式切换（table/chart/constellation），每面板独立
3. 分组选择器（每面板下拉）
4. 图表配置弹窗（字段多选 + Y 轴 + 性能）
5. 星座图配置弹窗（I/Q 数据源 + 位宽 + 采样数）
6. 底部状态栏（面板状态 + 更新间隔）
7. 录制控制（开始/停止 + 录制时长 + 记录数）
8. 字段排序（up/down）

**关键限制：** display feature 只有单个 ScatterDisplayPreference/ScatterProjection，不是双份。因此 constellation 模式同时只能一个面板使用。

### 设计决策

| # | 决策 | 结论 |
|---|------|------|
| D1 | scope 范围 | 双面板 + 三模式 + 分组选择 + 图表/星座配置 + 字段排序 + 录制 + 统计栏 |
| D2 | 录制归口 | 存储层干活，composable 在页面层协调 display（取什么）+ storage（存什么）+ receive（数据源） |
| D3 | 字段收藏 | 不做，用不上 |
| D4 | 字段排序 | 做，简单 up/down |
| D5 | 星座图双面板限制 | 接受，同时只能一个面板用 constellation 模式 |
| D6 | overview tab | 去掉，旧系统没有全局字段值/帧统计/最近输入表；双面板 table 模式已覆盖字段展示 |
| D7 | Display feature API | 不改，只做 UI 层 |
| D8 | 组件原则 | 页面持有全部状态 + 面板纯展示(props/events) + dialog 共享实例 |

### 组件关系

```
DisplayPage.vue（重写，~180行，页面壳）
├── useDisplayRefresh(displayService)     ← 共享一个实例
├── usePolling → receive stats            ← 共享
├── 录制逻辑（inline composable，~40行）
│
├── StatsBar section（inline template）
│   └── StatusBadge（现有 widget）
│
├── flex 双面板布局
│   ├── DisplayPanel.vue panel-id="1"     ← 新建，纯展示
│   └── DisplayPanel.vue panel-id="2"     ← 复用同一组件
│
├── BottomBar section（inline: 面板状态 + 录制按钮）
│
├── ChartConfigDialog × 1                 ← 新建，共享切换面板上下文
└── ScatterConfigDialog × 1               ← 新建，同上
```

```
DisplayPanel.vue（新建，~130行，纯展示）
├── Props: mode, selectedGroupId, groups, rows, chartSeries, scatter
├── Emits: update:mode, update:selectedGroupId, openSettings, reorderField
│
├── Header（inline: 模式按钮 + 分组下拉 + 设置/清空按钮）
├── table mode → DataTable（现有 widget）
├── chart mode → WaveformChart（现有 widget）
└── special mode → ScatterChart（现有 widget）
```

### 文件清单

| 文件 | 动作 | 位置 | 行数估计 |
|------|------|------|---------|
| DisplayPage.vue | 重写 | pages/ | ~180 |
| DisplayPanel.vue | 新建 | features/display/components/ | ~130 |
| ChartConfigDialog.vue | 新建 | features/display/components/ | ~120 |
| ScatterConfigDialog.vue | 新建 | features/display/components/ | ~100 |
| display-columns.ts | 追加面板表格列 | features/display/components/ | +20 |
| DataTable.vue | 复用不动 | widgets/ | — |
| WaveformChart.vue | 复用不动 | widgets/ | — |
| ScatterChart.vue | 复用不动 | widgets/ | — |
| StatusBadge.vue | 复用不动 | widgets/ | — |
| use-display-refresh.ts | 复用不动 | features/display/composables/ | — |

### 实施提示词

见 H001 §对话 DP（已更新设计决策）。

## 后续

- 在新对话中按本设计实施
- 实施完成后回到本专题审查
- 需验证：displayRefresh.table1Rows/table2Rows 是否有数据（runtime bridge 是否正确注入 source material）
- 需验证：storage service.appendLocalRecords 的签名是否匹配录制需求
