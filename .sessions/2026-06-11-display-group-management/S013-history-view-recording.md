# S013 History 页查看录制数据（格式演进 + 读取层重写）

> 2026-06-28 | 实施 | 状态: 代码层完成,待目标机端到端实测
> 关联决策: D003（新建,细化 D002 格式部分）

## 目标

执行 H015 实施型 handoff：让 History 页能查看录制的 `.bin`。录制格式升级为"RCD1 + session 头部帧定义块"（防帧定义漂移），History 读取层用内嵌帧定义解析，直接换新内部模型（帧×字段×时间点）。7 任务 TDD 拆解（plan: docs/superpowers/plans/2026-06-28-history-view-recording.md）。

## 记录

### Handoff 验证（Trigger 5,开工前）

验证 H015 的 4 条关键事实声称,全 PASS：
- 录制合并 a3c9df1 ✓
- HistoryPage.vue:15 拼写 bug（storageLocalService,接口 storageService）✓
- parseReceiveFrameFields({frame, bytes}) 存在,返回 ReceiveParsedFieldValue（fieldId/fieldName/value/displayValue）✓
- disk-rotation-writer 追加模式（flags:'a',:143）、单流（:56）、平铺清理（:156-169）✓

膨胀检查:S### 文件 9 个（本轮后 10,< 15 不 BLOCK,≥8 warn 但范围仍在原 goal 内）。

### 工作区

worktree `.worktrees/history-view-recording`（branch `feat/history-view-recording`），隔离本轮改动。npm install + quasar prepare 后基线 recording 18/18 绿。

### T1-T6 实施（逐任务 TDD,6 commit）

- **T1 帧定义块编解码纯函数**：serialization.ts 加 encodeFrameDefinitions/decodeFrameDefinitions/encodeFrameDefinitionBlock + FrameDefinitionEntry。7 个新单测（往返/空集/utf8/大 json/block 前缀/超长/截断）。
  - **修了 plan 代码 bug**：plan 原代码 encode 把 frameIdLen+jsonLen 连续写前面（6 字节 header），但 spec §三.1 布局是 frameIdLen→frameId→jsonLen→json（jsonLen 在 frameId 后）。systematic-debugging 定位（诊断打印 encode/decode 偏移），修正 encode 顺序。
- **T2+T3（合并,IPC 强耦合）**：activate 写帧定义块 + read IPC。
  - recording-writer activate 加 frameDefinitions 参数,写 magic+帧定义块（resetStats 复用快照重写头）。
  - recording-service 持 frameReader,start() 取选中帧定义传入,加 listRecordingFiles/readRecordingFile 代理。
  - recording-handlers 加 handleListFiles/handleReadFile（fs 读 recordings/ 目录）。
  - **修了 plan 路径穿越防护 bug**：plan 原代码 `resolved.startsWith(dir)` 会误匹配 `/recordings-evil/` 前缀,改用 `dir + path.sep` 严格匹配目录内。
  - platform-bridge/preload/facade/feature-wiring 同步接线。
- **T4 recording-reader**：parseRecordingFileBytes（magic+帧定义块+帧记录）+ parseRecordingToFieldSeries（内嵌定义→字段时间序列）。10 个单测。
  - **修正 plan 易错点 #1**：ReceiveParsedFieldValue 属性名是 fieldId/fieldName/value,不是 plan 写的 f.id/f.name。
  - 顺带 FrameFieldSeries 加 frameName（R19,从内嵌帧定义取）。
- **T5 useHistoryData 重写**：数据源切 recording-reader,内部模型换新（mergeSeries/buildHierarchyFromSeries）。删 extractItemHierarchy/buildSeriesWithPoints（旧 StorageLocalRecord 函数）。
- **T6 HistoryPage 适配**：修 :15 拼写 bug,适配新签名,CSV 置灰（spec §5.4 本轮不做）。

### T7 回归 + 测试修复

全量 1901 passed / 11 failed。11 failed 全 S015 pre-existing baseline（event-truncation 1 + tcp-receive-datapath 4 + heartbeat-timer 5 + frame-service-state-selector 1）,0 新增代码回归。

- **scenario 10 fieldName resolution 集成测试重写**：旧测试用 StorageLocalRecord + 外部 frameReader lookup 机制（T5 数据源切换后过时）。重写为用 recording 序列化函数构造含内嵌帧定义的 .bin,验证 fieldName/frameName 从内嵌定义来（R19 不泄漏 raw id）。3/3 passed,R19 测试意图在新模型下仍成立。
- ftp-handlers suite fail：**环境性**（worktree 里 Electron 二进制安装问题,main 上 9/9 正常）,非代码回归。
- tsc src 0 新错（3 个 plugin-vue baseline）；lint 0 新增 error（7 个 pre-existing baseline,主仓库 main 同样 7 个）。

## 决策引用

- **D003**：新建。录制格式演进 RCD1+帧定义块（防漂移）+ History 读取层重写 + RCD2 路线失败记录。细化 D002 第 6 项"文件格式"。
- D002：加注（格式部分被 D003 细化,核心 8 项仍 active）。

## 范围确认

- 本轮在 scope boundary 内：是（History 查看录制是 S012 录制续接,topic-index:38 明确"下一轮:History 页改造消费 .bin"）。
- 不违反"明确不含"：CSV 导出不做（按钮置灰）、分层目录/索引块不做（自检否决）、SQLite 不做（D006）。

## 后续

- **用户实测发现 2 个 bug,已修（commit 0e1ea72,直接合 main）**：
  1. **HistoryPage loadData.value() 崩溃**：useHistoryData 返回的 loadData 是裸函数(非 ref),旧代码 `.value()` 解包是隐藏 bug——此前被 HistoryPage:15 拼写 bug(进页即崩)掩盖,H015 修了拼写 bug 后暴露。改 `history.loadData()`。**教训:修一个进页崩溃 bug 时,要检查被它掩盖的下游崩溃。**
  2. **录制配置改后没持久化(重启丢选帧)**：applyRecordingConfig 调了 setRecordingConfig(写内存)但漏调 persistDisplay()(写盘)。H014/S012 遗留 bug(注释写"落盘"但代码没落),此前录制未端到端用过未暴露。补 persistDisplay()。**教训:注释声称的行为要和代码核对。**
  两个 bug 都是代码层测试(Vitest)覆盖不到的——一个是 Vue 组件调用方式,一个是落盘时机接线。端到端手测才暴露。

- **待用户目标 Linux 机端到端手测**（必做,本轮最终判据）：
  1. 录几帧 → 确认 .bin 含帧定义块
  2. 进 History 页（确认不崩——拼写 bug + loadData.value 已修）
  3. 选时间范围 → 加载 → 选帧/字段 → 看曲线 → 确认数据正确
  4. 漂移测试：改帧定义后旧 .bin 仍正确解析
  5. 老 .bin（无帧定义块）被跳过不崩
  6. 录制配置改后重启仍记住选帧（持久化修复验证）
- **已知债务**：CSV 导出不支持新格式（本轮置灰,触发条件：用户明确需要导出时单独做一轮）；录制 S015 目标机实测（H014 遗留,本轮 T2 改了 activate 理论上不影响,仍待实测）。
