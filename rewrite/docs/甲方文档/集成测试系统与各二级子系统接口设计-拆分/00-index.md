# 集成控制测试系统与各二级子系统接口设计 -- 拆分索引

> 源文档: `新甲方文档.md` (7455 行, V1.0.2)
> 拆分时间: 2026-05-18

## 文件清单

| 文件 | 接口数 | 说明 |
|------|--------|------|
| 01-概述与约定.md | - | 文档元信息、接口方案、文件约定、通用消息约定、用例脚本编码约定 |
| 02-设备管理.md | 5 | 设备列表查询/上报/查询(单个)/配置、子系统状态查询 |
| 03-用例管理.md | 7 | 用例查询/脚本上传/属性修改/脚本下载/新增菜单/新增/删除 |
| 04-任务管理.md | 3 | 测试任务下发、文件获取请求、任务执行控制 |
| 05-文件传输与结果上报.md | 3 | 测试数据文件上传完成、文件传输完成、测试结果通知 |
| 06-告警上报.md | 2 | 设备告警上报、子系统告警上报 |
| 07-参数配置与查询.md | 4 | 测试参数查询转发、测试参数配置转发、参数查询、用例参数配置 |
| 08-系统维护.md | 4 | 软件版本升级、心跳、重启、测试参数配置反馈 |
| 09-数据转发与实时上报.md | 3 | 数据转发、用例步骤上报(msgReport)、设备实时码流上报 |
| 10-附录.md | - | 请求接口模板、信源信宿地址编码、设备类型表 |

**总计: 31 个接口**

## 接口速查表

> 方向标记: [一级->二级] = 集成控制系统发给二级子系统; [二级->一级] = 二级子系统发给集成控制系统

### 核心接口 (4个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| setTestTask | 04-任务管理 | /api/task/setTestTask | [一级->二级] | 甲方下发测试任务，含资源、用例、执行计划、弧段信息 |
| controlTestTask | 04-任务管理 | /api/task/controlTestTask | [一级->二级] | 甲方控制任务执行（终止/暂停/继续/停止） |
| testCaseResultReport | 05-文件传输与结果上报 | /api/report/testCaseResultReport | [二级->一级] | 我们上报单个用例测试结果（成功/失败/待判断） |
| msgReport | 09-数据转发与实时上报 | /api/report/msgReport | [二级->一级] | 我们上报用例执行步骤进度（入网、呼叫、去注册等） |

### 设备管理 (5个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| getDeviceList | 02-设备管理 | /api/deviceInfo/getDeviceList | [一级->二级] | 查询子系统所有设备列表，支持文件方式上报 |
| deviceInfoReport | 02-设备管理 | /api/deviceInfo/deviceInfoReport | [二级->一级] | 二级主动上报设备信息变更 |
| getDeviceInfo | 02-设备管理 | /api/deviceInfo/getDeviceInfo | [一级->二级] | 按设备ID查询指定设备信息 |
| setDeviceInfo | 02-设备管理 | /api/deviceInfo/setDeviceInfo | [一级->二级] | 配置设备基本信息 |
| getSubSysState | 02-设备管理 | /api/subSystem/getSubSysState | [一级->二级] | 查询子系统运行状态及自检信息 |

### 用例管理 (7个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| getTestCaseAll | 03-用例管理 | /api/testCase/getTestCaseAll | [一级->二级] | 查询子系统所有测试用例（JSON文件传输） |
| testCaseFileUpload | 03-用例管理 | /api/testCase/testCaseFileUpload | [一级->二级] | 要求上传用例脚本文件 (TBD) |
| modifyTestCaseFile | 03-用例管理 | /api/testCase/modifyTestCaseFile | [一级->二级] | 修改用例属性 |
| testCaseFileDownload | 03-用例管理 | /api/testCase/testCaseFileDownload | [一级->二级] | 下载用例脚本文件 (TBD) |
| addTestCaseMenu | 03-用例管理 | /api/testCase/addTestCaseMenu | [一级->二级] | 新增用例菜单 (TBD) |
| addTestCase | 03-用例管理 | /api/testCase/addTestCase | [一级->二级] | 新增测试用例 (TBD) |
| deleteTestCase | 03-用例管理 | /api/testCase/deleteTestCase | [一级->二级] | 删除测试用例 (TBD) |

### 任务管理 (2个，不含核心接口)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| ccSysGetFileRequest | 04-任务管理 | /api/subSystem/ccSysGetFileRequest | [一级->二级] | 甲方获取子系统文件 (TBD) |

### 文件传输 (2个，不含核心接口)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| testDataFileTranslationComplete | 05-文件传输与结果上报 | /api/report/testDataFileTranslationComplete | [二级->一级] | 测试数据文件上传完成后上报（含测试报告文件格式定义） |
| fileTranslationComplete | 05-文件传输与结果上报 | /api/report/fileTranslationComplete | [二级->一级] | 非测试任务相关的通用文件传输完成上报 |

### 告警上报 (2个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| deviceAlarmReport | 06-告警上报 | /api/deviceInfo/deviceAlarmReport | [二级->一级] | 设备级告警上报 |
| subSysAlarmReport | 06-告警上报 | /subSystem/subSysAlarmReport | [二级->一级] | 子系统级告警上报 |

### 参数配置与查询 (4个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| testCaseGetParsForward | 07-参数配置与查询 | /testCase/testCaseGetParsForward | [二级->一级->二级] | 测试中参数查询转发 (TBD) |
| testCaseSetParsForward | 07-参数配置与查询 | /testCase/testCaseSetParsForward | [二级->一级->二级] | 测试中参数配置转发 (TBD) |
| getPars | 07-参数配置与查询 | /testCase/getPars | [一级->二级] | 查询子系统参数 |
| setPars | 07-参数配置与查询 | /testCase/setPars | [一级->二级] | 配置子系统参数（含心跳周期配置） |

### 系统维护 (4个)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| softwareUpgrade | 08-系统维护 | /subSystem/softwareUpgrade | [一级->二级] | 软件版本升级（FTP下载） |
| heartbeat | 08-系统维护 | /subSystem/heartbeat | [双向] | 心跳链路监视，默认15秒 |
| neControl | 08-系统维护 | /subSystem/neControl | [一级->二级] | 子系统/设备 开机、关机、重启 |
| parsSetFeedback | 08-系统维护 | /subSystem/parsSetFeedback | [一级->二级] | 参数配置生效反馈 (TBD) |

### 数据转发与实时上报 (2个，不含核心接口)

| method | 所属文件 | URL | 方向 | 简要说明 |
|--------|----------|-----|------|----------|
| dataTransmit | 09-数据转发与实时上报 | /subSystem/dataTransmit | [一级->二级] | 数据转发（异步命令结果或文件） |
| sigReport | 09-数据转发与实时上报 | /api/report/sigReport | [二级->一级] | 设备实时码流上报（增量信令数据） |

## TBD 接口清单

以下接口标记为 TBD，实现优先级低：

1. testCaseFileUpload -- 用例脚本文件上传
2. testCaseFileDownload -- 用例脚本文件下载
3. addTestCaseMenu -- 新增用例菜单
4. addTestCase -- 新增用例
5. deleteTestCase -- 删除用例
6. ccSysGetFileRequest -- 集成控制系统文件获取请求
7. testCaseGetParsForward -- 测试参数查询转发
8. testCaseSetParsForward -- 测试参数配置转发
9. parsSetFeedback -- 测试参数配置反馈
