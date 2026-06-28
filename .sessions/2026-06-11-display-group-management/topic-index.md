# 接收帧分组管理 Feature

> 状态: active | 创建: 2026-06-11 | 最后更新: 2026-06-28 S012 实时录制重设计实施（待目标机实测）

## 进展线索

- **S001** 初始实施 + S002 代码质量修复 + S003 运行时修复 + S004 持久化/UI重构 (06-11)：四轮实施，覆盖 feature 全流程 + 15 项质量问题 + 运行时显示问题 + 持久化缺失 + 图表弹窗重构
- **S005** 图表+UI全面诊断+修复 (06-12)：持久化已修复。诊断 8 项问题，完成 6 项 UI 修复（#3-#8）
- **S002** 图表累积重构 (06-12)：6 agent 验证 + 三阶段实施完成。图表时序累积移到 composable，删除死代码（projection/selector/clone/service），新增 getSourceFields() 方法。lint+test 通过
- **S006** v2 审查反馈修复 (06-12)：4 blocker + 4 major + 2 minor 全部修复。lint display 0 error / display test 66 pass（含 8 新增验收场景）/ v2 引入 tsc error 全清
- **S008** 接收页鬼畜修复 (06-21)：H001 已收口（主干测试转绿）。修复 emergent 分组 label 裸 frameId + buildPlaceholderRows 对 emergent 返空 + display buffer 整体覆盖三个连环缺陷。2 条偏离设计的决策（D-buffer-accumulate / D-emergent-from-frame-def）。test 105/105、lint 净
- **S009** 实时测试页布局调整 (06-22)：三处纯 UI 调整（3 轮迭代）——标题"实时展示"→"实时测试"（含 AppShell 菜单同步）、stat 并入底栏录制行不再单独成块、表格行高压缩（DataTable compact prop 双保险：dense + scoped CSS，行高 36→20px）。行高前 2 次 scoped :deep 因选择器落在子组件根元素上失效，根因已记。无 D###。test 61/61、lint 净
- **S010** 星座图刷新间隔接通+点大小配置 (06-24)：刷新间隔"半成品"接通——4 个互相打架的刷新概念（scatter/chart/顶层/写死）收敛为三视图各自独立节奏（D001）。两层存储 bug 修复（normalize scatter 合并漏字段 + clone 白名单漏 pointSize）；消费层重写（删写死 cadenceMs=200，改三组独立 cadence + watch 重启）；点大小加 pref+滑块（默认4，原写死6）。默认间隔 100/200→2000ms。推翻主对话"统一到 C"预判，改用用户拍板的"各自独立"。test display 69/69 + 集成 38/38、lint 0 新增、tsc src 0 错。待运行时实测
- **S011** 分组配置导入导出 (06-24)：GroupConfigDialog 补导入导出——只导分组配置（DisplayGroupConfig[]）、导入完全替换、入口在弹窗标题栏。序列化/校验抽独立纯函数 core/group-io.ts（11 单测覆盖往返+边界），文件 IO 复用 getFileFacade 双路径（Electron/浏览器降级），导入校验后替换 editingGroups 不立即落盘（可取消）。无 D###。test group-io 11/11、lint 0、tsc 0
- **S012** 实时测试页录制功能重设计 (06-28)：H014 实施型 handoff 执行，按 plan 12 任务 TDD 落地。开工前先落地 S015/D013 基线（工作区脏：routing-tick 删 fanOutToStorage 等治本未提交，本录制 plan 红线前提依赖它），拆 6 commit 提交后开 feat 分支。T1-T11：二进制序列化(magic RCD1+帧记录)→disk-rotation-writer 共享写盘工具(从 storage-filter 提取)→recording-writer(主进程)→storage-filter 重构复用(-141行去重,91/91无回归)→IPC 通道→recording feature 主体→DisplayPreferences 扩展 recording→routing-tick 采集(O(1)早退守S015)→RecordingConfigDialog+FrameSelector多选→DisplayPage 删内联改全局(治诉求①)→持久化。**关键发现:DisplayPreferences 加字段白名单是 5 处不是 4 处**(applyDisplayPreferencesPatch patch 合并 + clone 防御 undefined 是隐含第 5 处,plan 漏,落 D002)。recording 18/display 82/storage-highspeed 91/全量 1889 passed(11失败全pre-existing,0新增)/tsc src 0错/lint本轮0 error。**⚠️ 目标 Linux 机实测未做**(S015红线:连真实数据源看routingTick不卡+切路由录制继续+.bin落盘),feature 分支待实测后合并。D002 新建(录制架构8项决定+5处白名单教训)。下一轮:History 页改造消费 .bin

## 已确认结论

- 设计文档: `codestable/features/2026-06-11-display-group-management/display-group-management-design.md`
- S003：availableFields 不限帧方向 + 表格占位行 + 图表按分组过滤 + label 显示帧名/字段名
- S004：persistDisplay() 持久化调用 + chart IIFE→computed + 图表弹窗 tab+chip 重构 + FieldOption 加 frameId
- S005：持久化已生效。UI 修复 6 项完成（过滤发送帧、按钮条件渲染、移除 sortable、_reorder 条件列、行高 36）
- S002：图表累积移到 composable 层（Map buffer + numeric 过滤 + maxPoints 裁剪）；删除 projectChartSeries/projectChartInstances/getChartInstances/getChartSeries/selectChartInstances/selectChartSeries/3个clone函数/DisplayProjection.charts；类型保留给 history 共用；新增 getSourceFields() 给 composable 读未过滤数据
- S006：R19 vs 设计 5.8 冲突通过 page 层 enrich 解决（bridge push 保留作 shape 冗余但 UI 不直接信任；projection toRow 删 fieldName；DisplayPage fieldNameLookup + enrichRows 从 frameReader 静态 lookup 覆盖）。getFieldName 硬失败 '[Unknown Field]' 防 UUID 泄漏。WaveformChart emptyVariant prop 区分 no-selection vs no-data。ScatterConfigDialog availableFields 加 binding 字段，toBinding 用 find lookup 不分割字符串。
- S008：emergent 分组从接收帧定义生成（不依赖运行时数据，label=帧名）；buildPlaceholderRows 对 emergent 分组按 frameId 兜底；display buffer 改按 dataItemId 累积（upsert），与图表 chartBuffer 累积语义对齐。根因是静态帧定义与动态接收数据流耦合（D7 精神未贯彻到 buffer/emergent 两处）。决策 D-buffer-accumulate / D-emergent-from-frame-def 偏离设计文档 line 100/171/258/182，留待设计文档修订同步。
- S010：刷新间隔三视图各自独立节奏（D001）——星座图←scatter.refreshIntervalMs、波形图←charts min refreshIntervalMs、表格←固定500ms；顶层 refreshCadenceMs 弃用（底栏不再显示）。两层存储根因（normalize scatter 合并漏字段 + clone 白名单漏 pointSize）+ 消费层写死 cadenceMs=200 全部接通。pointSize 新 pref（默认4，弹窗滑块1-12）。projectScatter 签名收窄 Pick（pointSize/refreshIntervalMs 非投影输入）

## 未决项

- **等待用户回测**:S008 刚交付，待用户运行时确认（分组名中文 / 表格不闪 / 手动分组正常）
- **S008 行为变化**:buffer 累积后停发的帧保留最后值不自动清除（用户已认可可接受；如需超时清理或按连接状态清，再开新 session）
- **设计文档修订**:S008 两条决策偏离设计文档 line 100/171/258/182 明文，待需要时同步更新设计文档（与本轮代码解耦）
- **预存问题不在本轮范围**:tsc 残留(exactOptionalPropertyTypes + readonly Ref)/vite vue plugin/.vue import/connection-core test fail/quasar rollup build
- **运行时手工验证**:图表冷启动占位、migration 加载旧 persistence、字段名显示、图表不出数据上游根因(receive 是否有 matched 数据)

## 当前位置

S012 完成（代码层）：实时测试页录制功能重设计 T1-T11 全部落地，feature 分支 `feat/recording-redesign`。recording 18/display 82/storage-highspeed 91/全量 1889 passed（11 失败全 pre-existing）/tsc src 0 错/lint 本轮 0 error。**待用户目标 Linux 机实测**（S015 红线：连真实数据源看 routingTick 不卡 + 切路由录制继续 + .bin 落盘 + 重启还在），实测后决定分支合并。S008-S011 仍待运行时回测。下一轮：History 页改造消费录制 .bin。

S011 完成：分组配置导入导出已交付。GroupConfigDialog 标题栏加导入/导出，序列化校验抽 group-io.ts 纯函数（11 单测）。test display 80/80、lint 0、tsc 0。等用户运行时实测（导出 json→改分组→导入替换→保存→重开验证）。S008-S010 仍待运行时回测。
