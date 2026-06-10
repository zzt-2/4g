# Northbound 入站接口补全 + FTP 基础设施

> 状态: ready-for-impl | 创建: 2026-06-10

## Context

甲方 V1.0.4 接口文档共 31 个接口。当前已实现 4 个入站（setTestTask、controlTestTask、heartbeat、getSubSysState）+ 9 个出站 translator + auth + heartbeat timer + mock task 执行。

联调前需补全所有**非 TBD 入站接口**的 stub handler，其中 getTestCaseAll 需要 FTP 上传能力（当前 platform 层完全无 FTP）。

## 缺失接口清单

### 需补 stub handler（7 个）

| 接口 | 响应类型 | Mock 内容 |
|------|---------|----------|
| getDeviceList | 返回设备列表（含 datas 数组） | 1 个 mock 激光设备 |
| getDeviceInfo | 返回指定设备信息（含 datas 数组） | 同上，按 deviceIds 过滤 |
| setDeviceInfo | 标准信封成功响应 | buildResponse |
| getPars | 返回参数值（含 pars 数组） | 空参数值 |
| setPars | 标准信封成功响应 | buildResponse |
| dataTransmit | 标准信封成功响应 | buildResponse |
| neControl | 标准信封成功响应 | buildResponse |

### 需 FTP 基础设施（1 个）

| 接口 | 说明 |
|------|------|
| getTestCaseAll | 收到请求 → 构造用例 JSON 文件 → FTP 上传到甲方 → 回复信封成功 |

### 可跳过（TBD）

testCaseFileUpload/Download、addTestCaseMenu、addTestCase、deleteTestCases、modifyTestCase、testParamConfigFeedback、softwareUpgrade

---

## 涉及文件

| 文件 | 动作 | 说明 |
|------|------|------|
| `northbound/core/types.ts` | 扩展 | 新增 8 个入站请求类型 |
| `northbound/services/northbound-service.ts` | 扩展 | 8 个 handler + 路由 + mock 数据 |
| `northbound/index.ts` | 更新 | 导出新类型 |
| `shared/platform-bridge.ts` | 扩展 | 新增 FtpBridge 接口 + 'ftp' capability |
| `platform/ftp.ts` | 新建 | renderer 侧 FTP facade（与 http.ts 同模式） |
| `src-electron/main/ftp-handlers.ts` | 新建 | main 进程 FTP client（用 basic-ftp） |
| `src-electron/main/index.ts` | 小改 | 注册 FTP IPC handler |
| `src-electron/preload/` | 小改 | 暴露 FtpBridge typed API |
| 测试文件 | 更新+新增 | stub handler 测试 |

### 不改

- 已有出站 translator、auth、heartbeat-timer
- task/send/receive/result/report feature 核心逻辑
- platform http facade

---

## 甲方文档响应格式

以下为每个接口的完整响应字段，从 V1.0.4 文档摘录。**必须严格对齐字段名和类型**。

### getDeviceList

请求：标准信封，无额外字段。

响应（信封 + 业务字段）：
- `fileReport`: boolean, 可选, false = 数据在响应里返回
- `datas`: 设备数组，每项含：
  - `name` (string), `deviceId` (string), `type` (string), `swVer` (string, 必填), `status` (string, 枚举: online/offline/alarm/error/busying/available)
  - 可选: `ip`, `port`, `phoneNumber`, `imsi`, `departments`, `position`, `manufacturer`, `antennaManu`, `antennaType` (1-4), `remark`
  - `pars`: 参数数组 `[{ parId, parName, value, unit }]`

### getDeviceInfo

请求：信封 + `deviceIds`: string[]。

响应：信封 + `datas`: 设备数组（同 getDeviceList 的设备项）。

### setDeviceInfo

请求：信封 + `deviceData`: 设备对象（含 `deviceId` 等字段）。

响应：标准信封响应（statusCode + msg）。

### getPars

请求：信封 + `taskId?` (string) + `imsi?` (string) + `parIds`: string[]。

响应：信封 + `imsi?` (string) + `pars`: `[{ parId: string, value: string }]`。

### setPars

请求：信封 + `taskId?` + `imsi?` + `pars`: `[{ parId, value }]`。

响应：标准信封响应。

### dataTransmit

请求：信封 + `msgList`: `[{ data: { relationId, statusCode, statusMsg?, msgValue?, filePath? } }]`。

响应：标准信封响应。

### neControl

请求：信封 + `neType`: 'sys' | 'device' + `optType`: 'powerOn' | 'powerOff' | 'restart' + `deviceId`: string[]。

响应：标准信封响应。

### getTestCaseAll

请求：信封 + `ftpInfo?`: `{ ip?, port?, username?, password?, dir? }`。

HTTP 响应：标准信封响应。

FTP 文件：JSON 文件，根结构 `{ datas: [...] }`，每项为菜单或用例：
- 菜单：`{ name, id, isParent: true, children: [...], type: '', runSubSys: '', ... }`
- 用例：`{ name, id, isParent: false, type: 'land', runSubSys: 'ADS', durate: 60, execSteps: '...', children: [], ... }`

---

## 实施步骤

### Step 1: types.ts 扩展

新增 8 个入站请求类型（GetDeviceListRequest、GetDeviceInfoRequest、SetDeviceInfoRequest、GetParsRequest、SetParsRequest、DataTransmitRequest、NeControlRequest、GetTestCaseAllRequest）。

遵循现有类型风格：readonly、extends InboundEnvelope 或包含相关字段。

### Step 2: northbound-service.ts — 7 个 stub handler

#### 2.1 路由扩展

knownPaths 新增 8 条：getDeviceList、getDeviceInfo、setDeviceInfo、getPars、setPars、dataTransmit、neControl、getTestCaseAll。

#### 2.2 Mock 数据常量

```ts
const MOCK_DEVICE = {
  name: '激光通信终端',
  deviceId: 'ADS_LCT_01',
  type: 'LCT',
  ip: '192.168.1.100',
  swVer: 'V1.0.0',
  status: 'online' as const,
  pars: [],
};

const MOCK_TEST_CASES = {
  datas: [{
    name: '激光链路测试', id: 'ADS_MENU_01', isParent: true,
    type: '', runSubSys: '', depSubSys: '', depSubNe: '',
    durate: 0, execSteps: '', remark: '',
    inputPars: [], preHandle: [], afterHandle: [],
    children: [{
      name: '激光通信测试', id: 'ADS_TC_001', isParent: false,
      type: 'land', runSubSys: 'ADS', depSubSys: '', depSubNe: '',
      durate: 60, execSteps: '1.发送帧;2.接收帧;3.校验结果',
      remark: 'Mock 测试用例',
      inputPars: [], preHandle: [], afterHandle: [],
      children: [],
    }],
  }],
};
```

#### 2.3 各 handler

- **getDeviceList**: `{ ...buildResponse(envelope, 1, 'ok'), fileReport: false, datas: [MOCK_DEVICE] }`
- **getDeviceInfo**: 按 `deviceIds` 过滤 MOCK_DEVICE，返回 `{ ...buildResponse, datas: [...] }`
- **setDeviceInfo**: `buildResponse(envelope, 1, 'ok')`
- **getPars**: `{ ...buildResponse(envelope, 1, 'ok'), imsi: '', pars: parIds.map(id => ({ parId: id, value: '' })) }`
- **setPars**: `buildResponse(envelope, 1, 'ok')`
- **dataTransmit**: `buildResponse(envelope, 1, 'ok')`
- **neControl**: `buildResponse(envelope, 1, 'ok')`

#### 2.4 switch 路由

每个接口加 case。POST 接口加 `req.method !== 'POST'` 守卫（参考现有 setTestTask 模式）。

### Step 3: FTP 基础设施

#### 3.1 Bridge 接口

`shared/platform-bridge.ts` 新增 FtpBridge interface + 'ftp' capability。

```ts
interface FtpBridge {
  uploadFile(config: FtpUploadConfig): Promise<void>;
}

interface FtpUploadConfig {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly remotePath: string;
  readonly content: string;  // 文件内容（字符串）
}
```

#### 3.2 Platform facade

`platform/ftp.ts` — 与 http.ts 同模式，创建 FtpFacade。

#### 3.3 Main 进程

`src-electron/main/ftp-handlers.ts` — 使用 `basic-ftp` npm 包实现 uploadFile。

`src-electron/main/index.ts` — 注册 FTP IPC handler。

`src-electron/preload/` — 暴露 FtpBridge typed API。

#### 3.4 依赖

```bash
pnpm -C rewrite add basic-ftp
```

### Step 4: getTestCaseAll handler

handler 收到请求后：
1. 构造 mock 用例 JSON
2. 如果 ftpInfo 有 ip，通过 ftpFacade 上传到 FTP
3. 上传失败返回 statusCode: 2
4. 返回标准信封响应

NorthboundServiceOptions 新增 `ftpFacade: FtpFacade`。

### Step 5: feature-wiring 更新

`runtime/feature-wiring.ts`：导入并传入 ftpFacade 给 createNorthboundService。

### Step 6: 测试

- 新增 inbound handler 测试覆盖 8 个新 handler
- FTP upload mock 测试（getTestCaseAll 成功/失败路径）
- 更新现有测试适配新的 service options（ftpFacade 参数）

### Step 7: 验证

```bash
pnpm -C rewrite build
pnpm -C rewrite lint
pnpm -C rewrite test
```

---

## 规范合规

| 规则 | 约束 | 计划是否合规 |
|------|------|------------|
| R5 | FTP facade 在 platform/，FTP 实现在 main，业务逻辑在 northbound | 合规 |
| R10 | northbound 是外部投影边界，读内部事实但不写内部状态 | 合规（stub 只读 mock 数据） |
| R11 | 结果/报告/交付分离，上传失败不改写内部结果 | 合规 |
| R14 | 显式 DI（ftpFacade 通过 options 注入） | 合规 |
| R3 | core/ 纯 TS，无 Vue/Pinia/Electron 依赖 | 合规 |

FTP 上传失败的处理（返回 statusCode: 2）是业务语义，在 northbound 层决定，不在 main 的 FTP handler 里。

---

## Mock vs Permanent 边界

| 代码 | 永久 / Mock | 替换时机 |
|------|------------|---------|
| 入站路由 + 信封解析 | 永久 | — |
| buildResponse / jsonResponse | 永久 | — |
| translateTestCaseToMockTaskDefinition | Mock | 接入真实设备后换 translateTestCaseToTaskDefinition |
| MOCK_DEVICE | Mock | 接入真实设备后从 device feature 取 |
| MOCK_TEST_CASES | Mock | 有真实用例定义后替换 |
| getPars/setPars 空实现 | Mock | 有真实参数模型后替换 |
| neControl 空实现 | Mock | 有真实设备控制后实现 |
| dataTransmit 空实现 | Mock | 有真实异步命令流后实现 |
| FTP facade + main handler | 永久 | — |
| getTestCaseAll handler 逻辑 | 永久 | — |
| Auth / heartbeat / 出站 translator | 永久 | — |

---

## 直接合同

实施对话以此文档 + 以下文件为直接合同：

1. **本文档**: `codestable/features/rewrite-northbound/northbound-stubs-and-ftp-design.md`
2. **甲方接口文档**: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md`
3. **甲方控制接口规范**: `refactor/docs/甲方文档/集成系统控制接口规范V1.0.md`
4. **现有代码**:
   - `rewrite/src/features/northbound/services/northbound-service.ts`
   - `rewrite/src/features/northbound/core/types.ts`
   - `rewrite/src/features/northbound/core/inbound-translator.ts`
   - `rewrite/src/shared/platform-bridge.ts`
   - `rewrite/src/platform/http.ts`（FTP facade 参照此模式）
   - `rewrite/src-electron/main/http-handlers.ts`（FTP handler 参照此模式）
   - `rewrite/src/runtime/feature-wiring.ts`

### 边界护栏

- `codestable/quality/rewrite-quality-rules.md` — R5/R10/R11/R14/R3
- `codestable/architecture/rewrite-target-structure.md` — platform facade 模式 + main 进程职责
- `.sessions/2026-05-18-northbound-integration/topic-index.md` — 已确认决策和架构约束
