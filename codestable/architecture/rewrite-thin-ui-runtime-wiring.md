---
doc_type: architecture
type: rewrite-thin-ui-runtime-wiring
status: draft
date: 2026-05-04
summary: Thin UI and runtime wiring design for consuming feature public APIs from app, pages, widgets, and runtime without recreating a global business store.
tags:
  - rewrite
  - thin-ui
  - runtime
  - wiring
  - feature-public-api
---

# Rewrite thin UI / runtime wiring

## 1. Direct contract

本轮依据以下正式工件判断范围和完成度：

1. `AGENTS.md`
2. `codestable/architecture/rewrite-target-structure.md`
3. `codestable/architecture/rewrite-system-architecture.md`
4. `codestable/architecture/rewrite-feature-boundaries.md`
5. `codestable/architecture/rewrite-feature-interaction-matrix.md`
6. `codestable/architecture/rewrite-platform-app-shell-file-dialog.md`
7. `codestable/quality/rewrite-validation-fixture-oracle-baseline.md`
8. `codestable/quality/rewrite-quality-rules.md`
9. `codestable/quality/rewrite-review-checklist.md`
10. `codestable/features/rewrite-frame/rewrite-frame-design.md`
11. `codestable/features/rewrite-settings/rewrite-settings-design.md`
12. `codestable/features/rewrite-storage-local-baseline/rewrite-storage-local-baseline-design.md`
13. 当前实现参考：
    - `rewrite/src/features/frame`
    - `rewrite/src/features/settings`
    - `rewrite/src/features/storage-local-baseline`
    - `rewrite/src/app`
    - `rewrite/src/pages`
    - `rewrite/src/widgets`
    - `rewrite/src/runtime`

`codestable/architecture/rewrite-target-structure.md` 仍是目录、依赖方向、feature public API 和 runtime 职责的 canonical 架构基线。本文只收窄 app/pages/widgets/runtime 如何消费 feature public API，不替代 frame/settings/storage 的 feature design，也不定义新的平台 API schema。

## 2. Boundary guards

- 本轮只做 design，不实现 UI，不实现 runtime wiring。
- 不决定视觉细节、布局密度、组件样式或具体页面交互文案。
- 不接 platform、preload、main，不定义 bridge/channel/method/payload/error schema。
- 不进入 receive、send、task、SCOE、result、report、northbound 的内部设计。
- 不引入 Pinia 或任何 global store 作为业务全局中心。
- 不让 runtime 保存 feature 内部业务 state。
- 不让 pages/widgets import feature internal state、internal service、adapter、internal composable 或私有 helper。
- 不让 UI 持有运行主状态、任务生命周期、协议语义、统计累加或文件/串口/网络访问。
- 不把 storage/history/CSV/local export 等同 report、TestReport、HTTP/FTP 或 northbound delivery closure。

## 3. Current evidence summary

当前 `rewrite` 已经形成最小应用壳和三个小 feature public surface：

| Area | Current fact | Design implication |
| --- | --- | --- |
| `app/pages` | `rewrite/src/App.vue` 只承载 router view；`rewrite/src/app/AppShell.vue` 只做 Quasar shell + router outlet；`rewrite/src/pages/HomePage.vue` 只展示 bridge info。 | app/pages 仍足够薄，后续应保持“路由入口 + 用户动作连接”，不要把 feature 装配和业务流程塞进页面。 |
| `widgets/runtime` | `rewrite/src/widgets` 和 `rewrite/src/runtime` 当前只有 `.gitkeep`。 | 这两个目录尚未形成事实实现；本文只能定义 gate 和消费规则，不能声称 runtime wiring 已完成。 |
| `platform` | `rewrite/src/platform/index.ts` 只读 bridge metadata；preload/main 仍是 metadata-only baseline。 | 本轮不扩大平台能力；UI/runtime 只能按未来 facade 类别消费，不直接接 Electron/Node。 |
| feature public API | `frame/settings/storage-local-baseline` 根 `index.ts` 只导出 reader/service/selectors/types/constants 等 public surface；测试已断言 root API 不导出 `create*State`、fake adapter 等内部对象。 | 后续 pages/runtime 只从 feature root import，禁止从 feature 子目录绕过 public surface。 |
| feature state | 当前 service 通过 feature 自己的 state container 写入本域状态，并返回 `ok / validation / snapshot` 或 read model。selectors 返回 clone 或 projection。 | 适合作为 first wiring 的消费模型：读写分离、只读 snapshot、显式操作结果。 |
| tests | Vitest 当前覆盖 frame/settings/storage 的 core/service/state/selector/fake adapter；页面交互没有自动 UI 测试 scaffold。 | UI wiring 只能先规划 manual checklist；静态检查和 feature 单测不能替代 runtime、package、hardware、customer 证据。 |

旧系统入口事实只作为入口保留证据：旧 `src/router/routes.ts` 和 `src/components/layout/SidePanel.vue` 暴露 `/`、`/connect`、`/frames/list`、`/frames/editor`、`/frames/send`、`/frames/receive`、`/settings`、`/storage`、`/history`、`/scoe` 等入口。本文只把其中与 frame/settings/storage local baseline 相关的入口列为 first wiring candidates，其他入口 deferred。

## 4. Responsibilities

| Layer | Owns | Can call | Must not own |
| --- | --- | --- | --- |
| `app/` | 应用启动入口、router/provider 安装、应用壳、全局 layout slot、最低限度的生命周期挂载点。 | router、Pinia 安装工厂、runtime bootstrap 候选、platform health metadata 候选、widgets shell 组件。 | 领域规则、feature state、服务内部实现、平台资源细节、页面展示态、任务/协议/报告语义。 |
| `pages/` | 路由页面、页面级布局、把用户操作连接到 runtime page API 或 feature public API、页面本地 UI snapshot。 | feature root public API、feature page composable、runtime page API、widgets props/events。 | feature internal state、跨 feature 业务流程、平台直连、协议解析、任务推进、统计累加、文件/串口/网络能力。 |
| `widgets/` | 跨页面纯展示组件、通用控件、导航壳、状态/摘要的无业务 owner 展示。 | `shared` 纯类型/工具、props、emits、由 page/runtime 传入的只读 snapshot。仅在 feature design 明确声明时读取 widget-safe public selector。 | feature internal state、feature service 操作、运行主状态、platform facade、文件对话框语义、任务/结果/报告/northbound 语义。 |
| `features/<feature>/components` | 只服务本 feature 的局部 UI，例如 frame list/editor 内部控件、settings 表单分组、storage/history 局部控件。 | 本 feature composable、root public API、props/emits、本 feature read model。 | 其他 feature internal、runtime 编排、平台直连、跨 feature 业务流程。 |
| `features/<feature>/composables` | UI-facing 组合，管理表单草稿、筛选、分页、dialog state、selector 组合和调用本 feature public service。 | 本 feature root/internal 按 feature 内部规则访问、必要的 page-local inputs。 | 协议语义、任务状态机、统计累加、跨 feature 写状态、platform/main API。 |
| `runtime/` | 应用级组合根、启动/销毁顺序、feature service/adapter/context 装配、跨 feature public API 编排、边界例外登记。 | feature root public API、platform facade adapter factory、显式事件/command 候选、app lifecycle hooks。 | feature 内部业务 state、领域算法、UI snapshot、main/preload schema、receive/send/task/SCOE/result/report/northbound 语义。 |

Thin UI 的默认路径是：

```text
page user action
  -> feature page composable or runtime page API
  -> feature root public service / reader / selector
  -> feature-owned state/core/adapter
  -> readonly read model or operation result
  -> page-local UI snapshot
  -> widget/feature component props
```

## 5. Allowed imports

Allowed imports are intentionally narrow:

| Importing layer | Allowed imports |
| --- | --- |
| `app/` | `vue` / `vue-router` / Quasar boot primitives, `@/router`, `@/stores`, `@/runtime` bootstrap candidates, `@/platform` health metadata, app-owned widgets. |
| `pages/` | `@/features/<feature>` root public API, `@/features/<feature>/composables` only for the same feature page after that composable is declared UI-facing, `@/runtime` page API, `@/widgets`, `@/shared` pure types/helpers. |
| `widgets/` | `@/shared`, framework UI primitives, props/emits types, explicitly passed read-only snapshots. A direct feature root import is exceptional and must be declared widget-safe in the owning feature design. |
| `features/<feature>/components` | Same feature composables/selectors/types, `@/shared`, pure widgets. |
| `features/<feature>/composables` | Same feature public service/selector/state adapter through feature-owned paths, page-local UI inputs, `@/shared`. |
| `runtime/` | `@/features/<feature>` root public API, `@/platform` facade, `@/shared`, explicit event/command utilities if later justified. |

Pinia can remain an application provider or a feature-local state implementation detail, but it is not a cross-feature service locator. Stores must not create services, store platform adapters, or expose Electron/Node capabilities.

## 6. Forbidden imports

Forbidden imports:

- `pages` / `widgets` / `app` / `runtime` importing `@/features/<feature>/state`.
- `pages` / `widgets` importing `@/features/<feature>/adapters`, fake adapters, or adapter ports.
- `pages` / `widgets` importing `@/features/<feature>/services/<file>` or `selectors/<file>` to bypass root public API.
- Any UI layer importing `fs`、`path`、`net`、`serialport`、Electron、`ipcRenderer`、preload bridge details or old `window.electron`.
- `widgets` importing multiple feature internals and constructing business summaries itself.
- `runtime` importing feature internal state containers to keep or mutate feature truth.
- Any layer outside a feature importing another feature's private helper, internal composable or internal service implementation.
- `shared` importing Vue、Pinia、Electron、platform facade or feature-owned business helpers.
- Auto-importing feature service、platform facade、runtime、store、feature public API、adapter or business-owned helper.

Static checks for later implementation should include `rg` patterns for feature subpath imports from `rewrite/src/app rewrite/src/pages rewrite/src/widgets rewrite/src/runtime`, and for renderer direct Node/Electron imports.

## 7. Feature public API consumption rules

Public API consumption rules:

1. The feature root `rewrite/src/features/<feature>/index.ts` is the default external import boundary.
2. Root exports should stay capability-oriented: reader, service, selector, validation result, read-only snapshot, constants and stable public types.
3. External consumers may call `create*Reader` for query-only flows and `create*Service` for mutation flows. They must not hold or mutate feature state containers.
4. Mutation results should be handled as explicit operation results, for example `ok / validation / snapshot / error`. UI should derive display state from the returned read model, not from internal state references.
5. Read models and snapshots are inputs for display and orchestration. They are not permission to write feature truth.
6. Runtime may create services and adapters when lifecycle, test replacement, platform resource setup, or cross-feature orchestration requires it. Pages should not create adapter-backed services for file/path/dialog/storage behavior.
7. Same-feature pages may use a feature-owned UI composable once that composable is explicitly scoped to UI projection and service calls. Cross-feature pages should use runtime page API or compose read-only snapshots at page level.
8. Widgets should receive already-shaped props or UI snapshots. They should not call write services.
9. If a feature needs to expose a new external operation, update that feature design/checklist before wiring pages/runtime to it.
10. If a consumer needs an internal subpath import to finish a page, that is a design smell: either promote a narrow public API or move the UI into the owning feature component/composable boundary.

Current first public surfaces:

| Feature | Public surface already visible | Thin consumption stance |
| --- | --- | --- |
| `frame` | `createFrameAssetReader`、`createFrameAssetService`、frame selectors/types/constants. | Pages may read lists/details/reference options and call service operations through feature page composables; runtime may preload or provide a frame reader to consumers. No receive/send/task/SCOE runtime facts enter frame. |
| `settings` | `createSettingsReader`、`createSettingsService`、recording/CSV selectors/types. | Runtime may load a settings snapshot before initializing consumers; settings page may update/reset via service. Consumers receive explicit snapshots, not settings internal state. |
| `storage-local-baseline` | `createStorageLocalReader`、`createStorageLocalService`、local material selectors/types; service requires adapter options. | Runtime or feature adapter layer owns adapter-backed service creation. Pages only consume storage summaries/material projections and operation results. |

## 8. Runtime involvement gate

Before adding any `runtime/` file or API, answer these gates in the design or checklist:

| Gate | Runtime may participate when yes | Runtime must stay out when no |
| --- | --- | --- |
| Lifecycle gate | Startup, shutdown, flush, restore, cleanup or resource release order spans multiple services or adapters. | A single feature page can call its own public service without cross-feature sequencing. |
| Cross-feature gate | One user action must call multiple feature public APIs in a defined order, or route explicit outputs from one owner to another. | The flow belongs entirely to one feature's service/composable. |
| Adapter gate | Platform-backed adapters need centralized construction, fake replacement, disposal or environment registration. | The service is pure and has no lifecycle or platform-backed dependency. |
| Event gate | Multiple consumers need an async notification from a feature output, with owner/producer/consumer/failure semantics declared. | A direct service call or selector read is enough. |
| Validation gate | Runtime/package/hardware/customer gaps must be recorded because the flow cannot be proven by Vitest/fixture/manual alone. | The change is pure feature core/service/selector or pure UI snapshot. |
| Exception gate | SCOE fixed source/target, high-speed storage short-circuit, packaged data path, HTTP/FTP or similar exception is involved. | No boundary exception exists. |

Runtime allowed responsibilities:

- Create feature services, adapters and context from explicit factories.
- Load settings/frame/storage snapshots in a documented startup order.
- Route page-level commands to feature public services.
- Coordinate read-only snapshots across features for a page or widget.
- Register boundary exceptions and validation gaps.
- Provide teardown/flush hooks for storage or future platform-backed adapters.

Runtime forbidden responsibilities:

- Store feature business truth or mutable domain state.
- Implement frame validation, settings merge rules, storage CSV/history semantics, receive parsing, send framing, task lifecycle, SCOE protocol, result attribution, report generation or northbound external semantics.
- Become a global store, universal event bus, command bus by default, or service locator.
- Access Electron/Node/preload bridge details directly.

## 9. UI snapshot and feature state separation

Use three named layers for UI wiring:

| Layer | Owner | Write rule | Typical examples |
| --- | --- | --- | --- |
| Feature core state | Owning feature state/service. | Only owning feature service/state writes it. | frame asset collection, settings snapshot, storage local records/materials. |
| Feature read model | Owning feature selectors/readers. | Derived from feature core state or explicit feature outputs; read-only for consumers. | frame summaries, field reference options, CSV export preference, storage hour summaries. |
| UI snapshot | Page, feature UI composable, or widget boundary. | UI writes only display concerns; never writes back as feature truth. | search text, filters, pagination, selected tab, dialog draft, loading state, button disabled state, empty/error presentation. |

Rules:

- UI snapshot can shape data for display, including sorting, filtering, pagination, virtual scrolling, throttling and temporary errors.
- UI snapshot cannot define whether a task succeeded, whether a device is connected, what a received value means, whether a report is valid, or whether delivery succeeded.
- Feature service returns are converted into read model or UI snapshot at the page/composable boundary.
- High-frequency data must enter pages only as throttled read model or UI snapshot. Pages/widgets must not subscribe to bottom-level packet events.
- If a widget needs data from multiple features, page/runtime composes a read-only view model first and passes props to the widget.
- UI snapshot may be persisted only after the owning feature design explicitly upgrades it to a settings/storage-owned configuration fact.

## 10. Testing and manual checklist plan

This design only adds documentation. Verification for this round is static scan only.

Future implementation should split evidence by validation level:

| Layer | Evidence target | Scope |
| --- | --- | --- |
| Static scan | Import boundaries, section presence, forbidden direct Node/Electron imports. | `rg` for docs and imports. |
| Vitest unit | Feature core/service/selector/fake adapter behavior. | Existing frame/settings/storage tests and new tests under owning feature. |
| Fixture/oracle | Legacy JSON, settings key normalization, history/CSV expected output, operation result edge cases. | Feature-owned `fixtures/` or `oracles/`; not production schema. |
| Manual checklist | Route reachability, navigation, visible page state, form draft, validation display, dialog flow, empty/error state. | Pages/widgets/app shell only; cannot prove core/platform/hardware correctness. |
| Runtime validation | Startup order, runtime bootstrap, adapter creation/disposal, settings change propagation, storage flush. | Development Electron runtime once implementation exists. |
| Package validation | Packaged data path, permissions, long-running persistence, cleanup. | Storage/app packaging later. |
| Hardware/customer validation | Real serial/TCP/UDP/SCOE, high-speed throughput, HTTP/FTP/northbound/customer closure. | Deferred; not claimed by thin UI wiring. |

Manual checklist template for first wiring candidates:

| Candidate | Manual checks | Automatic checks |
| --- | --- | --- |
| App shell + navigation | Route entries visible and reachable; active route state; unknown route reaches 404; no business state shown as global truth. | Static import scan. |
| Frame list/editor page shell | List/detail/editor entry reachable; page calls feature public API/composable only; validation results displayed from service output. | Existing frame service/selector tests plus import scan. |
| Settings page shell | Values load from settings snapshot; edits call settings service; reset scope follows settings design; no runtime facts stored in settings. | Existing settings core/service/selector tests plus import scan. |
| Storage/history local page shell | History/CSV/material summaries come from storage read model; adapter-backed operations are routed through runtime/feature service, not widgets. | Existing storage service/fake adapter tests plus import scan. |

Implementation completion claims must not use page visibility, build, lint or fixture tests to claim Electron runtime, package data path, hardware, HTTP/FTP, northbound or customer validation complete.

## 11. First wiring candidates

First candidates should be limited to app/pages/widgets/runtime edges that can consume the already existing frame/settings/storage-local-baseline public APIs without entering deferred domains:

| Candidate | Scope | Allowed data/API | Runtime need |
| --- | --- | --- | --- |
| App shell route map | Rebuild visible route container and navigation model from old entry evidence for `/`、`/frames/list`、`/frames/editor`、`/settings`、`/storage`、`/history` plus catch-all. | Static route metadata and widget props. | Not required unless route guards or startup readiness become real. |
| Navigation widget | Cross-page navigation display/control only. | Route metadata props and current route state. | Not required. |
| Home page | Baseline landing/status placeholder. | Platform bridge metadata only while platform remains metadata-only. | Not required. |
| Frame list/editor page shells | Connect frame page actions to `frame` root public reader/service via feature UI composable. | Frame summaries, details, validation result, selected frame snapshot. | Optional startup preload only; no cross-feature runtime facts. |
| Settings page shell | Connect form draft/update/reset to `settings` root public service. | Settings snapshot, recording/CSV preference selectors, validation result. | Startup settings load and later consumer notification may use runtime; settings rules stay in feature. |
| Storage/history local page shells | Connect local records/hour summaries/CSV material display to `storage-local-baseline` reader/service. | Storage read model, CSV material summaries, adapter operation result. | Required only for adapter construction, flush/shutdown or fake/platform replacement; pages must not create file/path adapters. |
| 404 page | Preserve catch-all user-visible route behavior. | Route metadata only. | Not required. |

旧 `/connect` can be introduced as a route placeholder only after connection/platform design says what it may show. `/frames/send`、`/frames/receive`、`/scoe` should not be wired beyond explicit deferred navigation metadata until their feature designs exist.

## 12. Deferred and blockers

Deferred:

- `/connect` real behavior and connection target/runtime state.
- `/frames/send`、`/frames/receive`、task/SCOE-specific page workflows.
- receive/send/task/SCOE/result/report/northbound internal designs.
- Status read model and global indicator semantics.
- Platform/preload/main API schema for file/path/dialog/window/transport.
- Packaged data path, long-running storage, high-speed storage short-circuit and performance strategy.
- HTTP/FTP, TestReport, file delivery, northbound external semantics and customer validation.
- Any auto-import policy beyond basic framework APIs.

Blockers for implementation claims:

- No runtime wiring can be claimed complete while `rewrite/src/runtime` remains only `.gitkeep`.
- No widgets contract can be claimed implemented while `rewrite/src/widgets` remains only `.gitkeep`.
- No UI page behavior can be claimed complete without manual checklist evidence after implementation.
- No platform, package, hardware or customer behavior can be claimed from this document.
- If future implementation needs feature internal subpath imports from pages/widgets/runtime, the blocker is a missing public API or misplaced UI boundary, not a reason to bypass the boundary.

## 13. Review checklist for later implementation

Later implementation or review should answer:

1. Does every changed file list the correct owner: app, page, widget, feature component/composable, feature service/state/core, runtime or platform?
2. Do pages import only feature root public APIs, declared same-feature composables, runtime page APIs, widgets or shared?
3. Do widgets receive props/read-only snapshots instead of importing feature internals or services?
4. Does runtime create and wire services without keeping feature business truth?
5. Are feature service results converted into read models or UI snapshots before display?
6. Is Pinia only a provider or feature-local implementation detail, not a global business center?
7. Are validation levels recorded without upgrading static/fixture/manual evidence into runtime/package/hardware/customer claims?
8. Are deferred receive/send/task/SCOE/result/report/northbound domains still out of scope?
