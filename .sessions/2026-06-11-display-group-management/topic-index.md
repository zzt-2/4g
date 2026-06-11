# 接收帧分组管理 Feature

> 状态: active | 创建: 2026-06-11 | 最后更新: 2026-06-12 S006 v2 审查反馈修复完成

## 进展线索

- **S001** 初始实施 + S002 代码质量修复 + S003 运行时修复 + S004 持久化/UI重构 (06-11)：四轮实施，覆盖 feature 全流程 + 15 项质量问题 + 运行时显示问题 + 持久化缺失 + 图表弹窗重构
- **S005** 图表+UI全面诊断+修复 (06-12)：持久化已修复。诊断 8 项问题，完成 6 项 UI 修复（#3-#8）
- **S002** 图表累积重构 (06-12)：6 agent 验证 + 三阶段实施完成。图表时序累积移到 composable，删除死代码（projection/selector/clone/service），新增 getSourceFields() 方法。lint+test 通过
- **S006** v2 审查反馈修复 (06-12)：4 blocker + 4 major + 2 minor 全部修复。lint display 0 error / display test 66 pass（含 8 新增验收场景）/ v2 引入 tsc error 全清

## 已确认结论

- 设计文档: `codestable/features/2026-06-11-display-group-management/display-group-management-design.md`
- S003：availableFields 不限帧方向 + 表格占位行 + 图表按分组过滤 + label 显示帧名/字段名
- S004：persistDisplay() 持久化调用 + chart IIFE→computed + 图表弹窗 tab+chip 重构 + FieldOption 加 frameId
- S005：持久化已生效。UI 修复 6 项完成（过滤发送帧、按钮条件渲染、移除 sortable、_reorder 条件列、行高 36）
- S002：图表累积移到 composable 层（Map buffer + numeric 过滤 + maxPoints 裁剪）；删除 projectChartSeries/projectChartInstances/getChartInstances/getChartSeries/selectChartInstances/selectChartSeries/3个clone函数/DisplayProjection.charts；类型保留给 history 共用；新增 getSourceFields() 给 composable 读未过滤数据
- S006：R19 vs 设计 5.8 冲突通过 page 层 enrich 解决（bridge push 保留作 shape 冗余但 UI 不直接信任；projection toRow 删 fieldName；DisplayPage fieldNameLookup + enrichRows 从 frameReader 静态 lookup 覆盖）。getFieldName 硬失败 '[Unknown Field]' 防 UUID 泄漏。WaveformChart emptyVariant prop 区分 no-selection vs no-data。ScatterConfigDialog availableFields 加 binding 字段，toBinding 用 find lookup 不分割字符串。

## 未决项

- **等待用户二次审查**：S006 全部修复完成，验证证据齐（lint/tsc/test），等用户审查确认
- **预存问题不在本轮范围**：tsc 残留（exactOptionalPropertyTypes + readonly Ref）/vite vue plugin/.vue import/connection-core test fail/quasar rollup build
- **运行时手工验证**：图表冷启动占位、migration 加载旧 persistence、字段名显示

## 当前位置

S006 v2 审查反馈全部修复完成（4 blocker + 4 major + 2 minor），lint display 0 error / display test 66 pass（含 8 验收场景）/ v2 引入 tsc error 全清。不提交，等用户二次审查。
