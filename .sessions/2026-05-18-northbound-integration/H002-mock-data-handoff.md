# Handoff: Mock 数据真实化

> 来源: S005 + stub 补全 | 交接目标: 根据 甲方接口文档和激光接口信息表，把 mock 数据做得更像真的
> 文件名: H002-mock-data-handoff.md

## 已完成边界

- 12 个入站 handler 全部就绪（4 真实 + 8 stub/mock）
- 9 个出站 translator + auth + heartbeat timer 全部就绪
- FTP 基础设施已实现（platform facade + main process + bridge）
- 86 个 northbound 测试通过
- 当前 mock 数据是硬编码的占位数据，甲方一看就知道是假的

## 不要做什么

- 不要改 handler 的逻辑结构、路由、信封格式
- 不要改出站 translator、auth、heartbeat
- 不要改 task service、send、receive、result 等其他 feature
- 不要引入 Vue/Pinia/Electron 依赖到 core/
- 不要一次全改完就跑——每个 mock 改完后跑 build+test 验证

## 必读

1. **本 handoff**

2. **激光接口信息表** — `激光与集成控制系统接口信息表20260507v1.md`（项目根目录）
   - 22 个上报字段（硬件配置、发送状态、接收状态、光调制、光探测）
   - 7 个控制指令（速率控制、编译码、激光器、统计清零、复位）
   - 所有枚举值和字节宽度定义

3. **甲方接口文档** — `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计0526-V1.0.4.md`
   - getDeviceList 响应格式（设备对象完整字段列表）
   - getTestCaseAll FTP JSON 文件格式（用例树结构）
   - getPars 响应格式（参数对象字段）

4. **现有 mock 数据位置** — `rewrite/src/features/northbound/services/northbound-service.ts`
   - `MOCK_DEVICE` 常量
   - `MOCK_TEST_CASES` 常量
   - 各 handler 中的硬编码响应

5. **规范** — `codestable/quality/rewrite-quality-rules.md`（R10: northbound 只读投影）

## 需要讨论再决定的内容

1. **MOCK_DEVICE** — 当前只有 name/deviceId/type/swVer/status。根据激光接口信息表：
   - 设备类型应该填什么（LCT? 激光?）
   - ip/port 是否需要填真实地址
   - pars 数组是否要填表里的上报字段（上电状态、时钟状态、ADC 状态等）
   - antennaManu/antennaType 是否需要填（之前的审查发现缺失）

2. **MOCK_TEST_CASES** — 当前只有 1 个菜单 + 1 个空壳用例。根据激光接口信息表：
   - 用例应该对应什么场景（激光通信测试？速率切换测试？误码率测试？）
   - execSteps 应该怎么描述
   - inputPars 是否需要填（比如速率选择、激光器波段选择）
   - preHandle/afterHandle 是否需要填（比如测试前开激光器、测试后关激光器）
   - checkPoints 应该填什么（根据上报字段：载波同步锁定、帧同步锁定、误码率等）
   - 用例数量多少合适

3. **getPars mock** — 当前返回空值。应该返回什么参数？跟激光接口信息表的 22 个上报字段有关系吗？

4. **getSubSysState mock** — 当前返回 online + 空 data 数组。data 里要不要填自检信息？

## 下一轮

1. 读完全部必读文档
2. 讨论上面 4 个问题，和用户确认每个 mock 的内容
3. 按确认结果修改 MOCK_DEVICE、MOCK_TEST_CASES、各 handler 中的 mock 数据
4. 每改一批跑 build+lint+test
5. 回报修改摘要
