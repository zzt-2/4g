# 东方红 rewrite Claude Code handoff

Date: 2026-05-06

This handoff is for continuing the 东方红上位机 rewrite in Claude Code after the Codex conversation ran out of quota.

Full transcript exported by script:

- `.sessions/rewrite-claude-handoff/2026-05-06-codex-session.md`
- Source JSONL: `/home/zzt/.codex/sessions/2026/04/29/rollout-2026-04-29T15-45-22-019dd833-1ff3-7b33-963b-0741eb0a8f08.jsonl`
- Export command used:
  `node /home/zzt/.codex/scripts/codex-jsonl-to-md.mjs /home/zzt/.codex/sessions/2026/04/29/rollout-2026-04-29T15-45-22-019dd833-1ff3-7b33-963b-0741eb0a8f08.jsonl --out .sessions/rewrite-claude-handoff/2026-05-06-codex-session.md`

Use this handoff as the practical entry point. Use the full transcript only when a detail is missing or disputed.

## Immediate Reading Order

Start by reading:

1. `AGENTS.md`
2. `codestable/compound/2026-04-28-rewrite-execution-charter.md`
3. `codestable/architecture/rewrite-target-structure.md`
4. `codestable/quality/rewrite-quality-rules.md`
5. `codestable/quality/rewrite-review-checklist.md`
6. This handoff

For current next work, also read:

- `codestable/features/rewrite-status/rewrite-status-design.md`
- `codestable/features/rewrite-display/rewrite-display-design.md`
- `codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md`
- Current code under `rewrite/src/features/{frame,settings,storage-local-baseline,connection,receive,status,display}`

## Collaboration Preferences To Preserve

- User prefers Chinese, facts-first, findings-first.
- Default is discuss and lock boundary before implementation.
- Do not expand current round scope opportunistically.
- Do not claim completion without fresh verification evidence.
- Do not run heavy work unless requested. The user often says not to run build during narrow implementation or document rounds.
- Use `pnpm`.
- Do not read or modify generated frontend types.
- If implementation/review starts, always state:
  - Direct contract
  - Boundary guards
  - Changed files
  - Verify evidence
  - Open issues
- For reviews, findings first, ordered by severity.

## Hard Rules

### Rewrite root

- New app root is `rewrite/`.
- Old `src/`, `src-electron/`, `public/` are evidence/oracle/migration input only.
- Do not land new rewrite code in old `src/`.

### Electron/platform boundary

Rewrite default:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: false
```

Rules:

- Renderer must not directly access Node/Electron/IPC/fs/path/net/serialport.
- Renderer accesses desktop ability through `rewrite/src/platform` facade only.
- Preload exposes typed bridge only; no raw `invoke/send/on`.
- Main owns platform resources and lifecycle; it may own necessary high-frequency buffer/batch/queue/backpressure, but not business semantics.
- Main must not parse frames, match receive, advance task state, interpret SCOE, build report semantics, convert northbound errors, or define customer status.

### Feature boundary

- `features/*/core` must be pure TypeScript: no Vue, Pinia, Electron, platform facade, global store, Node.
- Feature root `index.ts` is the public API surface.
- Outside a feature, do not import feature internal subpaths such as `state`, `services`, `adapters`, `fixtures`, `core`, unless a specific design explicitly permits it.
- Feature root must not export mutable state containers, default mutable instances, fake adapter default instances, or internal state creators.
- Cross-feature communication must use public service/reader/selectors, runtime orchestration, or explicit events.
- Runtime is composition root and wiring layer only; it must not become a global business center.

### UI style baseline

This is now a hard rule in `AGENTS.md` and `codestable/architecture/rewrite-ui-style-baseline.md`.

- Rewrite UI styling is Quasar + `rewrite/src/css` SCSS token based.
- Business components, pages, widgets, UnoCSS classes, and inline styles must not hard-code visual tokens.
- Primitive visual values belong only under `rewrite/src/css/tokens/*`.
- UnoCSS is only a small structural utility layer, not the main visual system.
- Quasar official props/helpers may be used as Quasar token scale, for example `color="primary"`, `q-pa-*`, `row/col`, `text-h*`, `shadow-*`.
- Style work must statically scan for hardcoded hex/rgb/hsl, raw visual px/rem/em values, and visual UnoCSS utilities.

## Current Progress Summary

### Stable foundation

- Architecture baseline exists and is mostly stable.
- `rewrite/` independent Quasar + Vue 3 + TypeScript + Electron app exists.
- GUI opens and packaging/build has been confirmed previously by user/conversations.
- UI style baseline is implemented and documented.
- Validation baseline is documented.
- Thin UI/runtime wiring has been tested only as a minimal writing-style probe; do not expand UI yet.

### Implemented small TypeScript feature loops

All below are pure feature-local TypeScript loops with tests and no real platform/hardware:

| Feature | Code path | Status | Notes |
| --- | --- | --- | --- |
| frame | `rewrite/src/features/frame` | implemented small loop | core/service/state/selector/public index; legacy migration pilot; static frame asset owner |
| settings | `rewrite/src/features/settings` | implemented small loop | config facts/defaults/normalize/snapshot only |
| storage-local-baseline | `rewrite/src/features/storage-local-baseline` | implemented small loop | local-only core/fake adapter/history/CSV/material; not report/northbound |
| connection | `rewrite/src/features/connection` | implemented fake loop | transport-only fake adapter/state/service/selectors; no real serial/TCP/UDP |
| receive | `rewrite/src/features/receive` | implemented fake loop | receive matching/read model/fake input; no real high-frequency hardware path |
| status | `rewrite/src/features/status` | implemented small loop | health summary/indicator read model/UI-safe snapshot from explicit material inputs |
| display | `rewrite/src/features/display` | implemented small loop | display preferences and table/chart/constellation projection; no UI drawing |

Latest user-pasted verification:

- status: `pnpm -C rewrite test` passed, 15 files / 127 tests; lint passed; boundary `rg` checks passed; verdict `pass-with-known-gaps`.
- display: `pnpm -C rewrite test` passed, 16 suites / 153 tests; lint passed; boundary `rg` checks passed; verdict `pass-with-known-gaps`.
- connection bridge implementation design: doc/checklist created; verdict `ready-for-bridge-implementation`, subject to native dependency/setup gates.

Do not treat status/display known gaps as failures. They mean runtime/hardware/upstream-public-material validation is still pending.

### Designed but not yet implemented

| Area | Docs | Status |
| --- | --- | --- |
| connection real platform bridge | `codestable/architecture/rewrite-connection-platform-bridge.md`, `codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md` | ready for bridge implementation only after native dependency/setup gates |
| thin UI/runtime wiring | `codestable/architecture/rewrite-thin-ui-runtime-wiring.md` | design exists; minimal probe done; do not expand pages yet |
| UI style baseline | `codestable/architecture/rewrite-ui-style-baseline.md` | implemented baseline; use in every UI round |

### Not started / do not start without design

- send
- task
- SCOE
- result/report/northbound
- real serial/TCP/UDP implementation beyond bridge gates
- high-speed storage final model
- full UI page batches
- customer/TestReport/HTTP/FTP closure

## Formal Documents Created Or Updated In This Thread

Architecture/foundation:

- `codestable/architecture/rewrite-target-structure.md`
- `codestable/architecture/rewrite-system-architecture.md`
- `codestable/architecture/rewrite-feature-boundaries.md`
- `codestable/architecture/rewrite-feature-interaction-matrix.md`
- `codestable/architecture/rewrite-shared-tooling-audit-plan.md`
- `codestable/architecture/rewrite-pre-design-gate-and-sequencing.md`
- `codestable/architecture/rewrite-platform-api-surface-reduction.md`
- `codestable/architecture/rewrite-shared-tooling-app-shell-ownership.md`
- `codestable/architecture/rewrite-platform-app-shell-file-dialog.md`
- `codestable/architecture/rewrite-connection-transport-boundary.md`
- `codestable/architecture/rewrite-thin-ui-runtime-wiring.md`
- `codestable/architecture/rewrite-ui-style-baseline.md`
- `codestable/architecture/rewrite-connection-platform-bridge.md`

Quality:

- `codestable/quality/rewrite-quality-rules.md`
- `codestable/quality/rewrite-review-checklist.md`
- `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`

Feature design/checklist:

- `codestable/features/rewrite-frame/rewrite-frame-design.md`
- `codestable/features/rewrite-frame/rewrite-frame-checklist.yaml`
- `codestable/features/rewrite-settings/rewrite-settings-design.md`
- `codestable/features/rewrite-settings/rewrite-settings-checklist.yaml`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`
- `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-checklist.yaml`
- `codestable/features/rewrite-connection/rewrite-connection-design.md`
- `codestable/features/rewrite-connection/rewrite-connection-checklist.yaml`
- `codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md`
- `codestable/features/rewrite-receive/rewrite-receive-design.md`
- `codestable/features/rewrite-receive/rewrite-receive-checklist.yaml`
- `codestable/features/rewrite-status/rewrite-status-design.md`
- `codestable/features/rewrite-status/rewrite-status-checklist.yaml`
- `codestable/features/rewrite-display/rewrite-display-design.md`
- `codestable/features/rewrite-display/rewrite-display-checklist.yaml`

Process/handoff:

- `.sessions/rewrite-claude-handoff/2026-05-06-codex-session.md`
- `.sessions/rewrite-claude-handoff/2026-05-06-rewrite-handoff.md`

## Current Code Shape

Expected feature directories:

```text
rewrite/src/features/
  connection/
  display/
  frame/
  receive/
  settings/
  status/
  storage-local-baseline/
```

Each implemented feature generally follows:

```text
core/
state/
services/
selectors/
fixtures/
__tests__/
index.ts
```

Some feature-specific adapter folders exist:

- `connection/adapters`
- `receive/adapters`
- `storage-local-baseline/adapters`

Do not assume all features need adapters. Add only if the design/checklist requires it.

## Feature Owner Summary

| Feature | Owns | Does not own |
| --- | --- | --- |
| frame | static frame assets, field/expression definitions, validation, legacy migration | receive facts, send/task/SCOE/report/northbound semantics |
| settings | user-visible config facts, defaults, normalize, snapshots | connection/status/display/chart runtime semantics |
| storage-local-baseline | local material/history/CSV candidates, fake adapter boundary | platform file API, report delivery, northbound delivery, high-speed final model |
| connection | transport config, runtime connection facts, lifecycle/error/event, fake/real transport port boundary | frame parsing, receive matching, send task, SCOE semantics, report/northbound |
| receive | receive matching, parse output, receive runtime facts, statistics/read model | frame definition truth, connection transport facts, task state, SCOE/report/northbound |
| status | health summary, status indicators, status read model/UI-safe snapshot | underlying connection/receive/task/SCOE/result truth |
| display | display preferences, table/chart/constellation projections, UI-safe display snapshots | receive runtime facts, connection facts, settings persistence, status health, report/northbound |

## Known Gaps And Blockers

High-priority blockers:

- Real connection bridge implementation requires native dependency setup:
  - serialport
  - electron-rebuild
  - Vite external handling
  - asarUnpack/package handling
- Queue/batch/backpressure parameters need runtime evidence. Current docs only define principles and gates.
- Real serial/TCP/UDP hardware validation is not complete.
- Packaged native bridge validation is not complete.

Feature gaps:

- `settings` does not yet persist complete display preference fields or status indicator config fields.
- `display` currently keeps chart history buffer in service memory; persistence is deferred by design.
- `receive` fake implementation exists, but real high-frequency receive path is not validated.
- `status` can consume explicit material inputs but runtime integration from real connection/receive/status public material is still pending.

Not-to-claim:

- No real hardware chain complete.
- No packaged native module behavior complete.
- No SCOE complete.
- No HTTP/FTP/northbound/TestReport/customer closure complete.
- No full UI page system complete.

## Current Judgment

The rewrite is past initial calibration. It is reasonable to continue with parallel narrow lanes, but not to jump into broad UI or customer/hardware closure.

Recommended immediate next step:

1. Cross-review current `status`, `display`, `receive`, `connection`, and `connection bridge implementation design`.
2. If pass, choose between:
   - connection real bridge implementation prep, including native dependency setup, or
   - status/display thin runtime/UI read-only integration, or
   - send/task design.

Do not implement real serial/TCP/UDP before reading `rewrite-connection-bridge-implementation-design.md` and satisfying its gate criteria.

## Recommended Next Claude Prompt

Use this as the first Claude Code prompt:

```text
本轮是东方红 rewrite 的 status/display/receive/connection bridge 交接后交叉审查。

Lane 判定：
- Lane B review。
- 只读审查，不写业务代码。
- 不运行 build。
- 可以运行 pnpm -C rewrite test、pnpm -C rewrite lint、rg 边界检查。

Direct contract：
- AGENTS.md
- .sessions/rewrite-claude-handoff/2026-05-06-rewrite-handoff.md
- codestable/compound/2026-04-28-rewrite-execution-charter.md
- codestable/architecture/rewrite-target-structure.md
- codestable/architecture/rewrite-system-architecture.md
- codestable/architecture/rewrite-thin-ui-runtime-wiring.md
- codestable/architecture/rewrite-ui-style-baseline.md
- codestable/quality/rewrite-validation-fixture-oracle-baseline.md
- codestable/quality/rewrite-quality-rules.md
- codestable/quality/rewrite-review-checklist.md
- codestable/features/rewrite-receive/rewrite-receive-design.md
- codestable/features/rewrite-status/rewrite-status-design.md
- codestable/features/rewrite-display/rewrite-display-design.md
- codestable/features/rewrite-connection/rewrite-connection-bridge-implementation-design.md
- current code:
  - rewrite/src/features/connection
  - rewrite/src/features/receive
  - rewrite/src/features/status
  - rewrite/src/features/display

Boundary guards：
- 不把 handoff 当作可推翻正式合同的来源；handoff 只做入口索引和状态摘要。
- 不读取或修改自动生成前端 types。
- 不进入 send/task/SCOE/result/report/northbound 实现。
- 不实现真实 serial/TCP/UDP。
- 不扩 UI 页面。
- 不新增样式 token。

任务：
1. 审查 receive/status/display/connection public API 是否互相拉扯或过重。
2. 审查 status/display 是否错误拥有了 receive/connection/settings 的底层事实。
3. 审查 connection bridge implementation design 是否真的 ready for bridge implementation，尤其 native dependency/setup gates 是否足够明确。
4. 审查是否存在跨 feature internal imports、platform/runtime/main/preload 越界。
5. 给出下一步建议：
   - connection real bridge implementation prep
   - status/display thin runtime/UI read-only wiring
   - send feature design
   - task feature design
   - or revise-required

验证：
- pnpm -C rewrite test
- pnpm -C rewrite lint
- rg 边界检查：
  - features 下无 vue/pinia/electron/platform/fs/path/net/serialport/node import，除非仅在允许的 platform/electron 边界
  - 无 window.electron / src/api/common
  - feature root index 不导出 internal mutable state/fake default instance
  - 无跨 feature internal 子路径 import
- 不运行 build。

输出：
Findings first:
- Critical
- High
- Medium
- Low

然后输出：
Direct contract:
Boundary guards:
Verify evidence:
Open issues:
Review verdict:
- pass
- pass-with-known-gaps
- revise-required
- blocked

最后给出下一轮最推荐的 2-3 个并行对话提示词。
```

## If Next Step Is Connection Real Bridge Prep

Before coding, verify or decide:

- package/native dependency setup plan
- serialport version and electron compatibility
- electron-rebuild flow
- Vite external/asarUnpack/package config
- typed preload bridge shape at category level
- main resource handle lifecycle
- event queue/batch/backpressure behavior
- runtime/package/hardware validation plan

Do not let main parse frames or interpret business errors.

## If Next Step Is Status/Display UI Wiring

Keep it read-only and thin:

- UI reads runtime/page snapshot only.
- Runtime composes public readers/services only.
- No pages/widgets importing feature internal subpaths.
- No new visual hardcoding.
- No full page batch yet.
- Use `rewrite-ui-style-baseline.md` as boundary guard.

## If Next Step Is Send/Task

Do design first, not implementation.

Direct contracts should include:

- target structure
- feature boundaries
- interaction matrix
- connection/receive/frame designs and current public APIs
- validation baseline
- northbound overlap document only if result/report/file delivery appears

Do not let send/task inherit old store organization or become northbound/report closure.

## Worktree Warning

The repository has many unrelated dirty/untracked files from previous and parallel work. Do not clean, reset, or revert unrelated changes.

When editing:

- Touch only files in the current Direct contract and scope.
- Ignore unrelated dirty files.
- If a needed file is already dirty, read carefully and work with current contents.

## Verification Notes

Recent user-pasted verification says:

- `pnpm -C rewrite test` has passed up to 16 suites / 153 tests after display.
- `pnpm -C rewrite lint` passed.
- `pnpm -C rewrite build` passed after UI style baseline and Quasar/SCSS changes.

Still, new work needs fresh validation matching its scope.

For pure docs:

- `rg` section checks
- YAML parse for checklist files
- no build/lint unless the prompt requires it

For implementation:

- `pnpm -C rewrite test`
- `pnpm -C rewrite lint`
- boundary `rg` checks
- build only if the round touches build/style entry/platform/electron packaging or user asks

