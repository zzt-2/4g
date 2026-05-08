# Northbound Overlap And Gap Map

Status: discussion draft

Scope: northbound overlap workshop. This document records overlap, gap, internal decisions, and questions for later customer clarification. It does not define interface schema and does not design implementation modules.

## 1. Baseline Inputs

Evidence:

- Rewrite baseline requires preserving legacy visible capabilities by default, while not inheriting old organization/state coupling/Electron boundary directly: `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md:19-24`, `37-54`.
- Target structure already separates `task`, `status`, `result`, `report`, and `northbound`; northbound is an independent boundary, not an alias of task/status/report: `codestable/architecture/rewrite-target-structure.md:46-73`, `229-247`.
- Quality rules explicitly prohibit three false equivalences: old send task equals northbound task, history/CSV equals TestReport, serial/network target equals device/deviceId: `codestable/quality/rewrite-quality-rules.md:188-201`.
- Legacy inventory is a static fact and oracle map, not a runtime oracle; real serial/network/SCOE/center/FTP/package validation has not been completed: `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md:16-21`.
- Customer documents define the northbound main surface as HTTP/REST plus FTP, with task dispatch/control/result/file/report, device/status/alarm/heartbeat concerns: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:33-51`, `04-任务主链.md:12-21`, `05-结果、文件与报告回传.md:12-16`, `07-运维控制与链路保活.md:11-18`.
- The later-connection checklist narrows the likely practical mainline to task receive, task start/stop, status, case result, task result, JSON report, and report delivery: `后面对接所需功能清单.md:109-115`, `554-581`.

Inference:

- This overlap map should judge whether legacy material can provide internal facts or behavior oracle. It must not turn similar legacy names into northbound protocol semantics.
- Customer-facing interface names, field names, enum names, and acceptance details remain separate from internal decisions.

Unknown:

- Formal machine-readable customer interface assets, FTP environment, HTTP/HTTPS final choice, TestReport examples, result/error enum definitions, and acceptance scenarios are still unavailable or under-specified: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-甲方沟通拆解.md:142-155`, `241-281`.

## 2. Executive Conclusion

Evidence:

- Customer northbound mainline is a task dispatch/control/status/result/file/report loop, not the old UI send task or local history export: `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md:127-130`.
- Old send task is preserved as a local capability and internal execution material, but cannot be treated as `setTestTask` or `controlTestTask`: `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md:74`, `128`.
- Old storage/history/CSV is local persistence/export capability; northbound report and file delivery remain a gap: `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md:76`, `79`.

Confirmed in workshop:

- We position this system as a complete secondary subsystem, not a single device or only an execution node.
- We have multiple devices on our side, but serial/network targets are unrelated to northbound `deviceId`.
- Device management, use-case assets, parameter cooperation, alarms, upgrade, restart, and similar complete-secondary-subsystem domains should be considered lightly to avoid future large changes, but they are not the current mainline.
- `setTestTask` is external task dispatch from the customer.
- Task and case are separate concepts. A task contains case(s), but a task does not necessarily contain multiple cases.
- `startTestCaseList` is treated, for the current practical understanding, as task start.
- This phase only supports `stop` as a control action. After stop, task state should be `stopped`.
- SCOE belongs to another customer/external system. It is not part of the current customer's northbound identity, but many command-code, receive, send, and parsing behaviors can be reused as internal facts or oracle material.

Inference:

- Highest overlap: internal execution/data facts, including receive parsing, send results, connection availability, SCOE command/status facts, and local storage/history.
- Lowest overlap: external northbound transaction semantics, including task identity, device identity, heartbeat, self-check, alarms, JSON TestReport, FTP/HTTP completion notification, and customer-defined error/refusal semantics.
- We can simplify later work by fixing internal business semantics now, then asking the customer only for naming, coding, enum, and acceptance details.

Unknown:

- The customer still needs to confirm external values and acceptance semantics for identity, status, result, exception, report, heartbeat, FTP, and optional full-secondary-subsystem domains.

## 3. Overlap Matrix

| Northbound demand | Legacy material | Reuse category | Gap | Current decision / customer decision | Evidence |
|---|---|---|---|---|---|
| Secondary subsystem identity | App/runtime as an integrated upper-computer system | Internal decision | Formal `subSysId`/`subSysType` coding not known | We decide we are a complete secondary subsystem; customer confirms IDs/coding | `项目现状认知草稿.md:53-62`; `01-协议与公共规则.md:63-72` |
| Device identity | Multiple internal devices, serial/network/SCOE channels | Reusable fact source only | No authoritative `deviceId` source yet | We decide device is business identity, not transport target; customer confirms device list/coding | `02-设备、状态与告警.md:47-113`; `connectionTargetsStore.ts:172-197` |
| `setTestTask` task dispatch | Old send task config/timer/trigger | Oracle-only behavior checklist | No external task context, resources, `ftpInfo`, case list, task params | We treat customer task as external container; old send task is not this task | `04-任务主链.md:48-73`; `src/stores/frames/sendTasksStore.ts:15-30` |
| Task/case relationship | Old send task and receive trigger mechanics | Partial internal fact source | Old model has no customer task/case transaction boundary | We decide task contains case(s); a task may contain one case | `04-任务主链.md:48-73`; `后面对接所需功能清单.md:144-164` |
| `startTestCaseList` | Manual send / timed send start behavior | Oracle-only | No native external start transaction | We treat it as task start for this phase; customer can confirm naming/grain | `04-任务主链.md:75-90`, `143-150` |
| `stop` control | Old stop/pause/resume controller | Oracle-only, with caveat | Old `stopTask` sets completed; no customer `stopped` semantic | We support only stop; stopped task state is `stopped` | `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`; `04-任务主链.md:110-126` |
| `pause` / `continue` / `abort` | Old task controller has partial local states | Not reused as northbound support | Customer docs list more actions than current desired scope | We do not support them in this phase; customer confirms unsupported response semantics | `04-任务主链.md:110-126`; `后面对接所需功能清单.md:54-66` |
| Status query / self-check | Status indicators from parsed receive values | Reusable fact source | No northbound `getSubSysState` response or self-check detail | We can define internal status sources; customer confirms external fields | `02-设备、状态与告警.md:115-132`; `src/stores/statusIndicators.ts:69-88` |
| Heartbeat | No matching old runtime feature found | Pure northbound gap | No heartbeat timer/protocol/response conflict resolved | Customer must confirm response model and interval semantics | `07-运维控制与链路保活.md:61-80`, `112-128`; `src-electron/main/ipc/index.ts:12-23` |
| Alarm | Local status/error signals only | Reusable fact source only | No device/subsystem alarm event model | Lightly reserve concept; customer confirms whether phase-one acceptance needs it | `02-设备、状态与告警.md:134-164`; `后面对接所需功能清单.md:548-550` |
| Case result | Receive parsed fields, expressions, send result | Reusable internal fact source | No `testCaseResultReport` transaction, enum, msg, or exception mapping | We decide case result is separate from task result; customer confirms fields/enums | `05-结果、文件与报告回传.md:89-106`; `src/stores/frames/receiveFramesStore.ts:1060-1181` |
| Task result summary | History/storage records and case facts | Reusable internal fact source | No customer task summary acceptance semantics | We decide task result aggregates case results plus termination reason | `后面对接所需功能清单.md:307-327`; `src-electron/main/ipc/historyDataHandlers.ts:304-465` |
| JSON TestReport | History/CSV/export, parsed values, execution facts | Reusable fact source only | No TestReport JSON content, naming, or delivery closure | We decide report is generated after task end/stop; customer confirms format | `05-结果、文件与报告回传.md:108-121`, `162-189`; `codestable/quality/rewrite-quality-rules.md:203-216` |
| FTP file return / HTTP completion notice | Local file export and high-speed storage | Oracle-only/local fact source | No FTP upload or completion notification loop | We decide generation is not delivery; customer confirms FTP and notification rules | `05-结果、文件与报告回传.md:137-143`, `190-198`; `src-electron/main/ipc/historyDataHandlers.ts:304-465` |
| Parameter cooperation | Task/case params and old frame/config inputs | Light consideration | Standalone parameter query/config not current mainline | Treat params as task/case-attached unless customer demands standalone params | `后面对接所需功能清单.md:30-41`; `06-参数协同与过程消息.md:53-144` |
| Use-case assets | Current execution/config concepts | Light consideration | Full use-case/script asset management is not current mainline | Reserve concept; do not equate use-case asset management with execution | `03-用例资产与脚本维护.md:15-23`, `197-213`; `二级子系统功能总览-待确认.md:85-124` |
| Upgrade/restart/ops | No current mainline match | Light consideration / gap | Not needed for task-result-report mainline unless customer requires | Reserve as complete-secondary-subsystem concern | `07-运维控制与链路保活.md:11-18`; `后面对接所需功能清单.md:544-547` |
| SCOE command path | SCOE command/config/status loops | Reusable fact source + oracle | Belongs to another customer/system identity | Reuse command-code patterns and facts; do not merge identity with this customer | `src/stores/frames/receiveFramesStore.ts:911-1030`; `src/stores/scoeStore.ts:216-340` |

## 4. Reusable Internal Fact Sources

Evidence:

- Receive pipeline can provide parsed current values, expressions, frame stats, trigger checks, and constellation data: `src/stores/frames/receiveFramesStore.ts:1060-1181`, `1252-1293`.
- Send pipeline can provide frame construction, send result, and serial/network target validation: `src/composables/frames/sendFrame/useUnifiedSender.ts:69-167`.
- Connection target store can provide transport availability and route identity, but only as serial/network transport paths: `src/stores/connectionTargetsStore.ts:56-63`, `77-120`, `172-197`.
- Storage/history/CSV can provide local execution records and exportable historical data, not northbound report closure: `src-electron/main/ipc/historyDataHandlers.ts:304-465`.
- High-speed storage can provide captured binary/data facts; matched storage data may bypass normal renderer receive event flow: `src-electron/main/ipc/networkHandlers.ts:498-520`.
- SCOE can provide command, config, status, and health facts: `src/stores/scoeStore.ts:216-340`, `src/stores/frames/receiveFramesStore.ts:911-1030`.

Inference:

- These sources can feed status, case result, task result, JSON report content, diagnostics, and future customer-facing summaries.
- These sources cannot by themselves define customer task lifecycle, device identity, report delivery, or acceptance semantics.
- Because SCOE is also command-code driven, its command and receive/send patterns are valuable reusable material even though it belongs to another customer/system.

Unknown:

- Which internal receive fields are official customer result fields is not confirmed. The later-connection checklist explicitly leaves key metrics such as bit error rate unconfirmed: `后面对接所需功能清单.md:94-105`, `423-443`.

## 5. Oracle-Only Legacy Behaviors

Evidence:

- Old send task statuses/timers/triggers are useful as a behavior checklist, but not as customer task lifecycle: `src/stores/frames/sendTasksStore.ts:15-30`, `109-122`.
- Old stop behavior clears timers/triggers and marks task completed, which conflicts with the workshop decision that customer stop should become `stopped`: `src/composables/frames/sendFrame/useSendTaskController.ts:26-65`.
- SCOE receive has fixed source path and early-return behavior: `src/stores/frames/receiveFramesStore.ts:1021-1030`, `1186-1205`.
- High-speed storage matching stores data and returns without normal renderer data emission: `src-electron/main/ipc/networkHandlers.ts:498-520`.
- Legacy inventory already classifies send task, SCOE, and storage/history as oracle candidates with caveats: `easysdd/compound/2026-04-27-legacy-feature-inventory-and-oracle-map.md:66-72`, `535-540`.

Inference:

- Oracle means the old behavior helps preserve local visible behavior or regression expectations. It does not mean the old concept can be renamed into the customer contract.
- Old stop behavior is specifically a negative oracle: it shows what must not leak into the new northbound task semantics.

Unknown:

- Which old UI-visible task behaviors must remain user-visible after northbound work is still not fully selected.

## 6. Pure Northbound Gaps

Evidence:

- Current IPC registration includes storage/serial/network/file/receive/high-speed/history/timer, but no northbound task/report/HTTP/FTP handler: `src-electron/main/ipc/index.ts:12-23`.
- Customer docs require HTTP/REST request-response and FTP file transfer: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:33-51`.
- Task dispatch, start, control, and file request are separate northbound transactions: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/04-任务主链.md:48-126`.
- Result notification, file completion, and TestReport are separate layers: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:125-143`.
- Heartbeat is separate from status query: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/07-运维控制与链路保活.md:157-164`.

Inference:

- Pure gaps include external transaction boundary, external identity source, heartbeat, alarm event, self-check response, JSON TestReport, FTP upload, HTTP completion notification, and customer-defined error/refusal semantics.
- Full device management, use-case asset maintenance, parameter cooperation, alarm, upgrade, and restart should be treated as northbound conceptual gaps with light reservation unless customer makes them phase-one acceptance items.

Unknown:

- Whether the customer accepts the practical minimum loop of task receive, task start, stop, status, case result, JSON report, and report/file delivery notice.

## 7. Dangerous False Equivalences

Evidence:

- Old send task must not be treated as `setTestTask` or `controlTestTask`: `codestable/quality/rewrite-quality-rules.md:188-201`.
- Old history/CSV/file export must not be treated as TestReport or file-return closed loop: `codestable/architecture/rewrite-target-structure.md:245`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/05-结果、文件与报告回传.md:137-143`.
- Serial/network target must not be treated as northbound device/deviceId: `src/stores/connectionTargetsStore.ts:172-197`; `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/01-协议与公共规则.md:63-72`.
- Use-case asset management is not task execution: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/03-用例资产与脚本维护.md:15-23`, `197-213`.
- Heartbeat, status, self-check, and alarm are different concerns: `refactor/docs/甲方文档/集成测试系统与各二级子系统接口设计-拆分/00-总览.md:80-85`; `07-运维控制与链路保活.md:157-164`.

Inference:

- These false equivalences are the main risk for later rework.
- The safe rule is to map by transaction boundary and semantics, not by similar names in old code or old UI.

Unknown:

- Some legacy UI labels may still look similar to customer terms. They need later mapping by behavior, not by label.

## 8. Decisions And Customer Questions

### 8.1 Decisions We Can Own Now

Inference:

- Internal system role: treat this application as a complete secondary subsystem.
- Identity separation: `deviceId` is business/device identity; serial/network target is communication transport; SCOE identity belongs to another customer/system.
- Task lifecycle baseline: `received -> running -> stopped / completed / failed`.
- Control scope: this phase supports `stop` only.
- Stop semantics: stop leads to `stopped`, not `completed` and not implicitly `failed`.
- Task/case relationship: task is external container; case is task execution unit; a task may contain one or more cases.
- Start semantics: treat `startTestCaseList` as task start for the current practical scope.
- Result aggregation: case has its own result; task result aggregates case results plus termination reason; stop does not erase completed case results; unexecuted or interrupted cases must not be reported as successful.
- Report/delivery sequence: execution end or stop, result aggregation, JSON TestReport generation, file upload/return, completion notification.
- Legacy boundary: receive/send/storage/SCOE facts can feed northbound outputs, but old send task/history/CSV/transport target must not become the customer contract.
- Complete-secondary-subsystem domains: device management, use-case assets, parameter cooperation, alarms, upgrade, and restart are reserved as business concepts, but are not the current mainline unless customer confirms acceptance scope.

### 8.2 Questions To Ask Customer Later

Unknown:

- Who assigns `subSysId`, `subSysType`, `deviceId`, device type, and address/coding values?
- How should multiple customer-visible devices map to our internal device concepts?
- Does the customer also treat `startTestCaseList` as task start, or can it later mean partial case-list start?
- Is `stop` enough for phase one? If `pause`, `continue`, or `abort` is sent, what response code and message should be returned?
- What external state name should be used after stop: `stopped`, `terminated`, `cancelled`, or another official value?
- What are the official case result, task result, exception code, `handleCode`, and refusal-execution enums?
- What fields are mandatory in case result and task summary? Which key metrics are phase-one required?
- What exact JSON TestReport depth is required: task layer, case layer, details, checkpoints, statistics items?
- What are the required file naming, directory, overwrite, retry, and retention rules for FTP?
- After FTP upload, is HTTP completion notification mandatory? How does the customer confirm receipt and acceptance?
- Should heartbeat have no response or a `heartbeatResponse`? What interval and timeout are expected?
- Are device management, use-case asset management, parameter cooperation, alarm, upgrade, and restart part of phase-one acceptance or just reserved capability?
- Is `ccSysGetFileRequest` in current scope or retained only as a pending interface?

## 9. Runtime / Hardware Validation Required

Evidence:

- Rewrite scope requires real serial/TCP/UDP/SCOE/package data path/northbound HTTP/FTP runtime validation: `codestable/compound/2026-04-28-rewrite-scope-default-preserve.md:156-164`.
- Quality rules list serial/TCP/UDP/SCOE/package path/HTTP/FTP as runtime or hardware validation requirements: `codestable/quality/rewrite-quality-rules.md:280-295`.

Inference:

- Static analysis can identify reusable facts and gaps, but cannot prove device identity, timing, heartbeat behavior, FTP completion, hardware stop effects, SCOE production correctness, or customer acceptance.
- Stop semantics especially need runtime validation because old local stop behavior currently maps to completed, while northbound semantics should be stopped.

Unknown:

- Available real hardware, customer simulator, FTP server, formal northbound peer, package environment, and acceptance data are not confirmed.

## 10. Impact On Rewrite Structure

Evidence:

- Existing target structure already separates connection, receive, send, task, storage, status, result, report, and northbound responsibilities: `codestable/architecture/rewrite-target-structure.md:91-104`.
- It explicitly separates result, report, and delivery: `codestable/architecture/rewrite-target-structure.md:248-263`.
- It places JSON report under report concern and FTP/HTTP completion under northbound/platform concern: `codestable/architecture/rewrite-target-structure.md:264-279`.

Inference:

- This workshop reinforces the existing separation; it does not add interface schema or implementation module design.
- Internal facts may feed northbound outputs, but northbound transaction semantics remain separate.
- The most important boundary constraints are:
  - task is not old send task;
  - device is not serial/network target;
  - report is not history/CSV;
  - delivery completion is not local file generation;
  - SCOE can be reused as command-code material but not merged into current customer identity.

Unknown:

- Final external names, codes, and acceptance values depend on customer decisions in section 8 and runtime validation in section 9.

## 11. Recommended Next Discussion

Evidence:

- Current project notes already recommend confirming minimum business loop, formal role, control granularity, result fields, delivery method, internal process visibility, and runtime validation boundary: `项目现状认知草稿.md:351-367`, `368-438`, `462-495`.
- The later-connection checklist describes the closed loop as task, execution, case result, task report, and delivery rather than a flat list of interface titles: `后面对接所需功能清单.md:577-581`.

Inference:

- Next discussion should not start from schema. It should freeze transaction boundaries and acceptance scenarios first.
- Suggested next order:
  1. Confirm phase-one northbound minimum loop and explicitly excluded domains.
  2. Confirm identity model: subsystem, device, instance, and transport target separation.
  3. Confirm task/control lifecycle semantics: dispatch, start, stop, stopped.
  4. Confirm result/error/report/file delivery semantics.
  5. Map reusable internal facts to each confirmed output.
  6. Define runtime/hardware validation plan.

Unknown:

- Whether the customer can provide simulator, formal interface appendix, example task payload, example TestReport, FTP environment, and acceptance cases.
