# S017 — getTestCaseAll 契约对齐 + setTestTask 三段 bug 闭环修复

**日期**:2026-06-24
**分支**:main(3 commit:1a1b2e1 → c97a714 → 1655f88)
**性质**:联调暴露的连环 bug。getTestCaseAll↔setTestTask 完整闭环此前从未真正跑通过(前几轮 S013-S016 把 login/heartbeat/FTP/持久化都打通了,但 setTestTask 实际下发任务这一步从没成功执行过真实用例),本轮一次性补完闭环上残留的三处断裂。

---

## 0. 起点

用户在离甲方近的联调机器上跑 `pnpm dev`,触发 getTestCaseAll + setTestTask 联调。甲方日志显示用例文件读到了但**一个用例都没落库**(`insertCases=0`),setTestTask 下发后我方**任务不执行**。逐层排查,发现是**三个独立 bug 串联**,必须依次修完闭环才通。

> 本轮全程由另一台机器(非治理体系维护机)的会话推进代码改动 + commit/push(走代理 127.0.0.1:7897)。这台机器负责联调实测。`.sessions/` 治理文档由本会话应用户明确授权后补记(避免与治理机同步冲突)。

---

## 1. Bug 一:getTestCaseAll 文件字段名不符甲方 CaseInfoNode 契约(1a1b2e1)

### 现象
甲方 `platform-admin` 定时 worker 从 FTP 读我方上传的 `testcase_all.json`,反序列化成 `CaseInfoNode` 树,`syncCaseTree` 落库。日志:
```
开始同步用例树: subSysId=..., rootCount=6          ← 读到 6 个根节点,文件读通了
用例树同步完成: insertMenus=0, updateMenus=0,
  insertCases=0, updateCases=0, insertParams=0...   ← 全是 0!一个没落库
```

### 根因(反编译铁证)
另一对话反编译甲方 `CaseSyncImportServiceImpl` + `syncNode` 字节码,还原判定逻辑:
```java
private void syncNode(..., CaseInfoNode node, ...) {
    if (StringUtils.isBlank(node.getId())) {
        if (node.getChildren() == null || node.getChildren().isEmpty()) {
            return;   // ← 我方 6 个节点全死在这里
        }
        for (child : node.getChildren()) syncNode(..., child, ...);
        return;
    }
    if (Boolean.TRUE.equals(node.getIsParent())) { saveMenu(...); ... }
    else { saveCase(...); ... }
}
```
**第一关:`node.id` 空 → 且无 children → 直接 return。** 我方 JSON 字段名是 `outCaseId`(非 `id`)、`caseName`(非 `name`)、`caseType`(非 `type`),fastjson2 未知字段静默丢弃 → `getId()` 永远 null → 全跳过。

### 甲方 DTO 契约(CaseInfoNode,反编译)
统一树形节点,`isParent:true`=菜单 / `false`=用例。字段:`id`(★业务唯一标识)、`name`、`isParent`(★)、`type`、`runSubSys`、`depSubSys`、`depSubNe`、`durate`、`satelliteCount`、`stationCount`、`execSteps`、`checkPoints`、`remark`、`inputPars`(CaseInfoInputPar)、`preHandle`/`afterHandle`/`fileHandle`、`children`(递归)。

`CaseInfoInputPar` = `{cnName, parId, type, defaultValue, unit, remark}`(富结构,与 setTestTask 下发的简单 `{parId,value}` 是两回事)。

### 三个关键决策(用户拍板)
1. **结构:树形 vs 扁平** → 选**树形**(`datas` 顶层一个 `isParent:true` 菜单节点,用例作 children)。反编译确认扁平也行(无菜单甲方自动归"未分组" `UNGROUPED_MENU_NAME`),但树形更贴文档示例、甲方能看到分组名。
2. **runSubSys 填什么** → 复用 `config.subSysId`(值 JG)。我方无"系统分类表",文档示例 ADS 是别的子系统,语义不能照搬。
3. **inputPars 描述字段(cnName/type/unit/remark)填什么** → 兜底填充。我方 send step 的 userFieldValues 是纯标量,frame 资产里也没 unit/cnName,**无任何元数据来源**。故:parId 走 path(decode 反查键不能变)、cnName 取 path 末段、defaultValue 取当前值、其余空串。

### decode 闭环保护(关键不变量)
`id` 必须放 outCaseId(=templateId@reportedAt)。因为:
- encode:outCaseId 存进 `ReportedSnapshot.outCaseId`,save 到 storage(key=outCaseId)
- 甲方把文件 `id` 当 `testCaseId` 下发回来
- decode:`load(testCaseId)` 反查 → **必须 id=outCaseId 闭环才不断**

所以 decode/storage 完全不动,只改 encode 的字段名。

### 实施(6 文件)
- `core/types.ts`:`CustomerTestCase` 重定义(id/name/type/runSubSys/children,删节点级 subSysId/subSysName/menuId/menuName);新增 `CaseInfoInputPar`;新增 `CustomerTestCaseMenu`(菜单层);`NorthboundTestCaseConfig` 加 `runSubSys`
- `core/testcase-sync-translator.ts`:encode 用例节点字段重命名(id←outCaseId, name←templateName, type←caseType);inputPars 生成 CaseInfoInputPar 兜底;children:[]。snapshot/decode 一字不动
- `services/northbound-service.ts`:getTestCaseAll 把用例数组包进菜单节点 `{datas:[{id:menuId,name:menuName,isParent:true,children:[...]}]}`;deriveTestCaseConfig 加 runSubSys
- `command-ingress/components/docking-labels.ts`:`DEFAULT_DOCKING_CONFIG` 填真实对接环境值(10.15.5.93 / ftpuser / 凭据等)——用户明确决定写进默认值并提交(⚠️ 真实 FTP/登录凭据进了 git 历史,见末尾风险项)
- 2 个 spec 更新断言(树形 + 新字段名)

### 验证
translator spec 12/12,northbound-service spec 42/42,全量 1595/9(9 失败全 pre-existing:nanoid 缺失 + heartbeat 5 + 性能 2 + 时序 2,无新增)。

---

## 2. Bug 二:setTestTask 的 executionPlan.nodes 对象格式未解析(c97a714)

### 现象
Bug 一修好后甲方成功落库 + 下发 setTestTask(证明 encode 对了)。但我方收到 setTestTask 后**完全没反应**——任务一个都没创建。

### 根因(报文铁证)
04-任务管理.md L353 规定 `executionPlan.layers[].nodes` 是**纯字符串数组**(示例 `"nodes": ["TC-TLM-001"]`),我方据此实现 `resolveNode(node: string)`。但甲方**实际下发的是对象数组**:
```json
"nodes": [
  { "id": "c2b43266-...@1782291730690", "name": "1540波长测试 - 5G RS", "type": "case" }
]
```
`resolveNode` 把对象当字符串查 Map → 永远 undefined → `if(!tc) continue` 全部跳过 → 任务零创建。

**责任方**:甲方实现偏离自己的文档(契约漂移)。我方代码原本完全合规。

### 决策
工程兜底(等甲方改文档+改实现+部署周期太长,联调会一直卡)。`resolveNode` 兼容两种 node——字符串直接用、对象取 `.id`。任一方回退都不受影响。同时保留对文档字符串格式的支持。

### 实施(4 文件)
- `core/types.ts`:新增 `ExecutionPlanNode{id,name,type}`;`ExecutionPlanLayer.nodes` 改联合类型 `(string | ExecutionPlanNode)[]`
- `services/northbound-service.ts`:`resolveNode` 改为 `typeof node === 'string' ? node : node.id`
- `index.ts`:导出 ExecutionPlanNode
- `northbound-service.spec.ts`:新增用例复现真实联调报文(对象格式 nodes,多层),断言用例被正确创建启动;原字符串格式用例保留

### 验证
northbound-service spec 43/43(新增 1 个对象 node 用例)。

### 契约对齐(另说)
工程兜底是过渡保险,不替代契约澄清。用户手上有文档(L353 字符串)vs 实际报文(对象)的铁证,可拿去让甲方明确 nodes 到底该用哪种、统一文档与实现。

---

## 3. Bug 三:setTestTask snapshot missing —— reportedSnapshotStorage 未接线(1655f88)

### 现象
Bug 二修好后任务被正确创建启动了,但每个都报:
```
[northbound] snapshot missing for c2b43266-... - using placeholder (will not execute real task)
```
任务用的是 `createPlaceholderFailDefinition`(一个设计成立即 fail 的占位),所以"一收到就停止"、`testCaseResultReport` 上报的是空壳结果。

### 根因(接线遗漏)
`feature-wiring.ts:188` 构造 northboundService 时**漏传 `reportedSnapshotStorage`**(options 里的可选字段 `reportedSnapshotStorage?`)。后果:
- getTestCaseAll 的 encode:`options.reportedSnapshotStorage?.save(snapshot)` → 可选链短路 → **快照根本没持久化**
- setTestTask 的 decode:`options.reportedSnapshotStorage?.load(testCaseId)` → 可选链短路 → 永远 undefined → snapshot missing

**测试里都显式 `createReportedSnapshotStorage()` 传入(故单测全过),唯独生产 wiring 漏接。** 典型"接线遗漏"——和 S014 第一层根因(testCaseConfig 漏接线)同病:可选字段 + 单测手动传值 + runtime wiring 漏接 = 静默失败。

> 排查插曲:初判为 snapshot missing 后加了 3 条诊断日志(decode 后 dump steps、missing 时 dump loadAll、task started 后 dump lifecycle),实测确认:① 重新 getTestCaseAll 后 snapshot 不再 missing(说明接线生效)② decode 出真实 27 步 definition ③ lifecycle:running。诊断日志用完即撤(git checkout 回 HEAD)。

### 实施(2 文件)
- `northbound/index.ts`:导出 `createReportedSnapshotStorage` + 类型
- `runtime/feature-wiring.ts`:创建 `reportedSnapshotStorage`(默认 localStorage,renderer 进程可用;无 localStorage 环境退化空 storage)并传入 createNorthboundService

### 验证
feature-wiring spec 14/14,northbound-service spec 43/43。

### 联调实测(闭环验证通过)
修完后实测:6 个用例下发,setTestTask 报文 testCaseId = `templateId@reportedAt`(=文件 id=快照反查键)。日志:
```
[northbound] decode from snapshot OK for c2b43266-... | steps: 27 | schedule: immediate | errorPolicy: {"onFailure":"stop"}
[northbound] task started task-inst-1 | lifecycle: running | error: (none)
```
27 步真实流程(1540 波长测试:mod off → txm off → lo off → cooldown → comm-tx-cfg → ... → comm-rx-reset)正常执行,结果实时回传甲方。**串行编排验证**:6 个用例分 6 层,layer 1 跑完(或被停)才进 layer 2,符合 `processLayers` 逐层串行设计。

---

## 4. 三段闭环总览

| commit | bug | 现象 | 根因 |
|---|---|---|---|
| 1a1b2e1 | encode 字段名不符 CaseInfoNode 契约 | insertCases=0,用例没落库 | outCaseId/caseName/caseType vs id/name/type + 扁平结构 |
| c97a714 | executionPlan.nodes 对象格式未解析 | setTestTask 没反应,任务零创建 | 文档说字符串,甲方实现发对象;resolveNode 把对象当字符串查 |
| 1655f88 | reportedSnapshotStorage 未接线 | snapshot missing,跑占位 fail 任务 | feature-wiring 漏传可选字段,单测手动传值掩盖 runtime gap |

三段连起来才是 `getTestCaseAll`(上报用例)↔ `setTestTask`(下发任务)的完整闭环。前几轮(S013-S016)把 login/heartbeat/FTP/持久化都打通了,但 setTestTask 实际下发执行真实用例这一步**此前从未跑通过**,本轮补完。

---

## 5. 教训

1. **可选字段 + 单测手动传值 = 静默失败的温床**。S014(testCaseConfig)和本轮 bug 三(reportedSnapshotStorage)同病:`options.xxx?` 可选 + `?.` 短路 + 单测显式传值 → runtime wiring 漏接时既不报错也不过测试。对策:wiring 时的必填依赖不该做成可选,或加 wiring 完整性自检。
2. **甲方文档 ≠ 甲方实现(契约漂移)**。bug 二的铁证:文档 L353 写字符串,实际报文发对象。我方按文档合规却被坑。对策:工程兜底(兼容多种格式)+ 攒证据找甲方对齐,两条腿走。
3. **联调是唯一真相**。前几轮单测全过但 setTestTask 从没真跑过,连环 bug 直到联调才暴露。单测覆盖的是"我方逻辑自洽",覆盖不了"我方 vs 甲方契约契合"。
4. **反编译是契约争议的终审**。bug 一靠反编译 syncNode 字节码一锤定音(不是猜,是看甲方实际怎么判 id/isParent)。

---

## 6. 顺带处理 / 遗留

- **nanoid 缺失**(`main` pre-existing bug):`command-log.ts` import nanoid 但 package.json 漏声明,导致 dev 模式 resolve 失败 + 16 个 spec 收集失败。用户自己 `pnpm add nanoid@3.3.11` 修复(node_modules 早有该包,只补声明)。**改动(package.json + pnpm-lock.yaml)未提交**,留用户单独 commit。
- **electron 二进制缺失**:`pnpm dev` 报 `Electron failed to install correctly`。根因 postinstall 从 GitHub 下二进制被墙(ECONNRESET)。解法:curl 走代理 7897 下载 electron-v35.1.3-win32-x64.zip(120MB)→ 手动解压到 `node_modules/electron/dist/` → 生成 path.txt(内容 `electron.exe`,注意 index.js 会自动拼 `dist/` 前缀,别写成 `dist\electron.exe` 否则 `dist\dist\`)。⚠️ 手动装的,`pnpm install` 重装依赖会复发,需重走代理 install。
- **node 不在持久 PATH**:node 装在便携目录 `~/dev/tools/node22/`,从没写进注册表 PATH(但 winget 那份 `OpenJS.NodeJS.22_.../node-v22.23.1-win-x64` 已在用户 PATH 注册表里)。非派生的新终端能用,旧会话派生的 shell 找不到。未改持久 PATH(用户决定保持便携)。
- **真实凭据进 git 历史**:DEFAULT_DOCKING_CONFIG 写了 10.15.5.93 / ftpuser / `ABCXYZ123!@#` / 登录密码 `f6c230cb...` 并已 push origin/main。GitHub 已提示该仓库 89 个 dependabot 漏洞。⚠️ 若仓库公开,建议评估轮换凭据。
- **诊断日志已撤**:bug 三排查时加的 3 条临时日志(decode dump / loadAll dump / lifecycle dump)已 `git checkout HEAD` 撤掉,未提交。

## 7. 后续可优化(未做)
- errorPolicy `onFailure:stop` 在 27 步长流程里一停全停,可能需 continue / 重试策略
- send 步骤是否真把指令发到激光设备(还是 mock),决定联调是否"真执行"
- 运行监控 UI 对终态任务的过滤(曾致"丢一个"错觉)
