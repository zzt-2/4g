# [S005] 串口两个问题:配置项写死 + 打包后检测不到

> 2026-06-19 | 阶段:实施完成 | 状态:待用户目标机验证打包

## 目标

修复串口两个问题:① 配置项写死(数据位/停止位/校验位/流控从未到达 serialport)② 打包后别的电脑检测不到串口。以主对话子任务形式执行,完成后回主对话报告。

## 记录

### 调查:现状与任务描述的差异

任务预设了几件事,调查后部分修正:

1. **"补 4 个串口配置项" —— 部分已存在**。commit 9d35a5f 已经在 `types.ts`/`validation.ts`/`ConnectionSettings.vue`(系统设置页)做了类型 + UI 的半截。真正缺的是**透传链断在 3 处**(platform-bridge `SerialConnectConfig` 缺字段 / real-serial-adapter 重建丢字段 / serial-handlers `new SerialPort` 没传参),以及**新建弹窗 NewConnectionDialog 没这 4 字段**(只有系统设置页能改)。

2. **"看 ConnectionCard 或编辑入口" —— 应用没有编辑连接功能**。ConnectionCard 只有 connect/disconnect/remove/autoConnect,连接只能删了重建。已有的"编辑入口"是系统设置页的 ConnectionSettings.vue(走 service.connect→upsertConfig 持久化),它已适配 4 字段,无需改。

3. **"翻 f900cf31 看当时怎么修的" —— 该 commit 不存在**。真实修过串口枚举的是 `1c1a2aa`(fix: UI bug修复 + 串口枚举/删除/持久化全链路补全),当时补的是 composite-adapter 缺 discoverResources 委托 + 枚举加 try/catch。本次打包问题(原生模块 ABI)是另一回事,未混淆。

4. **serialport v13 API**(WebSearch 确认):dataBits 只支持 5-8(**不含 9**,任务原述"5-9"是通用标准,serialport 实际不接受 9);**流控拆成独立布尔 `rtscts`/`xon`/`xoff`,无单一 flowControl 字段**。

### 用户拍板(本轮)

- "不支持9就不加呗" → D005(dataBits 保持 5-8)
- "可以一起做,得是 devtool 控制台能看到的,不然那边看不见" → D006(打包修配置 + 诊断一起做;错误必须 renderer DevTools console 可见,因为目标机双击 exe 看不到 main console)

### 问题 1 实施:透传链补全 + 新建弹窗加字段

| 改动 | 文件 | 内容 |
|------|------|------|
| 类型 | platform-bridge.ts | SerialConnectConfig +4 可选字段(与 SerialTransportConfig 同形) |
| main | serial-handlers.ts | new SerialPort() 传 4 参数 + 新增 toFlowControlFlags()(语义→布尔) |
| 透传 | real-serial-adapter.ts | connect() 的 transport.connect() +4 字段 |
| UI | NewConnectionDialog.vue | 串口表单 +4 q-select + resetForm/onSubmit 同步 |
| fixture | connection-fixtures.ts | serialTransportConfigFixture +4 字段(8/1/none/none,匹配 normalize 默认) |

flowControl 转换(main 单点):hardware→{rtscts:true},software→{xon:true,xoff:true},none→{}。dataBits/stopBits/parity 直接传(undefined 时 serialport 用默认 8/1/none)。

### 问题 2 实施:打包修原生模块 + 错误透传 renderer devtool

| 改动 | 文件 | 内容 |
|------|------|------|
| 打包 | quasar.config.ts | npmRebuild: false → true |
| 打包 | package.json | postinstall 加 electron-rebuild -f -w serialport |
| 诊断 | serial-handlers.ts | 枚举失败 catch 改 throw(带 err.stack)+ 保留 console.error |
| 诊断 | ConnectionPage.vue | refreshResources 加 try/catch + console.error + notify.error |

错误透传路径选了 **throw + renderer try/catch**(签名不变,爆炸半径最小),否决了改返回契约 `{ports,error?}`(牵动多处签名)和推 transport:event error 事件(renderer 无消费者,要先建链)。详见 D006。

### 验证

- **connection feature 测试 65/65 通过**(含 connection-core spec 的 `toEqual(config)`,fixture 补字段后成立)。
- **serial-handlers.ts standalone tsc 0 错**(验证 new SerialPort 传参 + toFlowControlFlags 类型正确)。
- **项目 tsc -p(过滤 node_modules 噪音)0 错**(vue-tsc 1.8.27 与 TS 5.5.4 有兼容 bug 报 "Search string not found",是工具坏了非代码;改用 tsc + eslint 覆盖)。
- **eslint 改动文件 0 错**。
- **未验证**:本地 build(topic-index 记 EBUSY 文件锁环境问题)、目标机实测(必须用户做)。

### 关键事实(交接价值)

- serialport v13 流控无单一字段,拆 rtscts/xon/xoff 布尔 —— 以后任何动 serialport 流控的代码都要走 toFlowControlFlags 这层转换。
- renderer 端**当前无人订阅 transport 事件**(onEvent 无消费者),若以后要消费 data/error 事件需先建订阅链。
- IPC 用结构化克隆,标量字段(number/string/boolean)跨进程正常传,不用担心 JSON 丢字段。

## 决策引用

- D005(新建):串口 4 参数透传链补全 + flowControl 语义层抽象 + dataBits 不加 9
- D006(新建):打包 npmRebuild:true + 枚举失败 throw 透传 renderer devtool
- 无其他决策引用

## 范围确认

- 本轮是否在 scope boundary 内:**是**。topic "UI 与 Feature Bug 集中修复",串口配置项写死 + 打包检测是 feature bug 范畴。未触及"明确不含"。
- S 文件数 5 < 8,无通胀。

## 后续

- **必须用户验证**:在目标机跑打包版,确认串口能检测到(或至少在 renderer DevTools console 拿到具体错误)。这是 D006 已知债务的解除条件。
- **可选**:解除本地 EBUSY 文件锁后跑一次 `npm run build`,验证 .vue 编译 + 打包链路通。
- postinstall 加了 electron-rebuild,下次 `npm install` 会触发重编(可能慢几十秒),需告知协作者。
