# UI 与 Feature Bug 集中修复

> 状态: active | 创建: 2026-06-10 | 最后更新: 2026-06-24 S013 编辑实例弹窗深度重设计完成(S006 后续兑现):双输入框联动/计算按钮/description hover tooltip/公式翻译显示/bytes 单 Hex 框。附带 ExecutionListPage 右栏高度 5 次失败搁置,见 D011。前序 S012(storage appendLocalRecords O(N·M) 治本,2000 records 单 tick 62ms→34ms)、S011 任务管理页 UI 重做。

## 范围变更记录

- **[2026-06-23]** [D010]：修 pre-existing 测试基建(vitest.config.ts 加 @vitejs/plugin-vue + pnpm add devDep)
  - 原因:S012 性能优化的 Phase 1 证据(routingTick 基准)和阶段 4 验证(receive/runtime/storage 测试)都需要跑 import 了 `frame/index.ts`(re-export `FrameSelector.vue`)的测试,但当前工作树这些测试因 vite 无 vue 插件集体跑不起来。不修则无法证据驱动 + 无法验证。
  - 新范围:测试基建修复纳入本任务(用户 AskUserQuestion 拍板"加 vue 插件到 vitest.config")。一行配置 + 一个 devDep,治本,顺带让 receive/runtime/storage 整套测试(89 个)从 broken 恢复。
  - 影响的未决项:无(纯基建修复,不改业务逻辑/契约)。

## 进展线索

- **S001** 帧迁移 + 表达式修复 (06-10 ~ 06-11)：3 agent 调查串口/网口/northbound 状态（全部已实现），3 agent 调查 3 个 send bug 根因，写帧迁移脚本+删 legacy 代码+修表达式引擎+变量解析修复
- **H001** Bug 修复对话提示词 (06-10)：3 个已知 bug（状态丢失/UDP发不出/IP显示错误）的根因分析和修复提示词
- **H002** 帧发送管线修复 (06-11)：5 个系统性修复全部完成 — 字段预览显示、拓扑排序、表达式回写、截断警告、hex 预览（已确认已有）。测试覆盖补充 25 个新用例
- **H003** 接收帧分组管理讨论提示词 (06-11)：用户倾向弹窗代替独立页面，需讨论分组粒度/归属/UI/持久化
- **H004** 速度模拟帧调试交接 (06-11)：H002 代码修复完成（单测通过），但运行时速度累加仍不生效。需确认实际帧数据配置和运行时链路。详见 H003-speed-simulation-debug.md
- **H005** 接收管线调试 (06-11)：根因定位 — `refreshFrameReferences()` 运行时从未被调用，导致 refFrames=0，所有帧 config-error。已修复 3 处。字节序、expressionCache、帧列表问题待讨论
- **H006** Display 页面表格改进 (06-11)：用户反馈接收显示页表格不好用。7 项改进已实现 — 删帧列、删更新时间列、加原始Hex列（float/double→'-'）、加字段排序按钮（可切换）、加值 tooltip、加点击复制、加列可见性切换。含自检修复（双触发 bug、clipboard 错误处理、dataType 过滤提到 bridge 层、SCSS token 化）
- **S002** task 参数变化机制拍板 (06-17)：纠正 H007 误判（线 A 速度模拟早于 4375857 修复，非当前活）；扫归档 53 会话确认 S010 三问题从未拍板；用户拍板"两个都要"。**v2 转折**：主对话讨论问题一时发现两机制共用 step 内执行骨架，改"分开决策、合一实施"。详见 D001 + S002 + voice.md
- **H008** task step 级参数变化机制 (06-17 交接, 06-18 实施完成)：**两个问题合一实施**(共用 FieldValueResolver 骨架)。问题一表达式连续累积(单 step 边界 / repeat×iteration 全局递增 / 公式归帧 / step 级临时上下文 / **accumulation 复用帧侧 self-ref + task 补 writeback**) + 问题二字段级可变参数(响应式联动一次性触发 / clamp) + 顺手修两 bug(progress 爆表 / maxIterations 覆盖)。v1（分开做）已废弃。**实施形状见 D002**。
- **S003** H008 实施对话 (06-18)：落地 6 个设计待决点 + accumulation 复用帧侧 self-ref + task 补 writeback。**续接1**:独立审查 pass-with-known-gaps,补清 console.info + accumulation 端到端集成测试。**续接2(简化)**:用户指出"步进表达式自己递增不需要填",accumulation 从"用户填的 resolver"彻底改为"task 自动 writeback"——删 FieldValueResolver union,fieldResolvers → fieldVariations(只剩离散值列表),writeback 无条件写所有 resolvedFieldValues。用户零配置。task+command-ingress+send 543 tests 全过,lint 0 新增。详见 D002 + S003 + voice.md 2026-06-18
- **S003 续接(可变参数输入清空 bug)** (06-19)：H008 简化后用户发现"可变参数值列表输入后被清空"。排查耗时较长,走过两个误判(派生 model-value 重算 / blur 不可靠),最终根因是 **Vue props 异步回流 + `onVariationValuesInput` 内两次链接 emit 之间 stale 覆盖**:`updateFieldVariation`(emit1 带 fv)→ `patchRepeat`(emit2 不带 fv,读 `props.step.fv` 仍是旧值 `[]`)→ `{...props.step, repeat}` 把 fv 又写成 `[]` 覆盖第一次。修复:fv + repeat 联动合并到同一次 patchConfig emit,单次原子更新。详见 D003 + S003 + voice.md 2026-06-19。用户另提三个新问题(发送失败错误提示 / 保存按钮 disable / 进度计数回退),待处理。
- **S004** 三个 UI 修复 (06-19)：①进度计数按发送次数计(双维度:保留 steps,新增 sends;sendsTotal=iteration×ΣmaxCount;非 repeat 用例仍走 steps)②保存按钮去 disable(hasErrors 响应式滞后,save() 已有 validate 拦截)③发送失败悬停显示具体报错(sendResult.error.message,回退 SEND_RESULT_STATUS_MAP 标签)。task+command-ingress+send 422 tests 全过,tsc 0 错,lint 0 新增。详见 D004 + S004 + voice.md 2026-06-19
- **S005** 串口两个问题 (06-19,主对话子任务)：①配置项写死——9d35a5f 只做了类型+Settings UI 半截,**透传链断 3 处**(platform-bridge SerialConnectConfig 缺字段/real-serial-adapter 丢字段/serial-handlers 没传参),本次补全 + NewConnectionDialog 加 4 个 q-select。flowControl 语义层(none/hardware/software)→main 转 serialport v13 布尔(rtscts/xon/xoff)。dataBits 不加 9(serialport v13 不接受)。②打包后检测不到——根因方向 `npmRebuild:false` 导致原生模块未用 electron ABI,改 true + postinstall 加 electron-rebuild;枚举失败从静默 return[] 改 throw 透传到 renderer devtool(throw+catch 路线,签名不变)。connection 65/65 过,tsc 0 错,lint 0 错。**待用户目标机验证打包**。详见 D005/D006 + S005 + voice.md 2026-06-19
- **S006** SendPage(帧发送页)UI 重设计 (06-19,讨论型任务转实施)：brainstorming→spec→plan→executing-plans 全流程。保留帧模板库+帧实例模型(点帧建实例)。实现:①三栏高度链 ②左栏单行 ellipsis+去 fieldCount+收藏图标区分 ③编辑弹窗 Dec/Hex 全局切换+数值字段双显+badge→分组卡片+flex 滚动(不写死 60vh) ④右栏四块分隔线→卡片化+发送区钉底+构建问题并入参数卡 ⑤表格操作列 5 图标→编辑+菜单。**flex max-height 撑开陷阱**(两次误判 page 高度链方向,最终对比 DisplayPage 定位真因:q-table 全量渲染撑破 flex,需 overflow:hidden 钳制)见 **D007**。新增 numeric-field-format util(18 测试)。send 176 + task/command-ingress 392 测试全过,tsc 0 错,样式 0 硬编码,lint 0 新增。**编辑弹窗深度讨论留待压缩上下文后**。spec/plan 归档 docs/superpowers/。详见 D007 + S006 + voice.md 2026-06-19
- **S007** 接收帧匹配计数到 48 卡死 (06-21,主对话子任务)：累计型冻结(重启就好,跑到 48 又死)。**破案钥匙 48 = EVENT_LIMIT(50)−2**(connect 占 2 槽)。根因 `collectEventsAfter` 用数组下标取 `EVENT_LIMIT=50` 滚动窗口增量,满后 `slice(50)` 恒返回 `[]`→`drainAdapterEvents` 拿不到 data→routingTick 路由冻结→匹配计数不再涨(rxBytes 走独立 counters 仍涨,证明路由断非数据断)。TDD 复现:推 60 一次 drain 只拿 48、三轮各 30 实际 30/18/0,数字精确吻合现象。单点修:删 `collectEventsAfter`、`applyEvents` 改为直接返回本轮新事件快照(与 events 截断解耦)、连带让 `scheduleReconnect`/`handleAdapterDisconnects` 返回 reconnect 事件。connection 全套过、复现测试过、tsc 0 错;heartbeat 5 个预存失败 git stash baseline 验证无关。**待用户目标机验证跑到 48 不卡**。无 D###(纯技术推导根因修复,路径唯一)。**独立问题 B 拆帧异常未修**("长度三次"指向 splitBySyncWord,粘包补丁 FIXME)。详见 S007-receive-freeze-at-48.md
- **S008** 任务管理两页批量设置发送目标 (06-22)：模板管理 + 执行监控各加"批量设置发送目标"。**语义见 D008**:改任务级 `defaultTargetId` + 清空所有 send step 的 step 级 `targetId` 覆盖(初版是改 step 级,用户纠正"别替换字段的目标,改任务级的")。实现:纯函数 `applyDefaultTargetOverride(def, targetId)`(core/task-builders,不可变,7 单测)+ 两 editor 加 `setAllStepTargetOverrides` + 两页 batchMode(ExecutionListPage 之前无,本次新加;active 表 selection 切 multiple)。约束:`updateTask` 仅 created 可改,执行监控批量过滤 editable 跳过非 created。顺手三项列表优化:① 加"默认发送目标"列(targetLabelMap 显 `label (kind)`)② 调度类型列宽 100→120 ③ 来源模板列改显名称(templateNameMap)。task 271+command-ingress 128+send 189 全过,lint 0,我的文件 tsc 0 错。**⚠️ commit 拆分异常**:ExecutionListPage 改动被外部并行 commit `104c917`("右栏高度链修复" message)一并带走,message 不符但用户决定不改;本任务只 commit 剩余 9 个文件。详见 S008-batch-set-send-target.md + D008
- **S009** Electron 主窗口壳层改造 (06-22,子对话实施)：三件事——① devTools 默认开(dev-only,`openDevTools({mode:'detach'})`)② 去系统标题栏(`frame:false`)③ 自定义窗口控制三按钮(minimize/maximize-toggle/close)。**方案见 D009**:`frame:false` 全自定义(否决 `titleBarStyle:'hidden'`——用户意图是自画三按钮 + builder 只有 linux target overlay 不稳)+ windowControl bridge 命名空间(与 transport/file 同级,renderer 直读不经 src/platform facade)+ 最大化图标走事件推送(main 监听 maximize/unmaximize → webContents.send → renderer onMaximizeChange)。三层联动:main(`window-handlers.ts` 新增 5 IPC + `index.ts` frame:false/openDevTools/register+cleanup)+ types(`WindowControlBridge`)+ preload(expose)+ renderer(AppShell q-toolbar drag 区 + 三按钮 no-drag + lifecycle 合并)。IPC 命名沿用 `domain:action`(`window:minimize`/`window:maximize-toggle`/`window:is-maximized`/`window:close`/`window:maximize-changed`)。样式全走 `--rw-color-*` token,关闭按钮 hover 红底白字(`status-danger`+`#ffffff`)。lint 0 新增 + 我的文件 tsc 0 错。**⚠️ build 卡 EBUSY**(app.asar 被进程锁,D006 同款环境问题,rimraf 清理失败未编到代码)。**待用户**:完全重启 dev server 实测(dev server 在跑,main/preload 改动 HMR 不生效需重启)+ 解锁后 prod build。详见 S009-electron-window-devtools-frameless.md + D009
- **S010** 指令接入页(CommandIngressPage)UI 重做 (06-22,子对话实施)：用户原话"整个页面都不咋满意(大体上的 UI)"。brainstorm 定**纯视觉重做**——不动 3 个一级 tab 结构/不补 Tab2 命令配置占位/不改 4 个 composable API/用例目录映射 D004-S012 原样迁移。**1463 行单文件拆成 page 薄壳(~560 行)+ 14 个子组件**(components/ 下按 tab 语义分子文件夹 runtime/config/docking,跨 tab 的 CiToolbar 放根目录)。核心改动:① 顶部去 H1 + 单行 toolbar + 一级分段控件 + **按钮按 tab 动态切换**(SCOE→连接/断开/加载/保存;docking→对接配置/断开/上报)解决"按钮不知道干嘛";② Tab1 5×2 统计卡片网格(~200px)→ KPI bar 两行(~60px,计数器第一行/状态第二行),省 ~140px 给表格,「最后码/错误」收进命令日志表表头;③ Tab2 左 240px 列表 + 右两个独立卡片(基本信息/命令配置);④ Tab3 状态徽章+二级分段控件一行(操作按钮归 CiToolbar 不重复)。**新增 rw-segmented + rw-segmented--sub 语义 class**到 _utilities.scss(C4/O3 复用视觉模式)。子组件 prop 不 mutate 走 emit+patchField(DockingConfigDialog/DeviceEditDialog/SatelliteEditPanel),延续 D003 单次 emit 原则。边缘 padding 硬约束(用户强调"两边贴边难看")——所有容器 px-6/py-3。高度链沿用 SendPage/DisplayPage,DataTable container-height="100%"(D007)。**lint 0 新增**(6 pre-existing 无关)+ command-ingress **141/141 全过**。**⚠️ build 卡 EBUSY**(app.asar 锁,D006/S009 同款环境问题非代码)。无 D###(纯 UI 不动架构/接口)。详见 S010 + spec。**待用户实测**:dev server 重启后看 3 tab + 映射 CRUD
- **S011** 任务管理页(TaskManagePage)UI 重做 (06-23,子对话实施)：用户原话"任务管理那边也丑"(S010 收尾时提)。brainstorm(10 问)定方向:① tab 嵌套**保留换皮**(两级 `rw-segmented`/`rw-segmented--sub`,不重组信息架构)② 顶部**去 H1** 单行 toolbar + 按 tab 切按钮 ③ 执行监控右栏**拓宽 ~400px + gap-6**(去 `rw-divider-l` 贴死)④ **执行监控页加 KPI bar**(活动/运行中/暂停/待启动 + 历史 完成/失败/总计,模板页不加——静态资源无实时状态)⑤ 守 token 和 S010 同级 ⑥ 拆组件 page 薄壳 + `components/{templates,executions}/` 子目录 + dialog 独立 ⑦ monitor 逻辑统一**本次不做**(记后续新对话)⑧ 主区布局 KPI 在上左右分栏在下。**用户明确推翻 H009 预判**:实施用 **frontend-design** 非 writing-plans("不要,文字描述,且用 frontend-design")。新增 9 子组件(TaskManageToolbar/templates/{TemplateList,TemplateEditDialog}/executions/{ExecutionList,ExecutionKpiBar,TaskDetailPanel,TaskEditDialog}/BatchSetTargetDialog 共用/TemplatePickerDialog 共用),删 TemplateListPage(753)+ExecutionListPage(832) 两巨石单文件,TaskManagePage 重写成薄壳(~700 行持 2 editor + tab + polling + 选中派生 + CRUD 转发)。**dialog 走 patchField emit 模式**(D003,治 `vue/no-mutating-props` 24 错——初版直接 `v-model="props.editor.xxx.value"` 全标红,改 patchField emit page 持锁在 editor ref 上赋值)。TaskExecutionDetail 滚动修复(S009 续接5)保留。lint **0 新增**(6 pre-existing 无关)+ task **271/271** + command-ingress/send **330/330** 全过。无 D###(纯 UI,monitor 不做故不触发)。详见 S011 + spec(`docs/superpowers/specs/2026-06-23-task-management-ui-overhaul-design.md`)。**待用户实测**:dev server 重启后看模板/执行两 tab + KPI bar + 右栏详情卡片 + 各弹窗
- **S012** 接收帧高频卡顿——storage appendLocalRecords O(N·M) 治本 (06-23,子对话实施)：用户原话"一秒接收十几帧…严重的性能问题"+ 补关键新证据"**开久了卡**"。主对话 analyze-perf.py 锁 timer#4(76 次触发累计 23.97s,每次 300-430ms)。**Phase 1 证据反转**:初读 trace 误判"76次=100ms定时器=一秒十几帧",用户纠正帧速率≠定时器频率;Node 基准证伪主对话嫌疑#2"routingTick 回调重活"(12帧仅 5.5ms,服务层全是纯 JS 无 Vue reactive)。持续推帧采样锁定真凶:**storage `appendLocalRecords` 每帧全量深拷贝+排序=O(N·M)**,2000 records 单 tick 62ms(56x),反推 trace 300ms 自洽。**治本**(D010):`canAppendInOrderFast` 快速路径(单调递增+id 全新时 append-only,跳过 merge/排序/多次深拷贝)+ `storage-state` 加 `appendRecords`/`getLastRecordCapturedAtMs`/`hasRecordId` 轻量 accessor + 复用 snapshot 免再深拷贝。TDD RED(旧 34ms fail)→GREEN(新 18.65ms),语义不变量(乱序排序/隔离/升序)全过。端到端 routingTick 2000 records **62ms→34ms(1.8x)**。顺带清 9 处 debug log([RX-PROC]/[RX-SVC]/[ROUTE-TICK])+ 修 pre-existing 测试基建(vitest 加 vue 插件,让 receive/runtime/storage 89 测试从 broken 恢复)。tsc 0 / lint 0 / storage+receive+command-ingress 181 / runtime+append-perf 17。pre-existing 5 集成测试失败(event-truncation+tcp-datapath)HEAD 已确认无关。**待用户目标机实测**:接收十几帧/秒跑 15+ 分钟看卡顿缓解。详见 S012 + D010。
- **S013** 编辑实例弹窗深度重设计 (06-19~24,S006 后续兑现)：用户明确"压缩上下文后好好讨论编辑弹窗"。brainstorming(6 问)→spec→plan(8 task)→executing-plans(inline)。定案:双输入框联动(左 Dec/右 Hex `0x` 前缀,取代单框+全局切换钮)/禁科学计数法(BigInt 兜底)/全局计算按钮(committedValues 快照+stale 灰显,用户"实时算太吵")/字段 description 删常驻改整行 hover tooltip(用户纠正"我说的备注是字段下面那条")/表达式公式翻译显示(变量→来源字段名,用户选"翻译后人话")/bytes 单 Hex 框/紧凑无表头 grid。技术发现:`evaluateConditional` 早返回 matchedIndex 只是被丢弃,Task 1 透传。8 task 全过+修 3 回归(tooltip DOM 兄弟节点 bug/bytes 单框/右栏长 hex 换行),send 189/189,tsc 0,用户确认功能正常。spec/plan 归档 docs/superpowers/。**附带:ExecutionListPage 右栏高度 5 次失败搁置**——见 **D011**(flex 高度链排查方法论+失败路线)。注:S011 已把 ExecutionListPage 拆成子组件,后续排查以 S011 后结构为准。详见 S013 + D011

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
- `resolveExpressionVariables` 新增：表达式求值前把 `current_field` 变量的 `sourceId` 映射到 `identifier`
- `ExpressionConfig.variables` 类型加 `sourceId?` 字段
- 测试修正为 `{ identifier, sourceType }` 格式，新增 3 个 `current_field` 测试

### 实现状态确认

| 模块 | 状态 | 测试 |
|------|------|------|
| 串口 (serial) | 完整实现，serialport v13 | 47 tests passed |
| 网口 (TCP/UDP) | 完整实现，Node net/dgram | 同上 |
| Northbound | 12 入站 + 9 出站 + JWT + FTP | 86 tests passed |

### 接收帧分组管理设计决策 (06-11 H003 讨论)

| 项 | 决策 |
|----|------|
| 粒度 | 只管"帧→分组"映射 + 每帧可见字段选择，不引入 DataItem 级别配置 |
| 归属 | display feature |
| UI 形式 | 弹窗 rw-dialog-lg，从 DisplayPanel 分组下拉旁设置按钮触发 |
| 操作集 | 创建/删除/重命名分组，分配帧到分组，移除帧，排序，勾选每帧可见字段 |
| 帧与分组关系 | 一帧一分组（或未分组），一个分组可含多帧 |
| 字段可见性 | 默认不显示，显式勾选才显示；只存 frameId + visibleFieldIds，不存字段细节，支持热更新 |
| 持久化 | 扩展 DisplayPreferences，新增 groups: DisplayGroupConfig[] |
| 数据结构 | `DisplayGroupConfig { id, label, frames: DisplayGroupFrameEntry[] }`，`DisplayGroupFrameEntry { frameId, visibleFieldIds[] }` |
| bridge 改动 | 收到字段时查 group config，frameId 在某分组且 fieldId 在 visibleFieldIds 中 → groupId=group.id 输出，否则不输出 |

### Display 页面表格改进 (06-11 H006)

| 改动 | 实现 |
|------|------|
| 删帧列 | `panelTableColumns` 移除 frameId 列 |
| 删更新时间列 | `panelTableColumns` 移除 updatedAt 列 |
| 加原始Hex列 | bridge 层传递 rawHex（float/double 已在 bridge 过滤为 undefined），DisplayPanel 显示 |
| 字段排序 | `DisplayGroupFrameEntry.fieldOrder` 持久化，projection 按 fieldOrder 排序，DisplayPanel 排序模式下显示上/下箭头 |
| 值 tooltip | `fieldMeta` Map（从 frameReader 取 description）传入 DisplayPanel |
| 点击复制 | 值/hex 单元格点击调用 `navigator.clipboard.writeText`，含错误处理 |
| 列可见性切换 | `TableDisplayPreference.visibleColumns` 持久化，header view_column 按钮弹出勾选菜单 |

数据管线改动：`rawHex` 从 receive 层经 bridge → `DisplayFieldMaterial` → projection → `TableRowProjection` → DisplayPanel。`dataType` 不传递到 display 层（bridge 层直接过滤 float/double）。

涉及文件：types.ts, clone.ts, normalize.ts, projection.ts, receive-display-bridge.ts, display-columns.ts, DisplayPanel.vue, DisplayPage.vue

## 未决项

- 发送帧状态丢失的修复方案待确认（Pinia / keep-alive / 持久化三选一）— H001
- UDP 问题修 UI 校验还是修错误反馈待确认 — H001
- 帧发送页面"一大堆问题"待用户补充 — H001
- `frames-v2.json` 需要接入应用启动自动初始化逻辑
- **5 个帧发送管线系统性问题已修复 — H002 (06-11)**：
  1. ✅ 表达式/不可配置字段显示 `--` → FieldEditWidget 新增 `previewValues` prop，SendPage 计算预览值传入
  2. ✅ 无拓扑排序 → `resolveFieldValues` 两阶段重构，复用 shared `kahnSort`
  3. ✅ 表达式结果不回写 → `SendResult.resolvedFieldValues` 新字段，onSend 成功后回写表达式字段值
  4. ✅ 整数静默截断无警告 → `INTEGER_RANGES` 常量 + buildFrame 范围校验 warning
  5. ✅ hex 预览 → 已确认现有代码已实现（use-frame-preview + SendPage 右面板）
- **速度模拟帧运行时问题 — H004 (06-11)**：代码修复+单测通过，但实际运行速度不累加。待下轮用 console.log 追踪实际帧数据和运行时链路
- **字节序**：帧定义 `bigEndian: false` 但硬件发大端数据，需用户确认
- **expressionCache**：`processReceiveBatch` 运行时未传 expressionCache，表达式字段跳过求值
- **调试日志**：3 个文件有 `[RX-PROC]`/`[RX-SVC]`/`[ROUTE-TICK]` 临时日志待清理
- **字段排序跨帧限制**：当前 fieldOrder 按帧分组排序，不支持跨帧穿插排序

## 当前位置

**S013 编辑实例弹窗深度重设计(2026-06-24,S006 后续兑现)**。用户明确"压缩上下文后好好讨论编辑弹窗"。brainstorming(6 问)→spec→plan(8 task)→inline 实施。定案:双输入框联动(左 Dec/右 Hex `0x` 前缀)/禁科学计数法/全局计算按钮(committedValues 快照+stale)/字段 description 删常驻改整行 hover tooltip/表达式公式翻译显示(变量→来源字段名)/bytes 单 Hex 框/紧凑无表头 grid。8 task 全过+3 回归修复(tooltip DOM/bytes/长 hex 换行),send 189/189,tsc 0,用户确认功能正常。spec/plan 归档 docs/superpowers/。**附带 ExecutionListPage 右栏高度 5 次失败搁置**——见 D011(flex 高度链排查方法论)。注:S011 已拆 ExecutionListPage 成子组件,后续排查以 S011 后结构为准。详见 S013 + D011。

前序:S012 接收帧高频卡顿——storage appendLocalRecords O(N·M) 治本(2026-06-23)。用户"一秒十几帧…严重的性能问题"+"开久了卡"。根因 `appendLocalRecords` 每帧全量深拷贝+排序 O(N·M),2000 records 单 tick 62ms。治本(D010):`canAppendInOrderFast` 快速路径 + 轻量 accessor,端到端 62ms→34ms。详见 S012 + D010。

前序:S011 任务管理页(TaskManagePage)UI 重做完成(2026-06-23)。brainstorm(10 问)定方向:tab 嵌套保留换皮(两级 rw-segmented)+ 去 H1 单行 toolbar + 执行监控页加 KPI bar + 右栏拓宽 ~400px gap-6 + 拆组件 page 薄壳 + components/{templates,executions}/ 子目录 + dialog 独立。**用户明确推翻 H009 预判**:实施用 frontend-design 非 writing-plans。新增 9 子组件,删 TemplateListPage(753)+ExecutionListPage(832) 两巨石。dialog 走 patchField emit(D003,治 vue/no-mutating-props)。monitor 逻辑统一本次不做(记后续)。lint 0 新增 + task 271/271 + command-ingress/send 330/330 全过。详见 S011 + spec(`docs/superpowers/specs/2026-06-23-task-management-ui-overhaul-design.md`)。

前序:S010 指令接入页(CommandIngressPage)UI 重做完成(2026-06-22)。纯视觉重做(用户原话"整个页面都不咋满意")——不动结构/不补 Tab2 占位/不改 composable API/用例目录映射原样迁移。**1463 行单文件拆成 page 薄壳(~560 行)+ 14 个子组件**(components/ 下 runtime/config/docking 子文件夹 + 跨 tab 的 CiToolbar)。核心:顶部去 H1 + 分段控件 + 按钮按 tab 切换;Tab1 卡片→KPI bar;Tab3 状态徽章+二级分段控件一行。新增 rw-segmented 语义 class。子组件 prop 不 mutate 走 emit(D003)。lint 0 新增 + command-ingress 141/141 全过;build 卡 EBUSY 环境锁非代码。详见 S010 + spec(`docs/superpowers/specs/2026-06-22-command-ingress-page-ui-overhaul-design.md`)。

前序:S009 Electron 主窗口壳层改造完成(2026-06-22)。三件事:① devTools 默认开(dev-only,`openDevTools({mode:'detach'})`)② 无边框窗口(`frame:false`,否决 `titleBarStyle:'hidden'`——见 D009)③ 自定义窗口控制三按钮(minimize/maximize-toggle/close)。三层联动:main(`window-handlers.ts` 新增 + `index.ts`)+ preload + types(`WindowControlBridge`)+ renderer(AppShell)。最大化图标走事件推送(main maximize/unmaximize 监听 → webContents.send → renderer onMaximizeChange)。lint 0 新增 + 我的文件 tsc 0 错。**待用户**:完全重启 dev server 实测(当前 dev server 在跑,main/preload 改动 HMR 不生效需重启验证 frame:false + DevTools 自开 + 三按钮 + drag)+ 解锁后 prod build(EBUSY app.asar 锁,D006 同款环境问题)。详见 S009 + D009。

前序:S008 任务管理两页批量设置发送目标(2026-06-22)。改任务级 `defaultTargetId` + 清空 step 级覆盖(纯函数 `applyDefaultTargetOverride`)。语义见 D008。

前序:H008 task step 级参数变化机制实施完成 + 独立审查通过(2026-06-18)。两个问题合一实施完成:字段级可变参数 + 表达式连续累积(共用 FieldValueResolver 骨架),顺手修 progress 爆表 + maxIterations 覆盖两 bug。accumulation 采用"复用帧侧 self-ref + task 补 writeback"路径(用户拍板,偏离 H008 v2 原设计但语义一致)。

**独立审查结论:pass-with-known-gaps**(无 revise-required 问题,架构零违规,核心语义全部正确且有 USER CASE 测试覆盖)。审查指出的两个 known gap 已补清:4 处 [task-debug] console.info 清理 + accumulation 端到端集成测试(真实 frame-resolver 递推 + writeback 闭环)。

验证状态:task+command-ingress+send **546 tests 全过**(含 3 USER CASE + 2 e2e),tsc 源码 0 错,lint 0 新增 error。build 未跑通(electron 打包 EBUSY 文件锁,环境问题非代码)。预先存在的 6 个失败(heartbeat-timer/connection-core)与本任务无关。

待用户确认:build 环境锁解除后跑一次完整 build(验证 .vue script 编译);以及是否需要真实硬件运行时验证(速度模拟帧 S-FPGA-004 在 task 下实际连续累积)。

### H007 表达式累加问题(2026-06-17, 已部分作废)

详见 `H007-expression-accumulation-handoff.md`。⚠️ **2026-06-17 用户纠正**:H007 把"线 A = send 速度模拟运行时调试"当当前待办是定性错误——该 bug 已于 commit 4375857(2026-06-11)修复。H007 描述的"线 A 当前待办"作废。真正当前活是线 B(task 参数变化),已由 S002/D001 落实拍板,H008 v2 合一实施。H007 文档保留可追溯,不再作为执行依据。

## H008 task step 级参数变化机制（2026-06-18 实施完成）

详见 `H008-field-level-variable-parameters-handoff.md`。**两个问题合一实施完成**(共用 FieldValueResolver 骨架):问题二字段级可变参数 + 问题一表达式连续累积 + 顺手修两个 bug(progress 爆表 / maxIterations 覆盖)。**实施形状见 D002**(resolver 挂 SendStepConfig.fieldResolvers / accumulation 复用帧侧 self-ref + task 补 writeback / counter 穿透 / 联动 flag / iteration-counter 协同)。

## 决策与原话

- **D001**(decisions.md):task 参数变化机制——两个需求都要,分开决策、合一实施。详细语义 + 理由 + 排除方案 + 影响范围。
- **D002**(decisions.md):H008 实施形状落地 —— resolver 挂 SendStepConfig + accumulation 复用帧侧 self-ref + 6 个设计待决点最终方案 + accumulation 路径偏离记录。
- **D003**(decisions.md):子组件 patchConfig 单次 emit 原则 —— 链式 emit 间 props 异步回流导致 stale 覆盖。
- **D004**(decisions.md):进度双维度语义 —— steps(step 完成数)+ sends(发送次数)。
- **D005**(decisions.md):串口 4 参数透传链补全 —— 语义层 flowControl 抽象 + dataBits 不加 9。
- **D006**(decisions.md):打包串口检测修复 —— npmRebuild:true + 枚举失败 throw 透传 renderer devtool。
- **D007**(decisions.md):flex `max-height:100%` 撑开陷阱(失败路线记录)—— 全屏列表/表格布局正确解法,含两次误判 ruled out。
- **D008**(decisions.md):批量设置发送目标语义 —— 改任务级 defaultTargetId + 清空所有 step 级 targetId 覆盖(否决"只改 step 级"初版 + "只改任务级保留 step 覆盖")。
- **D009**(decisions.md):无边框窗口方案 —— `frame:false` 全自定义(否决 `titleBarStyle:'hidden'`)+ DevTools dev-only 自开(`process.env.DEV` 判断)+ windowControl bridge 契约(与业务 facade 同级,renderer 直读,最大化图标走事件推送)。
- **D010**(decisions.md):接收帧高频卡顿——storage appendLocalRecords O(N·M) 治本(含失败路线:初读 trace 误判"平稳=排除累积")+ 测试基建范围扩张(vitest 加 vue 插件)。append-only 快速路径(canAppendInOrderFast)+ 轻量 accessor。
- **D011**(decisions.md):flex 高度链排查方法论——必须从 q-page-container 起逐环验证 computed height,禁止凭读代码猜(含 5 次失败路线 ruled out)。S013 附带 ExecutionListPage 右栏高度问题搁置的依据。
- **voice.md**:2026-06-17 用户拍板原话(连续累积语义 / 字段级可变参数语义 / 纠正线 A 误判) + 2026-06-18 accumulation 路径拍板 + 2026-06-19 SendPage UI 重设计反馈与两次"完全没用" + 2026-06-22 批量设置发送目标需求与三次追加调整 + 2026-06-22 S009 窗口壳层三件事需求("别给我堆屎山") + 2026-06-23 S012 性能优化(纠正"一秒十几帧≠定时器"+"开久了卡"+拍板测试基建范围扩张)。
