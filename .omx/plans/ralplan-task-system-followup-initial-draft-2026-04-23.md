# Task-System Follow-up Initial Consensus Plan Draft

Status: draft, planning-only, pre-implementation

## RALPLAN-DR Summary

### Principles
- Preserve the architecture target that task handling should converge toward a single capability boundary, while treating current code as mixed ownership that must be untangled incrementally, not rewritten wholesale. Evidence: `easysdd/architecture/domain-task-system-ownership.md:93-119`, `:192-223`.
- Prefer slice boundaries that separate ownership semantics first, because current lifecycle facts are split across page/dialog, store, trigger listener, timer bridge, and boot cleanup. Evidence: `easysdd/compound/2026-04-23-explore-task-system-module-overview.md`.
- Keep each slice small, reviewable, and reversible; no slice should require a cross-module redesign or new dependency.
- Define success by clearer boundaries and preserved behavior, not by new abstractions or UI changes.

### Top Decision Drivers
- Lifecycle semantics are currently the most destabilizing coupling because stop/completion/removal collapse together. Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:23-57`, `src/stores/frames/sendTasksStore.ts:401-426`.
- Follow-up work should reduce cross-layer ownership, especially where receive, dialogs, and boot still participate in task facts. Evidence: `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/boot/taskManager.ts:17-48`.
- The next step should optimize for small-slice progress after exploration, not for full architectural convergence in one pass.

### Viable Options
- Option A, lifecycle-first sequence. Pros: starts with the narrowest blocking semantic seam; makes later trigger/timer/UI slices easier to reason about. Cons: less visible user-facing simplification in the first slice.
- Option B, entrypoint-first sequence. Pros: quickly reduces page/dialog ownership sprawl around creation and background-run decisions. Cons: risks leaving core stop/completion ambiguity in place underneath.
- Option C, timer-first sequence. Pros: targets obvious split ownership between renderer, main-process timer bridge, and boot cleanup. Cons: likely treats symptoms before clarifying task terminal-state ownership.

Recommended draft direction: Option A.

## Requirements Summary
- Produce a follow-up sequence of 3-5 refactor cut points after the module overview, with explicit in-scope and out-of-scope boundaries.
- Stay pre-implementation: no concrete solution design, no code-change prescription, no rewrite framing.
- Ground each cut point in current evidence from the overview and cited source files.
- Keep the likely path as a small-slice follow-up, suitable for later `ralph` or `team` execution after approval.

## Proposed Cut Points And Sequencing
1. Terminal-state boundary slice.
Scope: define and review the boundary between stop, completion, error, and removal semantics.
Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:23-57`, `src/stores/frames/sendTasksStore.ts:401-426`.
Out of scope: timer redesign, trigger-field semantics, UI restructuring.

2. UI entrypoint ownership slice.
Scope: bound page/dialog responsibility to intent capture versus task lifecycle ownership across `FrameSendPage` and the three task dialogs.
Evidence: `src/pages/FrameSendPage.vue:264-400`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`.
Out of scope: monitor redesign, sending strategy changes, new entry APIs.

3. Trigger-input boundary slice.
Scope: bound the handoff between receive-side trigger candidate production and task-side trigger interpretation.
Evidence: `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/sendTasksStore.ts:554-562`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-305`.
Out of scope: receive parsing changes, field-model redesign, transport behavior.

4. Timer and cleanup ownership slice.
Scope: bound normal task-time ownership versus emergency/exit cleanup across renderer timers, timer bridge, and boot cleanup.
Evidence: `src/composables/common/useTimerManager.ts:20-52`, `:226-250`, `src/boot/taskManager.ts:17-48`.
Out of scope: new scheduling features, Electron API redesign, background-runtime expansion.

Sequence rationale: slice 1 removes the main semantic ambiguity; slice 2 narrows creation/control ownership once terminal facts are clearer; slice 3 then isolates runtime input boundaries; slice 4 closes ownership around time/cleanup after lifecycle and input boundaries are reviewed.

## Acceptance Criteria
- The approved plan contains 4 bounded slices, each with explicit scope, evidence, and out-of-scope boundaries.
- No slice implies full rewrite, dependency adoption, or architecture redesign beyond the evidence-backed boundary under review.
- The sequence is defensible against at least two viable alternatives and records why the chosen order is preferred.
- Architect/critic review can point from each slice back to concrete evidence in the overview and source files named above.
- The draft is execution-ready for a later planning-to-execution handoff without embedding solution design details.

## Implementation Steps
1. Validate the four-slice sequence against the module-overview document and architecture ownership doc; reject any slice that lacks a single dominant boundary.
2. For each slice, prepare a one-page execution brief later containing only scope, touched ownership surfaces, non-goals, and regression expectations.
3. Define the baseline verification matrix before any execution work: lifecycle behavior, dialog close/background behavior, trigger handoff, and timer cleanup paths.
4. Run architect/critic review on the slice order and boundaries before selecting the execution lane.
5. After approval, choose execution mode: `ralph` if slices stay serial and single-owner; `team` only if later review proves at least two slices can proceed independently.

## Risks And Mitigations
- Risk: slice 2 starts too early and papers over unresolved lifecycle semantics. Mitigation: keep slice 1 as the gate for any entrypoint follow-up.
- Risk: trigger and timer concerns are mistaken for implementation bugs instead of ownership-boundary issues. Mitigation: keep success checks framed around boundary clarification and preserved behavior.
- Risk: the effort drifts into redesign language from the architecture docs. Mitigation: require each slice to state what it will not redesign.
- Risk: insufficient regression baseline leads to unsafe cleanup work. Mitigation: lock the verification matrix before execution planning advances.

## Verification Steps
1. Re-read the cited overview sections and confirm each proposed slice maps to a documented blocking coupling, not to a speculative cleanup target.
2. Confirm each slice references a bounded source surface and no more than one primary ownership problem.
3. Confirm sequence dependencies are explicit: 2 depends on 1; 3 depends on 1 and benefits from 2; 4 depends on 1 and 3.
4. Confirm the draft remains planning-only and contains no target abstractions, APIs, or code-level prescriptions.

## ADR
- Decision: proceed with a four-slice, lifecycle-first follow-up plan rather than a broad task-system rewrite or a UI-first cleanup.
- Drivers: collapsed terminal semantics in store/controller, mixed task ownership across dialogs/receive/boot, and the need for small reversible follow-up work after exploration.
- Alternatives considered: entrypoint-first ordering; timer-first ordering; full-domain rewrite framing.
- Why chosen: lifecycle-first gives the narrowest, most reusable boundary for later slices and best aligns with the architecture doc's ownership language without forcing design decisions now.
- Consequences: early progress will be structural rather than user-visible; later slices remain easier to review because the highest-risk semantic seam is addressed first.
- Follow-ups: prepare slice briefs, baseline verification inventory, and later staffing choice between `ralph` and `team`; do not launch execution from this draft.

## Staffing Guidance For Later Execution
- Preferred later lane: `ralph` for slice 1 and likely slice 2, because they are serial and semantics-heavy.
- Escalate to `team` only if slice 3 and slice 4 are approved as independent after slice 1 closes.
- Hold handoff until architect/critic review accepts the slice order and verification matrix.
