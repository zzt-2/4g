# S010 指令接入页 UI 重做

> 2026-06-22 | 实施 | 完成

## 目标

用户原话："我对于指令接入那一整个页面,都不咋满意(大体上的 UI,具体二级 tab 再说)"。brainstorm 澄清后核心不满两类:**布局/空间利用差** + **视觉缺乏设计感**(顶部 H1 碍事、4 按钮不知道干嘛、tab 难看、整体乱)。本次纯 UI 重做,不动信息架构/不补 Tab2 占位/不改 4 个 composable API/原样迁移用例目录映射。

## 记录

### Brainstorm 关键决策(详见 docs/superpowers/specs/2026-06-22-command-ingress-page-ui-overhaul-design.md)

| 决策点 | 选择 | 否决项 |
|--------|------|--------|
| 顶部骨架 | 单行 toolbar(去 H1,分段控件+按钮按 tab 切换) | 留 H1 占两行 / sidebar 破坏全站统一 |
| Tab1 统计 | KPI bar 两行(原 5×2 卡片 ~200px → ~60px) | 卡片还占一块 / 塞表头放不下状态 |
| Tab1 偶发值 | 「最后功能码」「错误原因」收进命令日志表表头 | 全留 KPI bar(挤) |
| Tab2 | 左 240px 列表 + 右两个独立卡片 | 折叠抽屉反人类 |
| Tab3 头部 | 状态徽章+二级分段控件一行(操作按钮归 CiToolbar) | sidebar 多一个 |
| tab 样式 | 分段控件(一级标准 rw-segmented / 二级弱化 rw-segmented--sub) | 下划线精细化 / 纯文字切换 |
| 组件拆分 | components/ 下按 tab 语义分子文件夹(runtime/config/docking) | 扁平全放根(乱) / 建 tabs/ 通用名(项目无此约定) |

### 实施关键决策

1. **按钮按 tab 动态切换**(CiToolbar):SCOE(monitor/config)→连接/断开/加载·卸载/保存配置;docking→对接配置/断开/上报记录。解决"按钮不知道干嘛"——按钮天然带上下文。**不改 composable API**,只是 page 模板按 activeTab 渲染不同按钮组。

2. **操作按钮单一来源**:docking 的操作按钮归 CiToolbar 统一管理(docking tab 时显示),DockingToolbar 只放状态徽章+二级分段控件,不重复按钮。修正了 spec 3.4 初稿的歧义(初稿写操作按钮在 Tab3 toolbar,会和 CiToolbar 重复)。

3. **子组件 prop 不 mutate,走 emit**(DockingConfigDialog/DeviceEditDialog/SatelliteEditPanel):
   - config 表单字段多,直接 v-model 绑 reactive config prop 会触发 vue/no-mutating-props
   - 用 patchField 模式:子组件 emit `update:config`(合并后的新对象),page 侧 `Object.assign(docking.config, c)` 写回 reactive
   - DeviceEditDialog/SatelliteEditPanel 同款 patchField + emit
   - 延续 D003「子组件单次 emit 原则」

4. **分段控件提取语义 class**(C4/O3):新增 `rw-segmented` + `rw-segmented--sub` 到 `_utilities.scss`(现有语义 class 的家),不建独立 ci-segmented.scss 文件(项目语义 class 都在 _utilities.scss,保持一致)。颜色/圆角/字号全走 token,选中格 `--rw-color-surface-selected` 填充。

5. **边缘 padding 硬约束**(用户强调"两边贴边很难看"):所有容器(toolbar/KPI bar/列表/panel/dialog card)左右 `px-6`、上下 `py-2`/`py-3`,内容不贴边。

6. **高度链**:照搬 SendPage/DisplayPage 验证过的 `q-page flex flex-col h-full` + scoped flex-1 min-h-0。DataTable 用 `container-height="100%"`(D007 flex 撑开陷阱解法)。遵守 L4 + S009 续接5 教训:不预防性堆 flex-1/min-h-0/overflow-hidden,只在表格/滚动边界加。

### 文件变更

**新增**(14 个):
- `rewrite/src/css/layers/_utilities.scss` — 加 rw-segmented 系列(非新文件,改)
- `rewrite/src/features/command-ingress/components/CiToolbar.vue`
- `rewrite/src/features/command-ingress/components/device-columns.ts`(原 page 内联 DEVICE_COLUMNS 提取)
- `runtime/StatsKpiBar.vue` / `runtime/CommandLogTable.vue`
- `config/SatelliteList.vue` / `config/SatelliteEditPanel.vue`
- `docking/DockingToolbar.vue` / `docking/TaskListPanel.vue` / `docking/DeviceListPanel.vue` / `docking/CatalogMappingPanel.vue`(D004/S012 原样迁移) / `docking/DockingConfigDialog.vue` / `docking/DeviceEditDialog.vue` / `docking/ReportRecordDialog.vue`
- `docs/superpowers/specs/2026-06-22-command-ingress-page-ui-overhaul-design.md`

**重写**:`rewrite/src/pages/CommandIngressPage.vue`(1463 行单文件 → ~560 行薄壳,持 4 composable + tab 状态 + handler + 内联测试工具栏/高亮 dialog)

**不变量验证**:
- 4 个 composable(use-scoe-config/use-scoe-monitor/use-test-tool/use-central-docking)零改动 ✓
- command-ingress core/northbound feature/task feature 零改动 ✓
- 用例目录映射逻辑(D004/S012:catalogMappings CRUD + fieldGroups 分组 + 选模板弹窗 + 勾字段)原样迁移到 CatalogMappingPanel ✓
- 路由不变(CommandIngressPage 仍 AppShell 下 page) ✓

## 决策引用

- 无新建 D###(纯 UI 重做,不动架构/接口契约/不推翻旧决策,不够 D### 级)
- 沿用 D003(子组件单次 emit 原则)、D007(flex 撑开陷阱,DataTable container-height 100%)、L4 + S009 续接5(flex 最小必要)

## 范围确认

- 本轮在 scope boundary 内:是(ui-feature-bugs 专题,command-ingress UI 历来归此)

## 验证

- **lint**:0 新增 error(6 个 pre-existing:serial-handlers/display 测试/northbound 测试/storage 测试/HomePage,git stash baseline 比对确认非本次引入)
- **command-ingress 测试**:141/141 全过(12 个 test file)
- **eslint 含 vue/type-checked**:所有新 .vue SFC 解析 + script 类型检查通过
- **build**:未跑通(EBUSY app.asar 锁,多个 electron 进程占用,D006/S009 同款环境问题,非代码)。vite 编译阶段无错误输出,卡在 electron-builder 删旧 asar。

## 后续

- **待用户实测**:`quasar dev -m electron` 打开指令接入页,3 个 tab 都点一遍,映射 CRUD 走一遍,确认视觉效果符合 spec(分段控件/KPI bar/卡片化/不贴边)。
- **待用户**:重启 dev server + 解锁 app.asar 后跑完整 build 验证 .vue 编译。
- Tab2 命令配置「待实现」占位本次未补(功能开发另开任务)。
