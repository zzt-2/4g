# Handoff: TestReport 生成 + FTP 上传

> 来源: S006 + 报告链路分析 | 交接目标: 补齐 TestReport.json 生成 + FTP 上传 + testDataFileTranslationComplete 通知甲方
> 文件名: H004-test-report-handoff.md

## 已完成边界

- northbound service 12 入站 + 9 出站 + auth + heartbeat + FTP 全部就绪
- testCaseResultReport（快速 verdict）已实现
- msgReport（步骤进度）已实现
- FTP 基础设施已实现（platform FtpFacade + main process basic-ftp + bridge）
- task 执行链路：createTask → startTask → onSettled → reportTaskResult 已接线

## 不要做什么

- 不改 send/receive 帧结构（那边独立做）
- 不改已有的 testCaseResultReport、msgReport 逻辑
- 不改 auth、heartbeat、inbound handler
- 不引入 Vue/Pinia/Electron 依赖到 core/
- 不等帧数据——报告内容先用 mock 数据占位，后续帧结构做好了再接

## 必读

1. **本 handoff**

2. **甲方报告格式** — `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md`
   - 05-文件传输与结果上报：TestReport.json 完整结构
   - testDataFileTranslationComplete 接口（报告上传后通知甲方）

3. **甲方控制接口规范** — `refactor/docs/甲方文档/集成系统控制接口规范V1.0.md`
   - testDataFileTranslationComplete 的出站 URL

4. **现有出站 translator** — `rewrite/src/features/northbound/core/outbound-translator.ts`
   - 已有 translateTestDataFileComplete 函数（但需要确认字段是否对齐最新报告格式）

5. **现有 service** — `rewrite/src/features/northbound/services/northbound-service.ts`
   - reportTestDataFileComplete 方法已存在
   - reportTaskResult 方法（任务完成后触发点）

6. **FTP facade** — `rewrite/src/features/northbound/services/northbound-service.ts`
   - FtpFacade / FtpUploadConfig 接口
   - getTestCaseAll handler 中的 FTP 上传模式可参考

7. **激光接口信息表** — `激光与集成控制系统接口信息表20260507v1.md`（项目根目录）
   - 22 个上报字段的枚举值和数据类型
   - mock 报告数据应该基于这些字段来编

8. **规范** — `codestable/quality/rewrite-quality-rules.md`（R10/R11）

## 需要讨论再决定的内容

1. **报告触发时机**
   - 方案 A：task settled 后自动生成报告 + 上传 FTP + 通知甲方
   - 方案 B：task settled 后只发 verdict，报告手动触发或定时批量
   - 建议方案 A（简单、链路完整）

2. **TestReport.json 里的 mock 数据**
   - checkPoints 应该填什么检查项？基于激光接口信息表的建议：
     - 上电状态 → expectValue: "已上电", testValue: "0x0001"
     - 载波同步锁定 → expectValue: "锁定", testValue: "0x0001"
     - 帧同步锁定 → expectValue: "锁定", testValue: "0x0001"
     - 误码率 → expectValue: "<1%", testValue: "0.2%"
   - processAndDatas 每步应该填什么？建议：
     - stepName: "发送帧" / "接收帧" / "校验结果"
     - resultDatas: 基于上报字段填 mock 值
   - 这些 mock 数据后面要换成真实帧数据，所以**数据结构要对，值可以假**

3. **报告存放位置**
   - 生成的 JSON 先写到哪？内存里直接 FTP 上传？还是先存本地文件再上传？
   - 建议：内存构造 JSON → FTP 上传 → 不存本地（简单）

4. **与现有 reportTestDataFileComplete 的关系**
   - 已有 `reportTestDataFileComplete` 方法和 `translateTestDataFileComplete` translator
   - 需要确认 translator 的输出字段是否对齐 TestReport.json 上传后的通知格式
   - 可能需要调整 translator 或新增 TestReport 生成函数

## 甲方 TestReport.json 完整结构（必读）

```json
{
  "subSysType": "ADS",
  "subSysId": "ADS_12345678",
  "sessionId": 45687,
  "taskId": "T_001",
  "startTime": "2023-07-03 10:20:34",
  "endTime": "2023-07-03 10:20:34",
  "result": "success",
  "msg": "ok",
  "testCaseList": [
    {
      "testCaseId": "ADS_TC_001",
      "resources": [],
      "deviceIds": ["ADS_LCT_01"],
      "startTime": "2023-07-03 10:20:34",
      "endTime": "2023-07-03 10:20:35",
      "checkPoints": [
        {
          "checkPoint": "上电状态",
          "expectValue": "已上电",
          "testValue": "0x0001",
          "result": "通过",
          "msg": ""
        },
        {
          "checkPoint": "载波同步锁定",
          "expectValue": "锁定",
          "testValue": "0x0001",
          "result": "通过",
          "msg": ""
        }
      ],
      "statisticsItems": [],
      "attachItems": [],
      "result": "success",
      "msg": "ok",
      "judgmentMsg": "",
      "processAndDatas": [
        {
          "stepName": "发送帧",
          "initPars": {},
          "setPars": {},
          "resultDatas": { "发送速率": "5Gbps(QPSK)", "发送帧计数": "100" },
          "startTime": "2023-07-03 10:20:34",
          "endTime": "2023-07-03 10:20:35"
        },
        {
          "stepName": "接收帧",
          "initPars": {},
          "setPars": {},
          "resultDatas": { "接收速率": "5Gbps(QPSK)", "载波同步": "锁定", "帧同步": "锁定" },
          "startTime": "2023-07-03 10:20:34",
          "endTime": "2023-07-03 10:20:35"
        }
      ],
      "testParsInfo": []
    }
  ],
  "taskDatas": []
}
```

## testDataFileTranslationComplete 通知格式

报告上传到 FTP 后，调用此接口通知甲方：

```json
{
  "method": "testDataFileTranslationComplete",
  "requestId": 34593,
  "subSysType": "ADS",
  "subSysId": "ADS_001",
  "sessionId": 45687,
  "taskId": "T_001",
  "result": "success",
  "msg": "",
  "testCaseId": ["ADS_TC_001"],
  "ftpServerIP": "192.168.5.2",
  "fileType": "TestReport",
  "filePath": "/ftproot/ADS/reports/TestReport_T001.json"
}
```

## 实施建议步骤

1. **新建 report generator** — `northbound/core/report-generator.ts`
   - 纯函数：输入 task 实例 + mock 数据配置 → 输出 TestReport JSON 字符串
   - mock 数据可配置（checkPoints、processAndDatas 内容）
   - 后续换成真实数据时只改这个文件

2. **service 层接线** — 在 `reportTaskResult` 后追加：
   - 生成 TestReport.json（调用 report generator）
   - FTP 上传（调用 ftpFacade）
   - 调用 reportTestDataFileComplete 通知甲方
   - 上传失败不影响 verdict 上报（R11：交付失败不改写内部结果）

3. **Mock 数据配置** — 硬编码一份基于激光接口信息表的合理 mock
   - 和用户确认 checkPoints 内容
   - processAndDatas 步骤名和结果数据

4. **测试** — report generator 单测 + service 集成测试（FTP mock）

5. **验证** — build + lint + test

## 与帧结构解耦的设计

```
report-generator.ts（本 handoff 范围）
  输入: task 实例 + checkPointDefs + stepResultData
  输出: TestReport JSON 字符串
              ↑
         当前 mock 数据（硬编码）
         后续: 从 receive 帧解析结果中取

send/receive（独立对话）
  发帧 → 收帧 → 解析 → 提取字段值
              ↓
         后续接到 report-generator 的输入
```

报告生成器只依赖输入数据结构，不依赖帧解析实现。两边独立做完后再接。

## 直接合同

1. **本文档**: `.sessions/2026-05-18-northbound-integration/H004-test-report-handoff.md`
2. **甲方接口文档**: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md`
3. **现有代码**:
   - `rewrite/src/features/northbound/services/northbound-service.ts`
   - `rewrite/src/features/northbound/core/outbound-translator.ts`
   - `rewrite/src/features/northbound/core/types.ts`

### 边界护栏

- `codestable/quality/rewrite-quality-rules.md` — R10（只读投影）、R11（交付失败不改内部结果）
- `.sessions/2026-05-18-northbound-integration/topic-index.md` — 已确认架构决策
