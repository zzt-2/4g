---
doc_type: explore
type: regression-protection-plan
memo_type: Batch 1A regression protection plan
status: current
date: 2026-04-24
summary: Regression protection plan for Batch 1A cleanup, focused on command checks, manual verification, protected current behavior, failure paths, trigger paths, and SCOE early-return observations before any implementation cleanup.
tags:
  - cleanup-first
  - batch-1a
  - regression-protection
  - receive-chain
  - trigger-boundary
  - scoe
---

# Batch 1A regression protection plan

## Context recap

Facts:

- Batch 1A first cut is the current implementation-entry prerequisite work item. It covers the current receive input facts and trigger listener boundary, but explicitly does not enter send-task lifecycle, common sender, SCOE domain model, result/report, Platform API layering, or feature design. `easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:34-43`
- Guardrail Gate 3 requires an explicit cleanup plan plus regression protection or clear verification path before implementation cleanup. The implementation must remain small, reversible, and behavior-preserving. `easysdd/compound/2026-04-24-cleanup-to-design-process-guardrail.md:138-154`
- Code reality check confirms the current first-cut chain: serial/network inbound -> `receiveFramesStore.handleReceivedData` -> common receive API -> success/failure side effects -> `checkTriggerConditions` -> `sendTasksStore.handleFrameReceived` -> trigger listener. `easysdd/compound/2026-04-24-code-reality-check-before-1a-cleanup-plan.md:32-63`
- This document is a regression protection plan only. It does not design a new trigger candidate object, lifecycle enum, SCOE model, result/report object, Platform API boundary, test framework, or implementation patch.

Sub-agent synthesis:

- `test-engineer` memo converged the protected regression matrix around inbound reachability, processing order, success/failure side effects, trigger matching, SCOE early return, and command limits.
- `debugger` memo highlighted the most fragile behavior: fire-and-forget async receive calls, pending queue exception behavior, SCOE consume/fall-through return semantics, trigger mapping readback, receive stat clearing, and task/listener registry separation.
- `critic` memo challenged the optimistic gaps: `pnpm test` is empty, lint does not cover async promise failures, build cannot prove runtime behavior, SCOE has more than one early-return state, and trigger validation must cover multi-condition and mapping miss cases.

Decision:

- The minimum protection bar after a first patch is `pnpm lint` + `pnpm build` + explicit record that `pnpm test` is not a real suite + the manual verification matrix below. Passing commands alone is not sufficient.

## Verification scope

In scope:

- Serial inbound to unified receive entry: `src/stores/serialStore.ts:31-34`, `src/stores/serialStore.ts:177-193`, `src/stores/serialStore.ts:391-417`
- Network inbound to unified receive entry and `lastActivity`: `src/stores/netWorkStore.ts:200-218`, `src/stores/netWorkStore.ts:296-300`
- Receive processing lock, pending queue, success/failure handling, current-value side effects, trigger forwarding, and clear stats: `src/stores/frames/receiveFramesStore.ts:805-891`, `src/stores/frames/receiveFramesStore.ts:899-1045`, `src/stores/frames/receiveFramesStore.ts:1050-1142`, `src/stores/frames/receiveFramesStore.ts:1186-1240`
- Trigger listener matching, condition evaluation, mapping readback, one-shot cleanup, and error cleanup: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:100-158`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-218`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:223-305`
- `sendTasksStore` trigger forwarding and task removal/status side effects that are directly observable from the trigger path: `src/stores/frames/sendTasksStore.ts:401-434`, `src/stores/frames/sendTasksStore.ts:455-520`, `src/stores/frames/sendTasksStore.ts:533-562`
- SCOE early-return and SCOE receive-cache observation: `src/stores/frames/receiveFramesStore.ts:899-991`, `src/stores/frames/receiveFramesStore.ts:1015-1021`, `src/utils/receive/scoeFrame.ts:167-213`, `src/utils/receive/scoeFrame.ts:416-435`

Out of scope:

- No test code.
- No test framework selection.
- No feature behavior.
- No refactor patch plan.
- No design of lifecycle, trigger candidate schema, report/result schema, SCOE command model, or Platform API isolation.

## Command checks

Facts:

- `pnpm lint` runs ESLint over `./src*/**/*.{ts,js,cjs,mjs,vue}`. `package.json:8-12`
- `pnpm build` runs `quasar build -m electron`. `package.json:14-18`
- `pnpm test` is only `echo "No test specified" && exit 0`. `package.json:12`
- The Quasar config has strict TypeScript enabled, but the `vite-plugin-checker` block is commented out. `quasar.config.ts:50-54`, `quasar.config.ts:112-120`
- ESLint disables several async/type-safety rules, including `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises`. `eslint.config.js:39-59`

Required command handling:

| Command | Required role | What it can catch | What it cannot prove |
| --- | --- | --- | --- |
| `pnpm lint` | Baseline static gate before and after patch | Syntax/lint/import-level mistakes covered by configured ESLint | Receive ordering, async rejection, SCOE bypass, trigger matching, runtime side effects |
| `pnpm build` | Baseline Electron/Quasar build gate before and after patch | Bundling, compile/config/import breakage visible to Quasar build | Serial/network device behavior, parsing results, task trigger behavior, SCOE result routing |
| `pnpm test` | Record-only command | Only proves the placeholder script exits 0 | Any Batch 1A behavior; it is not an effective test suite today |

Plan decision:

- Verification reports must not say “tests passed” as regression evidence unless they explicitly say `pnpm test` is currently a placeholder with no effective suite.
- If a first patch touches only docs, commands are optional. If it touches any code in the Batch 1A chain, `pnpm lint` and `pnpm build` are the minimum command checks.

## Manual verification matrix

| ID | Area | Setup / action | Expected observation | Evidence |
| --- | --- | --- | --- | --- |
| MV-01 | Serial inbound | Connect or simulate a serial port and inject one matching receive frame | Port received message is recorded; unified receive path is called with `serial`, `portPath`, and `Uint8Array`; receive stats/current values update | `src/stores/serialStore.ts:391-417` |
| MV-02 | Network inbound | Create or simulate a network connection and inject one matching receive frame | Unified receive path is called with `network`, `connectionId`, and `Uint8Array`; `lastActivity` updates | `src/stores/netWorkStore.ts:207-218` |
| MV-03 | Source identity | Configure a trigger listener for `serial:<portPath>` or `network:<connectionId>` and inject a matching frame | Listener matches the concatenated source identity, not the raw source ID alone | `src/stores/frames/receiveFramesStore.ts:1127-1138`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92` |
| MV-04 | Processing order | Rapidly inject two distinguishable successful frames A then B | Recent packet, current values, expression result, frame stats, and trigger evaluation reflect A before B | `src/stores/frames/receiveFramesStore.ts:857-891` |
| MV-05 | Success side effects | Inject a matching frame with direct mapped fields | Matched count increases; recent packet records; `frameDataCache` updates; `groups.value/displayValue` updates; `frameStats` updates | `src/stores/frames/receiveFramesStore.ts:1050-1089`, `src/stores/frames/receiveFramesStore.ts:1107-1125` |
| MV-06 | Expression side effect | Configure a direct field and an expression field, then update the direct field | Direct field updates first; expression calculation runs; expression failure, if forced, does not block later side effects | `src/stores/frames/receiveFramesStore.ts:1075-1099` |
| MV-07 | Constellation side effect | Inject a frame containing a mapped `bytes` data item | Constellation collection receives the matching frame/field data; non-`bytes` or empty value is not treated as collected data | `src/stores/frames/receiveFramesStore.ts:1101-1105`, `src/stores/frames/receiveFramesStore.ts:1149-1180` |
| MV-08 | Failure result | Inject unmatched data and parse-error data | Unmatched count increases; parse error count increases only for parse/解析 errors; recent packet and warning behavior remain observable; trigger path does not run | `src/stores/frames/receiveFramesStore.ts:1027-1045` |
| MV-09 | API fallback | Run or simulate receive API unavailable behavior | Fallback returns `success:false` with an error, and the receive chain handles it as a failed result instead of crashing synchronously | `src/api/common/receiveApi.ts:41-48`, `src/stores/frames/receiveFramesStore.ts:1027-1045` |
| MV-10 | Queue failure | Rapidly inject a packet that makes `processDataInternal` throw, followed by a valid packet | Record whether the valid packet remains pending or is processed; do not claim this is protected unless the observed current behavior is explicitly preserved | `src/stores/frames/receiveFramesStore.ts:873-891`, `src/stores/frames/receiveFramesStore.ts:1140-1142` |
| MV-11 | Trigger empty conditions | Use a `waiting-trigger` task with matching frame/source and no conditions | Empty condition list triggers on receive | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:100-107` |
| MV-12 | Trigger condition operators | Cover `equals`, `not_equals`, `greater`, `less`, `contains`, unknown operator, AND, OR, and field missing cases | Operators retain current string/number conversion behavior; unknown operator and unrecoverable missing field return false according to current path | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:113-158`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:189-218` |
| MV-13 | Mapping readback | Configure condition field with valid mapping, missing mapping, and mapping whose data item is absent from current items | Valid mapping can trigger; missing mapping or missing data item remains non-triggering and visible through warning behavior | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-184` |
| MV-14 | Task state gate | Repeat a matching frame/source/condition for `waiting-trigger`, `running`, paused/error/completed, and missing task states | Only `waiting-trigger` reaches condition evaluation in `handleFrameReceived`; execution path still rechecks `running` or `waiting-trigger` before executing | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:79-92`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:236-245` |
| MV-15 | One-shot trigger cleanup | Use `continueListening=false` and trigger once | Listener unregisters; task status is set to completed; progress updates to 100 by current behavior | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:282-293` |
| MV-16 | Trigger failure cleanup | Force trigger execution to throw | Task status becomes error; listener unregisters; executor cache cleanup path is invoked by current behavior | `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:294-305` |
| MV-17 | Receive stats clear | Receive a successful frame, then call `clearReceiveStats()` | Recent packets, frame stats, and frame data cache clear; `groups.value/displayValue` are not asserted as cleared by this function | `src/stores/frames/receiveFramesStore.ts:1236-1240` |
| MV-18 | Task/listener registry separation | Clear tasks and inspect trigger listener stats | Task list clearing does not by itself prove listener registry is empty; listener count must be observed separately if cleanup touches reset behavior | `src/stores/frames/sendTasksStore.ts:512-519`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:332-390` |
| MV-19 | SCOE early return | Send `scoe-tcp-server` data for SCOE success, checksum failure, unknown command, unloaded non-`01`, and unloaded `01` | Preserve current true-bypass vs false-fallthrough distinction; see SCOE section below for exact observation | `src/stores/frames/receiveFramesStore.ts:899-991`, `src/stores/frames/receiveFramesStore.ts:1015-1021`, `src/utils/receive/scoeFrame.ts:167-213` |
| MV-20 | SCOE completion cache observation | Exercise SCOE completion condition that reads a receive field | Completion condition still observes `allReceiveFrameData` from the receive store; do not redesign whether that should remain true | `src/utils/receive/scoeFrame.ts:416-435` |

## Protected behavior matrix

| Protected behavior | Current behavior to preserve | Regression symptom | Required verification |
| --- | --- | --- | --- |
| Serial reachability | Serial data is filtered by `portPath`, recorded in port messages, then passed to receive processing as `serial` + `portPath` | Serial UI shows messages but receive stats/current values/trigger do not update | MV-01, MV-03 |
| Network reachability | Network data is converted to `Uint8Array`, processed as `network` + `connectionId`, and updates `lastActivity` | Network activity updates but receive chain is silent, or source matching breaks | MV-02, MV-03 |
| Processing serialization | `processingLock` queues concurrent requests and drains FIFO after first processing completes | Fast frames reorder, current values skip, or pending requests hang | MV-04, MV-10 |
| Failure result handling | Failed receive result increments unmatched, optionally increments parse errors, records recent packet, warns, then returns | Bad data reaches success side effects or trigger path; parse-error count disappears | MV-08, MV-09 |
| Success side effects | Success updates matched, recent packet, cache, groups, expression, constellation, frame stats, then trigger check | UI values update but cache/stats/trigger diverge, or expression/constellation side effects disappear | MV-05, MV-06, MV-07 |
| Trigger source and data facts | Trigger uses `source + ':' + sourceId`, then converts simplified updated items into `DataItem[]` through `groups` readback | Listener never matches old source IDs; condition fields no longer resolve | MV-03, MV-13 |
| Trigger condition semantics | Empty conditions trigger; no data items return false; known operators work; unknown/exception returns false | Cleanup “simplifies” conditions and changes existing trigger eligibility | MV-11, MV-12 |
| Trigger state gate | `handleFrameReceived` only evaluates tasks still in `waiting-trigger`; execution path rechecks `running` or `waiting-trigger` | Paused/completed/missing tasks execute, or waiting tasks stop triggering | MV-14 |
| Trigger cleanup paths | One-shot success unregisters and completes; failure sets error and unregisters | Old listeners remain live, or failed tasks look completed | MV-15, MV-16, MV-18 |
| SCOE early-return semantics | `scoe-tcp-server` data can be consumed before common receive API, but some SCOE-like failures fall through | SCOE data enters wrong parser, or non-consumed data stops falling through | MV-19 |
| Receive clearing boundary | `clearReceiveStats` clears recent packets, frame stats, and frame data cache only | Cleanup assumes current group values are cleared, or cache remains stale | MV-17 |

## Failure-path coverage

Must cover:

- Receive API unavailable fallback: `receiveAPI.handleReceivedData` returns `success:false` and an error when `window.electron.receive.handleReceivedData` is absent. `src/api/common/receiveApi.ts:41-48`
- Failed result path: `!result.success` increments unmatched, conditionally increments parse error, records recent packet, warns, then returns. `src/stores/frames/receiveFramesStore.ts:1027-1045`
- Thrown exception path: `processDataInternal` logs and rethrows. `src/stores/frames/receiveFramesStore.ts:1140-1142`
- Queue path under failure: pending queue drains only after the first `processDataInternal` call returns successfully into the drain loop. `src/stores/frames/receiveFramesStore.ts:873-887`
- Fire-and-forget inbound calls: serial and network callers do not await `handleReceivedData`. `src/stores/serialStore.ts:414-419`, `src/stores/netWorkStore.ts:210-218`

Manual checks:

- One unmatched frame must not enter trigger.
- One parse-error frame must distinguish unmatched vs parse error.
- One receive API unavailable case must be recorded as failed result, not as implementation proof.
- One exception case followed by a valid frame must be observed and documented. If the valid frame hangs today, record it as current fragile behavior rather than treating it as a required successful outcome.

Decision:

- Failure-path verification is mandatory after any patch that touches `handleReceivedData`, `processDataInternal`, `receiveAPI.handleReceivedData`, queue handling, or inbound caller behavior.

## Trigger-path coverage

Must cover:

- Source matching uses concatenated source identity from receive store. `src/stores/frames/receiveFramesStore.ts:1127-1138`
- `sendTasksStore.handleFrameReceived` is only a forwarding boundary to the trigger listener. `src/stores/frames/sendTasksStore.ts:553-562`
- Listener first matches `triggerFrameId` and `sourceId`, then checks that the task still exists and is `waiting-trigger`. `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:70-92`
- Conditions support empty list, no data items, missing field, AND/OR aggregation, and five known operators. `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:100-158`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:189-218`
- Field lookup reads `receiveFramesStore.mappings` globally by `fieldId`, then matches `dataItemId` in current data items. `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-184`
- One-shot success and failure paths both unregister listeners by current behavior. `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:282-305`

Minimum trigger matrix:

| Case | Must observe |
| --- | --- |
| Matching frame + matching source + waiting task + empty conditions | Triggers |
| Matching frame + raw source ID without prefix | Does not match current listener source convention |
| Matching frame + non-waiting task in `handleFrameReceived` | Does not evaluate conditions |
| No `dataItems` with non-empty conditions | Returns false |
| Missing mapping | Returns false through mapping miss |
| Mapping exists but item absent | Returns false through data item miss |
| `equals` / `not_equals` / `greater` / `less` / `contains` | Retain current conversion semantics |
| Unknown operator | Returns false |
| AND and OR multi-condition cases | Retain current `logicOperator` sequencing |
| `continueListening=false` success | Listener removed and task completed |
| Trigger execution error | Listener removed and task marked error |

Guardrail:

- Do not turn this section into a task lifecycle design. It protects current trigger behavior only.

## SCOE early-return observation

Facts:

- SCOE branch is entered only when `sourceId === 'scoe-tcp-server'`. `src/stores/frames/receiveFramesStore.ts:1015-1017`
- If `handleScoeFrame(data)` returns true, `processDataInternal` returns before `receiveAPI.handleReceivedData`. `src/stores/frames/receiveFramesStore.ts:1017-1024`
- `handleScoeFrame` returns false when the data is not SCOE, and also returns false when a SCOE frame is recognized but no command code is found. `src/stores/frames/receiveFramesStore.ts:918-947`
- Checksum failure records SCOE receive data and returns true, so it is consumed by the SCOE path and bypasses common receive. `src/stores/frames/receiveFramesStore.ts:951-965`
- Successful SCOE command execution records receive data and returns true. `src/stores/frames/receiveFramesStore.ts:979-991`
- Before SCOE frames are loaded, `isScoeFrame` only accepts command code `01`; other commands return non-SCOE. `src/utils/receive/scoeFrame.ts:191-212`
- SCOE completion conditions read `useReceiveFramesStore().allReceiveFrameData`. `src/utils/receive/scoeFrame.ts:416-435`

Observation matrix:

| SCOE input state | Current expected branch | Verification note |
| --- | --- | --- |
| `sourceId !== 'scoe-tcp-server'` | Skip SCOE branch; enter common receive API | Protect source-specific SCOE gate |
| `scoe-tcp-server`, non-SCOE data | `handleScoeFrame` returns false; common receive API still runs | Protect false-fallthrough |
| `scoe-tcp-server`, SCOE-like but no command code | Error is recorded; returns false; common receive API still runs | Protect non-command fallthrough |
| `scoe-tcp-server`, checksum failure | Error is recorded; returns true; common receive API is bypassed | Protect consume-with-error |
| `scoe-tcp-server`, valid command | Command executes; receive data records; returns true; common receive API is bypassed | Protect success consume |
| SCOE not loaded, command `01` | May be accepted as loading command if satellite ID extraction succeeds | Protect unloaded loading rule |
| SCOE not loaded, command not `01` | Returns non-SCOE | Protect unloaded rejection rule |

Stop condition:

- If a cleanup patch needs to reinterpret SCOE command success, fixed targets, completion semantics, link-check behavior, receive-data recording, or whether SCOE should bypass common receive, stop and create Batch 1D SCOE observation/scope first. `easysdd/compound/2026-04-24-batch-1a-first-cut-cleanup-plan.md:171-181`

## What cannot be verified today

Facts:

- There is no effective automated test suite behind `pnpm test`; it is a placeholder. `package.json:12`
- No project test directory was found in the limited source/test search; no Vitest/Jest/Playwright/Cypress dependency was found in the inspected project config files.
- Lint intentionally disables async promise rules that would otherwise catch some fire-and-forget or misused promise cases. `eslint.config.js:39-59`
- Serial and network verification may require real devices, Electron runtime, IPC/preload availability, or test harnesses that this plan does not create.

Cannot verify today without additional setup:

- Real serial hardware behavior across OS/device drivers.
- Real network socket timing under high-throughput packet bursts.
- Electron preload/IPC availability under all packaging modes.
- End-to-end SCOE command execution correctness beyond early-return observation.
- UI-only visual confirmation of every display surface unless a running app and representative configuration/data are available.
- True automated regression coverage, because no test suite exists.

Plan decision:

- These gaps do not block writing the first cleanup patch, but they block claiming strong regression safety from commands alone.

## Minimum verification required after first patch

Before patch, capture baseline:

- Record whether `pnpm lint` passes.
- Record whether `pnpm build` passes.
- Record that `pnpm test` is a placeholder and not sufficient.
- If a manual path cannot be executed because hardware/config/runtime is unavailable, record it as not verified, not as passed.

After any first Batch 1A code patch:

1. Run `pnpm lint`.
2. Run `pnpm build`.
3. Optionally run `pnpm test`, but record it only as placeholder status.
4. Execute MV-01 through MV-10 if the patch touches receive entry, queueing, parse success/failure, cache/stats, expression, constellation, or receive API fallback.
5. Execute MV-11 through MV-18 if the patch touches trigger forwarding, `DataItem[]` construction, `mappings`, `sendTasksStore`, listener behavior, task status gate, or cleanup behavior.
6. Execute MV-19 through MV-20 if the patch touches or could change `sourceId`, SCOE early return, `frameDataCache`, `allReceiveFrameData`, or receive success/failure branching around SCOE.

Minimum pass criteria:

- `pnpm lint` and `pnpm build` complete successfully, or failures are explicitly identified as pre-existing and unrelated with evidence.
- `pnpm test` is not used as sufficient evidence.
- All manual paths relevant to touched code are either passed with observations or explicitly marked “not verified” with the missing prerequisite.
- No new behavior is claimed as feature design.
- No current mixed fact is promoted into target architecture: `groups`, `mappings`, `allReceiveFrameData`, `DataItem[]`, `waiting-trigger`, SCOE bypass, and send-task listener state remain protected current behavior only.
- Any need to change SCOE semantics, task lifecycle semantics, common sender behavior, result/report behavior, or Platform API layering triggers a stop back to the appropriate observation/decision gate.
