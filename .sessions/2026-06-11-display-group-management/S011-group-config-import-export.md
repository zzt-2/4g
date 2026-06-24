# [S011] 分组配置导入导出

> 2026-06-24 | 增强 | 状态: 已交付（待运行时实测）

## 目标

用户："我记得之前想给 GroupConfigDialog 里的分组加一个导入导出来着，一直没加？"

确认：GroupConfigDialog 确实没有导入导出。本轮补上——让用户能把分组配置（分组名/含哪些帧/可见字段）导出为 JSON 备份，或从 JSON 导入恢复/迁移。

## 记录

### 决策（3 轮 AskUserQuestion 锁定，均用推荐项）

- **范围**：只导分组配置（DisplayGroupConfig[]），不动表格/星座图/图表等其它 display 配置
- **导入合并策略**：完全替换（清空现有→填入导入内容）
- **入口位置**：弹窗标题栏（"分组管理"右侧加导入/导出两按钮）

### 设计细节（合理默认，做时说明）

- **格式**：JSON 数组，带缩进（可读），内容 = `DisplayGroupConfig[]` 序列化
- **文件名**：`display-groups-YYYYMMDD-HHmmss.json`（带时间戳防覆盖）
- **导入校验**：结构校验（数组/每项有 id+label+frames/frames 项有 frameId+visibleFieldIds）。frameId/fieldId 不做存在性校验——导入后引用不存在的帧由 emergent 分组逻辑正常降级
- **导入替换流程**：校验→弹框确认（"将导入 N 个，替换现有 M 个"）→替换 editingGroups（**还没保存**，用户可在弹窗里继续看/改/取消）→点保存才落盘。导入错了能取消
- **双路径文件 IO**：复用项目现有 `getFileFacade()`（Electron: showSaveDialog/writeTextFile/showOpenDialog/readTextFile），浏览器降级 Blob+createObjectURL / 隐藏 input[type=file]。与 FrameListPage 导入导出模式一致
- **错误兜底**：parseGroupsFromJson 用 try/catch 包裹 JSON.parse，结构非法抛带定位信息的人类可读错误，调用方转 notify.error。坏文件不会崩 UI

### 关注点分离

序列化/校验逻辑（`serializeGroups`/`parseGroupsFromJson`）抽到独立纯函数模块 `core/group-io.ts`：
- 无 Vue 依赖，可单测
- 与组件 IO 副作用（文件对话框/下载）解耦
- 与现有 `group-resolution.ts` 同级（分组相关逻辑归 core 层）

校验是安全相关（防坏/恶意 JSON 崩溃），加了 11 条单测覆盖往返 + 各种非法结构 + 边界（空数组=清空、id 空串、visibleFieldIds 非字符串项容错过滤）。

## 决策引用

- 无 D###（纯功能增强，无架构/方向决策。导入导出范围/策略是用户拍板的实现选择，未达 D### 阈值）

## 范围确认

- 本轮在 scope boundary 内：分组管理属 display feature，display-group-management 专题范围 ✓

## 验证

- group-io 单测 **11/11 ✓**（往返 + 9 条校验边界）
- display 全套 **80/80 ✓**（69 原 + 11 新 group-io）
- lint 新增文件 **0 error**
- tsc src **0 错误**

## 后续

- **运行时手工验证**（待用户）：quasar dev，分组管理弹窗→导出（选路径存 json）→改几个分组→导入刚才的 json→确认替换→保存→重开应是导入内容
- **持久化已确认**：导入→保存走 saveGroupConfig→persistDisplay（与 S010 同条持久化路径），落盘的 groups 含导入内容
- 若将来要"合并导入"或"导出整个 display 配置"，parseGroupsFromJson/serializeGroups 已是独立模块，易扩展
