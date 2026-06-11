# [S006] 集测范围综合 — 去重、排除、分级

> 2026-05-19 | 综合 | 完成
> 输入：S001（历史提取）+ S002（Feature 设计上）+ S003（Feature 设计下）+ S004（旧系统行为）+ S005（新系统接缝）
> Lane B：单对话综合分析，产出最终集测范围清单

## 目标

合并 S001-S005 所有提取结果，去重、排除已有单测覆盖的项、分级优先级，产出最终集测范围清单。

---

## 一、排除项（不纳入集测清单）

### 1.1 已有 835+ 单测覆盖的 feature 内部逻辑

| 排除项 | 理由 | 来源 |
|--------|------|------|
| 表达式引擎编译/求值/条件/批量/性能 | 8 spec、1149 行、P1/P2 已验证 | S002 §5 |
| Frame core/service/state/selector | frame-real 6/6 done | S002 §1 |
| Connection lifecycle reducer / config validation | 580+ tests | S002 §2 |
| Receive processor 匹配/解析（单帧） | fixture 级覆盖 | S002 §3 |
| Send 构帧 core 各 data type | ~100 tests | S002 §4 |
| Task core lifecycle / condition matcher | 70+ 单测 | S003 §1 |
| Command-ingress protocol adapter / handler / builder | 25/25 done，含集成 spec | S003 §3 |
| Settings normalize/validation/selector | 20 tests | S002 §7 |
| Result judgeCaseVerdict / collectResult | 单元级覆盖 | S003 §4 |

### 1.2 纯 UI 展示/样式（归 manual checklist）

| 排除项 | 理由 |
|--------|------|
| 网络连接卡片网格展示（最多 9 个） | UI 布局 |
| 帧统计面板展示（全局+单帧） | UI 展示 |
| 状态指示灯颜色/图标 | UI 样式 |
| 星座图/图表渲染 | UI 组件 |
| 帧列表过滤/排序/搜索 | UI 交互 |
| 3 个缺失页面（存储/历史/设置） | 页面实现，非集测 |

### 1.3 涉及真实串口/SCOE 硬件（归 hardware validation）

| 排除项 | 理由 |
|--------|------|
| 真实串口连接/断开/重连 | 需物理串口 |
| 真实 SCOE 设备命令执行 | 需甲方设备 |
| 高速存储文件写入/轮转/压缩 | 需真实高流量 |
| UDP 广播模式 | 需网络环境 |
| 打包态 native module loading | 需打包环境 |

### 1.4 涉及甲方 northbound HTTP/FTP（归 customer validation）

| 排除项 | 理由 |
|--------|------|
| HTTPS server 接收 testCase | 未实现 |
| POST testCaseResultReport | 未实现 |
| FTP 文件上传 | 未实现 |
| 身份体系 / deviceId 映射 | 未实现 |
| 心跳机制 | 未实现 |

### 1.5 未实现功能（归 feature 实施计划）

| 排除项 | 状态 | 来源 |
|--------|------|------|
| Task-real Phase 2（类型重组、统一引擎、step.repeat、fieldVariations、exitCondition） | 未实现 | S003 §2 |
| Result runtime 编排 / storage 持久化 | 未实现 | S003 §4 |
| Report 独立设计文档 | 未实现 | S003 §4 |
| Northbound 独立 feature | 未实现 | S003 §5 |
| 高速存储短路分流 | deferred | S004 §2.7 |
| TimerService platform 实现 | 未实现 | S003 §2 |
| autoConnect 逻辑 | 配置存在但逻辑缺失 | S005 M8 |
| readModel 跨帧变量 | 硬编码空 Map | S005 H6 |

---

## 二、前置修复项（集测前必须先修复的 bug）

| 编号 | Bug | 位置 | 影响 | 建议 |
|------|-----|------|------|------|
| BF-1 | fanOutToStorage 未 await | routing-tick.ts:42 | 存储写入被静默忽略 | 加 await + 错误传播 |
| BF-2 | save*() 无调用方 | persistence.ts:70-91 | 所有运行时修改关闭即丢 | 添加自动保存触发点 |
| BF-3 | composite adapter drainEvents null dereference | composite-adapter.ts:88-99 | 无串口环境下崩溃 | 加 null 检查 |
| BF-4 | connections/settings 启动恢复空转 | rewriteRuntime.ts:58-81 | 用户每次启动重配 | 实现恢复逻辑 |

BF-1 和 BF-3 修复后需同步写回归测试（分别纳入 T002 和 T008）。BF-2 和 BF-4 是功能缺失，归 feature 实施计划，但集测应在修复后覆盖。

---

## 三、S001 待确认项解决方案

| # | 待确认项 | 解决 | 证据 |
|---|---------|------|------|
| 1 | Wave 0 Task 类型重组 30 项测试 | **排除**：Phase 2 未实施 | S003 §2.1 |
| 2 | Expression 集成到 receive 验证方式 | **纳入 T009**：集成测试 | S002 §3 |
| 3 | 85 文件大提交 build/lint/test 结果 | **已确认**：S001 Agent 8 报告 build passed | 不影响集测 |
| 4 | Service 100%"10"vs"11"口径 | **已确认**：11 个 feature（含 command-ingress），S014 "10"口径不含 command-ingress | 不影响集测 |
| 5 | Task 间歇性测试失败状态 | **未解决**：S009-S015 无解决记录 | T012 应关注 |
| 6 | Command-ingress W2 CRITICAL 回归 | **已确认**：无显式回归测试 | S003 §3.3 覆盖但不够 |
| 7 | Storage-real 6 个 gap | **已列出**：S002 §8（打包态/高速模型/file API/report/northbound/语义） | 大部分归 hardware/customer validation |
| 8 | UDP adapter 是否实现 | **已确认**：real-network-adapter.ts 含 UDP 代码 | 不排除 |
| 9 | 34 处文档同步 post-sync 验证 | **无证据**：标记为 P2 风险 | T019 可部分覆盖 |
| 10 | S014 丢失 14 文件恢复 | **无证据**：无法核实 | 不影响集测 |
| 11 | S005 覆盖矩阵"5 未覆盖" | **已确认**：来自 S005 旧系统三线调研 P0/P1/P2 缺口 | 分别纳入集测 |
| 12 | Real-serial-adapter 未知 connectionId | **已确认**：write 不校验 connectionId 存在 | 归 hardware validation |
| 13 | FrameDirection 编译期检查 | **部分确认**：SendPage bug 已修但类型级防护不完整 | T022 覆盖 |

---

## 四、P0 集测项（数据通路核心）

### T001：端到端 TCP 接收数据通路

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection → runtime → receive → expression → display |
| **测试类型** | 真 TCP（Node `net` 模块） |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 启动 TCP server → composite adapter connect → client 发送测试帧 → routingTick 执行 → receive 解析 → expression 计算 → fanOutToDisplay 更新 |
| **验证点** | (1) TCP 字节到达 receive service；(2) 帧匹配成功；(3) 字段解析正确；(4) 表达式求值正确；(5) display selector 反映最新值 |
| **oracle 来源** | S004 §2.2 items 1-6（receive 管线行为）；`public/data/frames/configs/*.json` 帧定义 |
| **质量规则** | R8（receive/send 主链显式 IO） |
| **现有覆盖差距** | connection-network-adapter.spec.ts 有 TCP 先例但只测 adapter 层，未穿透到 receive |

### T001b：Send→Receive TCP 回环（帧级 loopback）

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | send → connection → receive → expression → display |
| **测试类型** | 真 TCP（Node `net` 模块，echo server） |
| **优先级** | P0（最高） |
| **依赖** | 无（可与 T001 并行） |
| **测试内容** | TCP echo server → send 构帧写出到 TCP → echo 回环 → receive 解析 → 验证发送值 == 接收值 |
| **验证点** | (1) **checksum 回环**：send 写 checksum → receive 验证 checksum → 一致；(2) **factor 回环**：send 构帧时 factor 逆换算 → receive 解析时 factor → 原始值还原；(3) **字节序回环**：send 大端写入 → receive 大端读出 → 一致；(4) **expression 回环**：send 时 expression 求值写入 → receive 时 expression 读出 → 值正确；(5) **length field 回环**：send auto length 回填 → receive 用 length 截取 → 字节对齐；(6) 多字段混合帧的完整 round-trip |
| **oracle 来源** | S004 §2.2（receive 管线 17 项行为）+ §2.3（send 管线 18 项行为）；帧定义 `public/data/frames/configs/*.json` |
| **质量规则** | R8（最核心验证） |
| **现有覆盖差距** | 零覆盖。send 和 receive 各自有单测，但从未测过"发出去的能原样收回来" |
| **意义** | 这是用户实际使用中最核心的闭环。T001（纯 receive）和 T003（纯 send）是单向验证，T001b 是闭环验证 |

### T001c：TCP Server 事件队列溢出

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection |
| **测试类型** | 真 TCP |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 快速连接/断开大量 TCP client → 触发 maxQueueDepth=100 溢出 → 验证事件队列行为 |
| **验证点** | (1) 队列满时最旧事件被 shift 丢弃；(2) 关键事件（连接/断开）可能被丢弃但不可静默丢失统计；(3) 溢出后系统不崩溃 |
| **oracle 来源** | S005 H5（TCP server 事件队列溢出丢弃） |
| **质量规则** | R8 |

### T002：fanOut 扇出正确性（display + storage）

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | runtime → receive → display → storage |
| **测试类型** | fake adapter |
| **优先级** | P0 |
| **依赖** | T001（或使用 fake adapter 模拟 receive outcomes） |
| **测试内容** | receive 产出 matched outcomes → routingTick 调用 fanOutToDisplay + fanOutToStorage → 验证 display ingest 和 storage write |
| **验证点** | (1) fanOutToDisplay 正确传入 sourceFields/chartHistory/scatterPoints；(2) fanOutToStorage 正确调用 storage service write（**BF-1 修复后**需验证 await）；(3) 两者错误隔离——一个失败不影响另一个 |
| **oracle 来源** | S004 §2.7 items 1-3（存储增量追加）；S005 M3（bridge 静默失败） |
| **质量规则** | R8、R9 |
| **现有覆盖差距** | feature-wiring.spec.ts 只测桥接器数据格式转换，未测真实扇出链路 |

### T003：端到端 task → send 执行链

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task → send → frame → connection |
| **测试类型** | fake adapter |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 创建 TaskDefinition（immediate + 单 send step）→ taskService.createTask → taskService.startTask → 验证 sendService.execute 被调用 → 验证 frame 读取正确 → 验证 transport write |
| **验证点** | (1) task lifecycle 正确推进（created→running→completed）；(2) send pipeline 9 步正确执行；(3) SendResult 返回后 task 进度更新；(4) selector 反映 task 终态 |
| **oracle 来源** | S004 §2.3 items 1, 8, 17（单帧发送+统计+进度） |
| **质量规则** | R8 |
| **现有覆盖差距** | task 和 send 各自有单测，但 task→send 端到端零覆盖 |

### T004：端到端条件匹配 → task → send 链

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | receive → runtime → task → send |
| **测试类型** | fake adapter |
| **优先级** | P0 |
| **依赖** | T001、T003 |
| **测试内容** | receive 产出 matched outcome → receiveEventSourceBridge 转换为 ConditionMatchInput → task event driver 接收 → 条件匹配 → send step 执行 |
| **验证点** | (1) bridge 正确转换 receive outcome 为 task 条件输入；(2) task event driver 触发执行；(3) 条件满足后 send 执行正确 |
| **oracle 来源** | S004 §2.2 items 15-16（条件触发桥接+AND/OR 短路）；S004 §2.4（条件评估逻辑） |
| **质量规则** | R8 |
| **现有覆盖差距** | receiveEventSourceBridge 有单测但未接真实 task service |

### T005：command-ingress → task → send → ACK 完整链

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | command-ingress → task → send → connection |
| **测试类型** | fake adapter（SCOE 协议字节构造） |
| **优先级** | P0 |
| **依赖** | T003、T004 |
| **测试内容** | 构造 SCOE LOAD 帧 → commandIngressService.consume → 协议解析 → TaskBuilder 翻译 → task 创建执行 → ACK 发送 |
| **验证点** | (1) LOAD 正确解析（功能码+三标志+ID 验证）；(2) SEND_FRAME 翻译为 immediate task；(3) task 执行后 ACK 帧构造正确；(4) ACK 通过 transport write 发出 |
| **oracle 来源** | S004 §2.5 items 1-5（SCOE 帧识别+校验和+指令配置）；`scoeConfigs/1.json` 偏移配置 |
| **质量规则** | R8、R10 |
| **现有覆盖差距** | command-ingress-integration.spec.ts 测了完整生命周期但用 mock transport |

### T006：Selector 不可变性验证

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | frame, display, storage, task, status |
| **测试类型** | Vitest 集成 |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 对每个 feature 的 selector 返回值尝试修改嵌套属性 → 验证 feature 内部 state 不受影响 |
| **验证点** | (1) selector 返回值修改后再次 selector 调用返回原始值；(2) 嵌套对象（数组/Map 内元素）修改不影响内部 |
| **oracle 来源** | CLAUDE.md "Selector 不可变约束"硬规则 |
| **质量规则** | R2（feature 归口显式，禁止跨 feature 内部写入） |
| **现有覆盖差距** | S001 Agent 3 确认 5 个 feature 返回浅拷贝 |

### T007：持久化启动恢复

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | runtime → frame → storage |
| **测试类型** | Vitest 时序/持久化 |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 模拟 LazyPersistence 生命周期：setDelegate 前 → load 返回空 → setDelegate → load 返回数据 → replaceFrames → 验证 frame service 状态 |
| **验证点** | (1) setDelegate 前 save 不抛异常但静默丢弃；(2) setDelegate 后 load 返回持久化数据；(3) frames 恢复后 selector 返回正确值；(4) 启动中并发操作的竞态安全 |
| **oracle 来源** | S004 §2.6 items 1, 8（帧 CRUD + JSON 导入导出） |
| **质量规则** | R5（Electron 能力边界窄） |
| **现有覆盖差距** | S005 H3 确认 LazyPersistence 启动竞态无测试 |

### T008：事件截断与统计准确性

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection, receive |
| **测试类型** | fake adapter（压力测试） |
| **优先级** | P0 |
| **依赖** | 无 |
| **测试内容** | 快速注入 1000+ 事件 → 验证 bounded buffer 截断行为 → 验证统计计数器准确 |
| **验证点** | (1) connection 层 slice(-50) 保留最新 50 条；(2) receive 层 slice(0, 50) 丢弃新事件后计数器仍准确；(3) 统计 totals 不因截断而错误 |
| **oracle 来源** | S004 §2.2 items 3-4（帧级+全局统计）；S005 H2（事件截断永久丢失） |
| **质量规则** | R8 |
| **现有覆盖差距** | 零覆盖。S005 H2 标记为高风险 |

---

## 五、P1 集测项（重要接缝）

### T009：Expression engine → receive 集成

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | receive → expression → frame |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | 用真实帧配置（`configs/3.json` 或类似）构造 ReceiveInputBatch → processor 完整处理链 → 验证 expression-pass 求值结果 |
| **验证点** | (1) 依赖排序正确（Kahn 算法）；(2) 循环依赖检测；(3) 部分失败不阻塞其他表达式；(4) global_stat 变量传入空 Map 时不崩溃 |
| **oracle 来源** | S004 §2.8 items 1-9；`configs/3.json`（多条件+变量映射） |
| **质量规则** | R8 |
| **现有覆盖差距** | expression-pass.spec.ts 用 fixture 级帧配置，非真实帧 |

### T010：Expression engine → send 集成

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | send → expression → frame |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | 用真实帧配置构造发送请求 → send pipeline resolve field values → apply factor → build buffer → 验证表达式字段求值正确 |
| **验证点** | (1) compileGroup + evaluateGroup 正确；(2) factor 逆换算（非1/等于1）；(3) defaultValue fallback；(4) 条件表达式分支选择正确 |
| **oracle 来源** | S004 §2.3 item 1（表达式计算→倍率→序列化）；`sendInstances.json` |
| **质量规则** | R8 |
| **现有覆盖差距** | send-frame-resolver.spec.ts 19 tests 但未验证 compileConditional vs compileGroup 差异 |

### T011：Expression engine → task 条件集成

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task → expression |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | 构造 wait-condition-step → compileConditional → 用 receive 模拟数据 evaluateConditional → 验证条件匹配结果 |
| **验证点** | (1) compileConditional + evaluateConditional 接口正确；(2) 变量值来自 receive 字段值；(3) AND/OR 组合短路评估 |
| **oracle 来源** | S004 §2.4（条件评估逻辑）；S004 §2.8 item 9（发送触发条件） |
| **质量规则** | R2 |
| **现有覆盖差距** | S001 确认 expression→task 集成测试零覆盖 |

### T012：Task timer driver 循环执行

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task |
| **测试类型** | Vitest 集成（fake timers） |
| **优先级** | P1 |
| **依赖** | T003 |
| **测试内容** | timer driver + intervalMs + maxIterations=N → 验证 N 次执行后 completed |
| **验证点** | (1) 执行次数 = maxIterations；(2) 每次间隔 ≈ intervalMs；(3) completed 后不再执行；(4) 用户 stop 后状态为 stopped 非 completed |
| **oracle 来源** | S004 §2.4（定时发送配置模型） |
| **质量规则** | R8 |
| **注意** | S001 Agent 5 确认间歇性 30-40% 失败（真实 setTimeout 泄漏），应使用 vi.useFakeTimers |

### T013：Task event driver 条件触发

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task → receive → expression |
| **测试类型** | fake adapter |
| **优先级** | P1 |
| **依赖** | T004 |
| **测试内容** | event driver → 模拟 receive 事件 → 条件匹配 → cooldown 期间忽略 → maxTriggerCount 到达后停止 |
| **验证点** | (1) 首次匹配后执行；(2) cooldown 期间忽略后续匹配；(3) maxTriggerCount 后不再触发；(4) 仍可手动 stop |
| **oracle 来源** | S004 §2.4（触发发送配置模型） |
| **质量规则** | R8 |

### T014：Command-ingress 两阶段状态机

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | command-ingress |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | 发送 LOAD → phase 1 只识别 LOAD → LOAD 成功后 phase 2 全命令可用 → 发送 SEND_FRAME/READ_FILE_AND_SEND 等 → UNLOAD 后重置为 phase 1 |
| **验证点** | (1) phase 1 非 LOAD 命令被忽略；(2) phase 2 所有 6 种 handler 可处理；(3) UNLOAD 后回归 phase 1 |
| **oracle 来源** | S004 §2.5 items 1-2（SCOE 帧识别+校验和验证） |
| **质量规则** | R8 |
| **现有覆盖差距** | scoe-protocol-adapter.spec.ts 覆盖了协议解析但状态机端到端在 service 层未充分验证 |

### T015：Settings 传播到下游 feature

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | settings → connection/receive/send/storage/status |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | 修改 settings → 验证各 feature selector 反映新配置 |
| **验证点** | (1) settings selector 返回深拷贝（修改不影响 settings 内部）；(2) storage selector 正确投影 CSV 路径/保存间隔；(3) 各 feature 在 settings 变更后行为变化 |
| **oracle 来源** | S004 §2.10（21 项配置） |
| **质量规则** | R2、R7 |

### T016：routingTick 错误隔离

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | runtime → receive → display → storage → task |
| **测试类型** | fake adapter |
| **优先级** | P1 |
| **依赖** | T002 |
| **测试内容** | 注入一个 bridge 失败（如 storage write 抛异常）→ 验证其他 bridge（display、task event）仍正常执行 |
| **验证点** | (1) storage 失败不阻塞 display 更新；(2) display 失败不阻塞 task event；(3) 错误信息可观测（不静默吞掉） |
| **oracle 来源** | S005 M3（bridge 静默失败）、M4（处理器无异常隔离） |
| **质量规则** | R8 |

### T016b：routingTick 消费者顺序

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | runtime → command-ingress → receive |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | T001 |
| **测试内容** | routingTick 处理事件时，command-ingress 必须先于 receive 消费 → 验证事件分发顺序 |
| **验证点** | (1) command-ingress 先消费，匹配 SCOE 帧后剩余事件传给 receive；(2) command-ingress 全部消费后 receive 收到空事件不报错；(3) 顺序不依赖注册顺序而是显式编排 |
| **oracle 来源** | S003 §10.1.4（routingTick 消费者链：command-ingress 先于 receive） |
| **质量规则** | R8 |
| **现有覆盖差距** | routing-tick.spec.ts 未测试多消费者顺序 |

### T016c：出站路由正确性

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | send → connection |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | T003 |
| **测试内容** | 验证 send 的 targetResolver 根据不同来源路由到正确的 connection target |
| **验证点** | (1) 用户路径 targetId 来自帧实例配置；(2) SCOE 路径 targetId 来自 frameInstances；(3) target 不可用时 build-error |
| **oracle 来源** | S003 §7 D1-D4（出站路由 4 个决策）；S002 §4（SendTargetResolver + SendTransportWriter） |
| **质量规则** | R8 |

### T016d：Runtime bootstrap 分层装配完整性

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | runtime → 全部 feature |
| **测试类型** | Vitest 集成 |
| **优先级** | P1 |
| **依赖** | 无 |
| **测试内容** | createRewriteRuntime() → 验证 L0-L4 分层创建全部完成 → 各 service 非 undefined → 桥接器正确注入 |
| **验证点** | (1) L0（frame/settings/storage）无互依赖先创建；(2) L1（connection）依赖 adapter；(3) L2（receive/display/send）依赖 L0+L1；(4) L3（bridge/task）依赖 L2；(5) L4（command-ingress）依赖 L3；(6) 全部 service selector 可调用 |
| **oracle 来源** | S002 §6（wireFeatures 分层创建契约） |
| **质量规则** | R2、R5 |

### T016e：多源并发 receive fieldKey 冲突

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | receive |
| **测试类型** | fake adapter |
| **优先级** | P1 |
| **依赖** | T001 |
| **测试内容** | 同一帧定义从两个 connection 同时接收 → fieldKey(frameId:fieldId) 无来源区分 → 验证值覆盖行为 |
| **验证点** | (1) 最后到达的值覆盖先到的；(2) 统计计数包含两个来源；(3) 不崩溃、不丢数据（只是合并）；(4) 如需区分来源，标记为 known-gap |
| **oracle 来源** | S005 M10（字段键冲突，无来源区分） |
| **质量规则** | R8 |

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | T003 |
| **测试内容** | 构造各 step 类型失败场景 → 验证 retry/skip/stop/pause 策略正确应用 |
| **验证点** | (1) send-step write 失败 + retry → 重试后成功；(2) wait-condition timeout + skip → 继续下一步；(3) delay-step 无失败路径 |
| **oracle 来源** | S003 §1.1（错误策略统一） |
| **质量规则** | R8 |

### T018：Condition AND/OR 短路求值

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task → expression |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | T011 |
| **测试内容** | 多条件 AND/OR 组合 → 第一条件就确定结果 → 验证后续条件不求值 |
| **验证点** | (1) AND 第一条件 false → 整体 false，不评估后续；(2) OR 第一条件 true → 整体 true；(3) 混合 AND/OR 优先级正确 |
| **oracle 来源** | S004 §2.8 item 9（AND/OR 短路逻辑） |
| **质量规则** | R8 |

### T019：旧 JSON 迁移 → 新帧定义完整性

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | frame |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | importLegacyFrames 旧 JSON → 验证新 FrameAsset 字段类型/校验规则保持新模型语义 |
| **验证点** | (1) 所有特征字段正确映射；(2) 缺失字段用默认值填充；(3) round-trip：旧 JSON → import → export → 值等价 |
| **oracle 来源** | S004 §2.6 items 8, 10（JSON 导入导出+帧模板同步）；`public/data/frames/configs/*.json` |
| **质量规则** | R10 |

### T020：Task 并发执行 + 共享 send service

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task → send |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | T003 |
| **测试内容** | 两个 task 实例同时运行 → 共享 sendService → 验证 QueueModel 不串数据 |
| **验证点** | (1) 两个 task 的 send 不交错；(2) 各自的 SendResult 不串号；(3) stop 一个不影响另一个 |
| **oracle 来源** | S003 D4（首轮不做 task-level 并发协调，依赖 send QueueModel） |
| **质量规则** | R8 |

### T021：Checksum/patch 边界情况

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | send → frame |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | 构造各种 checksum 配置的帧 → 验证构帧后 buffer 中 checksum/length 字段回填正确 |
| **验证点** | (1) CRC32 计算正确；(2) checksum 溢出 → build-error；(3) length field 缺失 → 跳过回填 + warning；(4) autoChecksum + autoLength 组合 |
| **oracle 来源** | S004 §2.6 item 5（4 种 checksum 方法）；S002 SC15-17 |
| **质量规则** | R8 |

### T022：Frame direction 过滤跨 consumer

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | frame → send → receive |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | send 方向帧 → receive 应不匹配；receive 方向帧 → send 应 build-error |
| **验证点** | (1) receive 跳过 send 方向帧；(2) send 构建时 direction 校验产生 build-error |
| **oracle 来源** | S002 SC11（direction 过滤） |
| **质量规则** | R2、R8 |

### T023：Connection-backed-writer 事件依赖

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection → send |
| **测试类型** | fake adapter |
| **优先级** | P2 |
| **依赖** | T003 |
| **测试内容** | send write → connection-backed-writer 等待 write-accepted 事件 → 事件缺失时行为 |
| **验证点** | (1) 正常路径：write-accepted 事件到达 → 返回字节数；(2) 异常路径：事件缺失 → 返回 0 字节而非挂起 |
| **oracle 来源** | S005 M5（事件依赖脆弱） |
| **质量规则** | R8 |

### T024：Connection lifecycle 状态转换边界

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection |
| **测试类型** | fake adapter |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | 边界操作：重复 connect、已断开时 disconnect、stale events、shutdown 清理 |
| **验证点** | (1) duplicate connect 不创建重复连接；(2) disconnect already closed 不抛异常；(3) stale platform events 被正确忽略 |
| **oracle 来源** | S004 §2.1 items 1-5（连接四状态+TCP/UDP 行为） |
| **质量规则** | R5 |

### T024b：onTimeout 与 errorPolicy 两层交互

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | task |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | T003 |
| **测试内容** | wait-condition-step timeout + 各 errorPolicy → 验证 continue/skip 不触发 errorPolicy，fail 才触发 |
| **验证点** | (1) timeout + continue → 跳过当前 step，继续下一步，errorPolicy 不介入；(2) timeout + fail → 触发 errorPolicy（retry/skip/stop/pause）；(3) 两层策略组合正确 |
| **oracle 来源** | S003 §10.3.13（onTimeout 与 errorPolicy 两层交互） |
| **质量规则** | R8 |

### T024c：drainInputSource 同步阻塞

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | receive |
| **测试类型** | fake adapter（性能测试） |
| **优先级** | P2 |
| **依赖** | T001 |
| **测试内容** | 单次 tick 注入 1000+ 事件 → 验证 drainInputSource 同步 for...of 不导致 tick 超时 |
| **验证点** | (1) 单次 tick 耗时在可接受范围；(2) 不因同步阻塞导致后续 tick 延迟；(3) 所有事件最终被处理 |
| **oracle 来源** | S005 M2（drainInputSource 同步阻塞） |
| **质量规则** | R8 |

### T024d：连接断开 → 活跃 task 自动暂停

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | connection → task |
| **测试类型** | fake adapter |
| **优先级** | P2 |
| **依赖** | T003 |
| **测试内容** | task 正在执行 send-step → connection 断开 → 验证 task 自动暂停 |
| **验证点** | (1) connection disconnected 事件传播到 task；(2) task 状态变为 paused；(3) 重连后可手动 resume |
| **oracle 来源** | S004 §2.3 item 9（连接断开自动暂停） |
| **质量规则** | R8 |

### T024e：帧模板更新 → 实例联动

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | frame |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | 修改帧模板（增删改字段）→ 验证从该模板创建的帧实例联动更新 |
| **验证点** | (1) 已存在字段保留 value；(2) 新增字段用 defaultValue；(3) 删除字段从实例移除；(4) ID 修改含冲突检测 |
| **oracle 来源** | S004 §2.6 items 10-11（帧更新后实例同步） |
| **质量规则** | R2 |

### T024f：Display projection 正确性

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | display → receive → storage |
| **测试类型** | Vitest 集成 |
| **优先级** | P2 |
| **依赖** | T002 |
| **测试内容** | receive 解析后 → fanOutToDisplay → display ingest → 验证 table/chart/scatter projection 正确生成 |
| **验证点** | (1) table projection 行数据与 receive 字段值一致；(2) chart history 累积正确；(3) scatter points 累积正确；(4) 各 projection selector 返回深拷贝 |
| **oracle 来源** | S002 §9（三种 projection 验收） |
| **质量规则** | R8 |

### T024g：Storage RealLocalMaterialAdapter CRUD 生命周期

| 属性 | 内容 |
|------|------|
| **覆盖 feature** | storage → platform(file facade) |
| **测试类型** | Vitest 集成（fake file facade） |
| **优先级** | P2 |
| **依赖** | 无 |
| **测试内容** | create → read → update → delete → list 全生命周期 → 验证 soft delete(.deleted) 行为 |
| **验证点** | (1) write 后 read 返回正确值；(2) delete 后 list 不包含已删除项；(3) readMaterial 不检查 .deleted 标记（已知 bug，标记为 known-gap）；(4) delete 不更新 _index.json（已知 bug） |
| **oracle 来源** | S002 §8（adapter port 模式）；S001 T-P0-3（软删除有 bug） |
| **质量规则** | R5 |

---

## 七、测试项汇总矩阵

### 7.1 按优先级

| 优先级 | 数量 | 测试项 |
|--------|------|--------|
| P0 | 10 | T001, T001b, T001c, T002, T003, T004, T005, T006, T007, T008 |
| P1 | 12 | T009, T010, T011, T012, T013, T014, T015, T016, T016b, T016c, T016d, T016e |
| P2 | 14 | T017, T018, T019, T020, T021, T022, T023, T024, T024b, T024c, T024d, T024e, T024f, T024g |

**总计 36 条集测项。**

### 7.2 按测试类型

| 测试类型 | 数量 | 测试项 |
|----------|------|--------|
| 真 TCP | 3 | T001, T001b, T001c |
| fake adapter | 13 | T002, T003, T004, T005, T008, T013, T016, T016e, T023, T024, T024c, T024d, T024g |
| Vitest 集成 | 18 | T006, T007, T009, T010, T011, T012, T014, T015, T016b, T016c, T016d, T017, T018, T019, T020, T021, T022, T024b, T024e, T024f |
| 时序/持久化 | 2 | T007, T024g |

### 7.3 按 feature 覆盖

| Feature | 涉及测试项 | 覆盖维度 |
|---------|-----------|---------|
| connection | T001, T001b, T001c, T005, T016d, T023, T024 | TCP 数据通路、回环、事件溢出、write 事件、断开联动、lifecycle 边界 |
| runtime (routingTick) | T001, T001b, T002, T004, T005, T016, T016b, T016d | 数据路由、扇出、错误隔离、消费者顺序、bootstrap |
| receive | T001, T001b, T002, T004, T008, T009, T016e, T024c | 解析、回环、扇出、统计、expression 集成、多源并发、同步阻塞 |
| send | T001b, T003, T004, T005, T010, T016c, T020, T021, T022, T023 | 回环、构帧、expression、出站路由、checksum、direction、并发 |
| task | T003, T004, T005, T011, T012, T013, T016d, T017, T018, T020, T024b | lifecycle、timer、event、断开联动、error、condition、并发、timeout 策略 |
| command-ingress | T005, T014, T016b | 协议解析、状态机、消费者顺序 |
| expression | T001, T001b, T009, T010, T011, T013, T018 | receive/send/task 三方集成 + 回环 |
| frame | T003, T019, T021, T022, T024e | direction、checksum、迁移、selector、模板联动 |
| display | T002, T016, T024f | 扇出接收、错误隔离、projection 正确性 |
| storage | T002, T007, T016, T024f, T024g | 扇出写入、持久化恢复、CRUD 生命周期 |
| settings | T015 | 下游传播 |
| status | T006 | selector 不可变性 |

### 7.4 依赖图

```
独立（无依赖，可并行）：
  T006, T007, T008, T009, T010, T011, T014, T015,
  T016d, T019, T021, T022, T024g, T024e

TCP 基线：
  T001 ──→ T001b（回环，可与 T001 并行）
  T001 ──→ T001c（事件溢出）
  T001 ──→ T002 ──→ T016（fanOut → 错误隔离）
  T001 ──→ T016e（多源并发）
  T001 ──→ T024c（同步阻塞）
  T002 ──→ T024f（display projection）

task→send 基线：
  T003 ──→ T004 ──→ T005（condition → command-ingress）
  T003 ──→ T012（timer driver）
  T003 ──→ T016c（出站路由）
  T003 ──→ T017（error strategies）
  T003 ──→ T020（并发）
  T003 ──→ T023（writer 事件依赖）
  T003 ──→ T024b（timeout 策略）
  T003 ──→ T024d（断开→暂停）

expression→task：
  T011 ──→ T013（event driver）
  T011 ──→ T018（AND/OR 短路）

bootstrap：
  T016d（独立，验证 L0-L4 全链路）
```

### 7.5 建议实施批次

| 批次 | 测试项 | 理由 |
|------|--------|------|
| **Batch 0（前置修复）** | BF-1, BF-3 | 修复 2 个 bug，写回归测试 |
| **Batch 1（独立项，可并行）** | T006, T007, T008, T009, T010, T011, T014, T015, T016d, T019, T021, T022, T024e, T024g | 14 项无依赖，可 5 组并行 |
| **Batch 2（基线通路 + 回环）** | T001, T001b, T001c, T003, T002 | TCP 基线 + 回环 + 事件溢出 + task→send 基线 + fanOut |
| **Batch 3（端到端链路）** | T004, T005, T012, T013, T016, T016b, T016c, T016e | 依赖 Batch 2 |
| **Batch 4（边界情况）** | T017, T018, T020, T023, T024, T024b, T024c, T024d, T024f | 依赖 Batch 2-3 |

---

## 八、测试基础设施约定

1. **TCP 测试**：用 Node `net` 模块，参考 `connection-network-adapter.spec.ts` 模式
2. **回环测试**：TCP echo server（`net.createServer` + `socket.pipe(socket)`），验证发送字节等于接收字节
3. **fake adapter**：复用各 feature 已有的 `createFake*` 工厂
4. **测试文件位置**：`rewrite/src/__tests__/integration/`
5. **不引入新依赖**：只用 Vitest + Node 内置模块
6. **可重复运行**：不依赖外部服务、端口冲突用随机端口
7. **fake timers**：task 定时相关测试用 `vi.useFakeTimers()`，避免真实 setTimeout 泄漏

---

## 九、质量规则映射

| 质量规则 | 覆盖测试项 | 说明 |
|----------|-----------|------|
| R2（feature 归口显式） | T006, T011, T015, T016d, T022, T024e | selector 不可变+条件集成+settings 传播+bootstrap+direction+模板联动 |
| R5（Electron 边界窄） | T007, T024, T024g | 持久化边界+连接边界+storage adapter |
| R8（receive/send 主链显式 IO） | T001-T005, T001b, T001c, T008-T013, T016-T024g（除 T024e） | 主链核心+回环 |
| R10（northbound 独立边界） | T005, T019 | SCOE 链路+旧 JSON 迁移 |

R10/R11（northbound/result/report）因功能未实现暂不覆盖，标记为 blocked。

---

## 后续

1. **Batch 0**：修复 BF-1（fanOutToStorage await）和 BF-3（drainEvents null check）
2. **Batch 1**：14 项独立集测可并行实施
3. **Batch 2**：TCP 基线 + **回环** + task→send 基线 + fanOut（最核心批次）
4. **Batch 3-4**：端到端链路和边界测试
5. **blocked**：northbound 集成、task-real Phase 2 集成、高速存储分流、result runtime 编排——待功能实现后补充
6. **本文件是对话 7+（集测实施）的直接合同**

---

## 十、后续功能完善后的集测追加计划

当前 36 条只覆盖**已实现的基础管线**。以下按触发条件分组，待对应功能实现后补充集测。

### 10.1 功能完善后追加

| 触发功能 | 追加集测 | 依赖的 feature 文档 |
|----------|---------|-------------------|
| task-real Phase 2（类型重组、step.repeat、fieldVariations、exitCondition） | 统一引擎循环测试、fieldVariation 轮次注入测试、exitCondition 条件退出测试 | `codestable/features/rewrite-task/task-real-design.md` |
| Result runtime 编排（task onSettled → collectResult → verdict） | 结果收集端到端测试 | `codestable/features/rewrite-result/` |
| Report 生成（素材归集 + JSON 输出） | result→report 链路测试 | `codestable/features/rewrite-result/` |
| autoConnect 逻辑 | 启动自动连接测试 | `codestable/features/rewrite-connection/` |
| readModel 跨帧变量 | 跨帧表达式求值正确性测试 | `codestable/features/receive-real-pipeline/` |
| TimerService（Web Worker） | 定时精度测试 | `codestable/features/rewrite-task/task-real-design.md` |
| 高速存储分流 | 匹配数据不转发渲染进程的架构分流测试 | `codestable/compound/` + `codestable/features/rewrite-storage-local-baseline/` |
| 身份标识统一（frameId/fieldId） | display/status/storage→display 映射正确性测试 | `codestable/features/rewrite-display/` + `rewrite-status/` |
| connections/settings 启动恢复 | BF-4 修复后持久化完整性测试 | `rewrite/src/runtime/persistence.ts` |

### 10.2 甲方 northbound 闭环后追加

| 触发接口 | 追加集测 | 依赖的设计文档 |
|----------|---------|--------------|
| setTestTask（HTTPS 接收 → task 创建） | HTTPS 入站→task 执行端到端 | `.sessions/2026-05-18-northbound-integration/` |
| controlTestTask（abort/pause/continue/stop） | 远程控制→task 状态变更 | northbound design（待创建） |
| testCaseResultReport（verdict → POST 回报） | result→northbound 出站 | `codestable/features/rewrite-result/` |
| msgReport（step 级事件通知） | task step hook→stepInfo 回报 | northbound design（待创建） |
| FTP 文件上传 | report 文件→FTP delivery | northbound design（待创建） |
| 心跳机制 | 定时心跳发送 | northbound design（待创建） |

### 10.3 打包态/硬件级追加

| 触发场景 | 追加集测 | 备注 |
|----------|---------|------|
| Electron 打包态 data path | native module loading、asarUnpack | 需打包环境 |
| 真实串口收发 | serial adapter 全生命周期 | 需物理串口 |
| SCOE 真实设备 | 命令执行→确认帧→下一命令 | 需甲方设备 |
| 高速存储真实流量 | 几百 Mbps 写入+文件轮转+压缩 | 需真实高流量 |

---

## 十一、集测实施对话规划

### 每个对话的必读清单

**通用必读（每个对话开始前都必须读）：**
1. `codestable/quality/rewrite-quality-rules.md`
2. `codestable/architecture/rewrite-target-structure.md`
3. `.sessions/2026-05-19-integration-testing/S006-test-scope-synthesis.md`（本文件，直接合同）
4. `.sessions/2026-05-19-integration-testing/S005-new-system-seam-audit.md`（接缝详情和代码位置）

**按 feature 分组的必读（每个对话根据覆盖的 feature 追加）：**

| Feature | 必读文档 |
|---------|---------|
| connection | `codestable/features/rewrite-connection/` 全部 + `rewrite/src/features/connection/adapters/composite-adapter.ts` |
| runtime | `codestable/features/2026-05-07-runtime-wiring/` 全部 + `rewrite/src/runtime/feature-wiring.ts` + `rewrite/src/runtime/routing-tick.ts` |
| receive | `codestable/features/rewrite-receive/` 全部 + `rewrite/src/features/receive/core/processor.ts` |
| send | `codestable/features/rewrite-send/` 全部 + `rewrite/src/features/send/services/send-service.ts` |
| task | `codestable/features/rewrite-task/` 全部 + `rewrite/src/features/task/services/task-service.ts` |
| command-ingress | `codestable/features/rewrite-command-ingress/` 全部 |
| expression | `codestable/features/2026-05-08-expression-engine/` 全部 |
| frame | `codestable/features/rewrite-frame/` 全部 |
| display | `codestable/features/rewrite-display/` 全部 |
| storage | `codestable/features/rewrite-storage-local-baseline/` 全部 |
| settings | `codestable/features/rewrite-settings/` 全部 |

### 对话分组

#### 对话 7：Batch 0 修复 + Batch 1-A（修复 bug + 独立基础设施测试）

**覆盖项**：BF-1, BF-3, T006, T007, T008, T016d, T024g

**必读**：
- 通用必读
- runtime wiring design + feature-wiring.ts + routing-tick.ts + persistence.ts
- rewrite-quality-rules.md（selector 不可变约束）

**子 agent 策略**：
- Agent 1：修复 BF-1 + BF-3 + 写回归测试
- Agent 2：T006（selector 不可变性）+ T016d（bootstrap）
- Agent 3：T007（持久化）+ T008（事件截断）+ T024g（storage CRUD）

**产出文件**：`rewrite/src/__tests__/integration/` 下 3-5 个 spec 文件

---

#### 对话 8：Batch 1-B（expression 三方集成 + settings + command-ingress）

**覆盖项**：T009, T010, T011, T014, T015

**必读**：
- 通用必读
- expression engine design + `rewrite/src/shared/expression/index.ts`
- receive design + send design + task design（expression 消费方）
- command-ingress design
- settings design

**子 agent 策略**：
- Agent 1：T009（expression→receive）+ T010（expression→send）
- Agent 2：T011（expression→task）+ T015（settings 传播）
- Agent 3：T014（command-ingress 两阶段状态机）

---

#### 对话 9：Batch 1-C + Batch 2-A（独立余项 + TCP 基线 + 回环）

**覆盖项**：T019, T021, T022, T024e, T001, T001b, T001c

**必读**：
- 通用必读
- connection design + composite-adapter.ts + real-network-adapter.ts
- frame design + `public/data/frames/configs/*.json`
- `rewrite/src/features/connection/__tests__/connection-network-adapter.spec.ts`（TCP 测试先例）

**子 agent 策略**：
- Agent 1：T001（TCP receive 基线）+ T001c（TCP 事件溢出）
- Agent 2：T001b（send→receive 回环）— 最核心，需要单独 agent 充分测试
- Agent 3：T019（JSON 迁移）+ T021（checksum）+ T022（direction）+ T024e（帧模板联动）

---

#### 对话 10：Batch 2-B（task→send + fanOut + 出站路由）

**覆盖项**：T003, T002, T016b, T016c, T016e

**必读**：
- 通用必读
- task design + task-service.ts
- send design + send-service.ts
- runtime wiring design + 所有 bridge 文件
- S002 §4（SendTargetResolver + SendTransportWriter）
- S003 §7（出站路由决策 D1-D4）

**子 agent 策略**：
- Agent 1：T003（task→send 执行链）
- Agent 2：T002（fanOut 扇出）+ T016b（消费者顺序）
- Agent 3：T016c（出站路由）+ T016e（多源并发）

---

#### 对话 11：Batch 3（端到端链路）

**覆盖项**：T004, T005, T012, T013, T016

**必读**：
- 通用必读
- receive design + task design + send design + command-ingress design
- receiveEventSourceBridge + connection-backed-writer + connection-backed-target-resolver
- S003 §10（16 个集成接缝详情）

**子 agent 策略**：
- Agent 1：T004（条件匹配→task→send）+ T005（command-ingress 完整链）
- Agent 2：T012（timer driver）+ T013（event driver）
- Agent 3：T016（routingTick 错误隔离）

---

#### 对话 12：Batch 4（边界情况）

**覆盖项**：T017, T018, T020, T023, T024, T024b, T024c, T024d, T024f

**必读**：
- 通用必读
- task design（error strategies, timeout vs errorPolicy）
- connection design（lifecycle 边界, reconnect）
- display design（projection）

**子 agent 策略**：
- Agent 1：T017（error strategies）+ T024b（timeout vs errorPolicy）+ T018（AND/OR 短路）
- Agent 2：T020（task 并发）+ T023（writer 事件依赖）+ T024（lifecycle 边界）+ T024d（断开→暂停）
- Agent 3：T024c（同步阻塞）+ T024f（display projection）

---

### 对话间交接要求

每个对话完成后，必须：
1. 更新 `.sessions/2026-05-19-integration-testing/topic-index.md`
2. 在 S006 中标记已完成的测试项（✅）
3. 如发现新问题（bug、设计偏差、missing feature），追加到本文件的附录
4. 下一个对话开始前，先读本文件确认当前进度和剩余项
