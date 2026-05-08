# Task System Cut-Point Consensus Draft

Status: draft, planning-only, pre-implementation

## RALPLAN-DR Summary

### Principles
- Preserve the architecture direction: the task system is an independent capability domain, not send-page or receive-page ownership. Evidence: `easysdd/architecture/domain-task-system-ownership.md:93-112`, `:132-216`.
- Sequence by ownership seams first, not by UI convenience or code size.
- Treat one dominant seam per cut; adjacent cuts must be explicitly disjoint.
- Keep the draft planning-only: no implementation design, no API proposals, no execution handoff.

### Top Decision Drivers
- Lifecycle-end semantics remain the hardest gate because stop currently drives `completed`, and `completed` immediately drives removal. Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`.
- Creation and control authority are both noisy, but they are not the same seam: dialog/page entry captures intent and start requests, while monitor/dialog close/background choices exercise ongoing task control. Evidence: `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `:243-280`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `:333-378`.
- Trigger ingress and timer resources remain valid later seams, but neither should absorb lifecycle-end ambiguity or dialog-control decisions. Evidence: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`, `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/composables/common/useTimerManager.ts:20-52`, `:226-250`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`.

### Viable Options
- Option A, lifecycle-first with split entry/control seams.
  Pros: resolves the hard gate first and keeps later cuts single-seam.
  Cons: first cut is structural rather than user-visible.
- Option B, entrypoint-first.
  Pros: reduces obvious UI ownership sprawl quickly.
  Cons: leaves the stop/completed/remove collapse underneath.
- Option C, timer-first.
  Pros: has clear infrastructure evidence.
  Cons: risks moving a downstream resource seam ahead of the dominant lifecycle seam.

Chosen draft direction: Option A.

## Requirements Summary
- Produce a consensus-ready sequence of 5 small cut points.
- Keep the posture planning-only.
- For each cut, name one ownership conflict, explicit exclusions, and which neighboring cuts it must exclude.
- Keep `1` as the only hard gate unless stronger evidence appears.

## Proposed Cut Points

### 1. Lifecycle-end ownership cut
Ownership conflict: terminal-state authority is split because stop behavior sets `completed`, while store-level `completed` handling immediately removes the task.
Scope: define the planning boundary around lifecycle-end meaning only: stop, completed, and remove semantics.
Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`, `src/stores/frames/sendTasksStore.ts:424-426`, `easysdd/compound/2026-04-23-explore-task-system-module-overview.md`.
Explicit exclusions: no creation-entry surfaces; no monitor/dialog control decisions; no trigger ingress; no timer-resource work.
Neighbor exclusions: must exclude cuts `2` and `3` from redefining stop/completed/remove semantics.
Why sequenced here: hard gate for all later cuts because every other seam depends on a stable meaning of task completion vs removal.

### 2. Creation-entry ownership cut
Ownership conflict: page/dialog/command surfaces currently mix intent capture and start requests with broader task authority.
Scope: creation-entry only: user input capture, task creation requests, and first-start entrypoints that happen as part of creating a task instance.
Evidence: `src/pages/FrameSendPage.vue:153-183`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`, `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`, `src/composables/scoe/commands/readFileAndSend.ts:118-157`.
Explicit exclusions: no dialog-close behavior; no background-continue decisions; no stop/pause/resume/waiting-schedule control semantics; no start/restart of an already-created task from monitor/control surfaces; no timer-resource internals.
Neighbor exclusions: must exclude cut `1` lifecycle-end semantics and cut `3` ongoing control authority.

### 3. Control ownership cut
Ownership conflict: monitor and dialog-adjacent surfaces exercise ongoing task authority across stop, pause, resume, background-continue, and waiting-schedule control interpretation.
Scope: ongoing control ownership only after task entry exists, including monitor actions, start/restart of an already-created task, and dialog close/background-continue decisions.
Evidence: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`, `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`, `src/composables/frames/sendFrame/useSendTaskController.ts:23-117`.
Explicit exclusions: no creation-entry/input capture; no redefine-start boundary; no trigger candidate production; no timer-resource internals.
Neighbor exclusions: must exclude cut `2` creation-entry authority and cut `4` trigger-input ingress.

### 4. Trigger-input boundary cut
Ownership conflict: receive-side candidate production and task-side trigger interpretation currently cross the task-domain seam.
Scope: trigger ingress only: the boundary between receive-produced trigger candidates and task-consumed trigger inputs.
Evidence: `src/stores/frames/receiveFramesStore.ts:1127-1139`, `src/stores/frames/sendTasksStore.ts:554-562`, `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`.
Explicit exclusions: no lifecycle-end semantics; no creation/control ownership; no receive parsing redesign; no scheduling/timer cleanup framing; no ownership of `stop/completed/remove` meaning; any `updateTaskStatus(..., 'completed')` path touched here must defer semantic authority to cut `1`.
Neighbor exclusions: must exclude cut `3` ongoing control authority and cut `5` timer-resource ownership.

### 5. Timer-resource ownership cut
Ownership conflict: task-time progression depends on timer resources split across renderer, composable bridge, and main-process timer management.
Scope: timer-resource ownership only for scheduling/time-progression infrastructure used by tasks.
Evidence: `src/composables/common/useTimerManager.ts:20-52`, `src/composables/common/useTimerManager.ts:226-250`, `src-electron/main/ipc/timerManagerHandlers.ts:194-220`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`, `:252-259`.
Explicit exclusions: no boot/exit cleanup bucket; no dialog close/background behavior; no waiting-schedule control semantics beyond the resource seam they depend on; no new scheduling features; no ownership of `stop/completed/remove`; no changes to completion-vs-removal semantics; any `updateTaskStatus(..., 'completed')` path touched here must defer semantic authority to cut `1`.
Neighbor exclusions: must exclude cut `4` trigger ingress and cut `3` control ownership.

## Sequence Rationale
- `1` is the only hard gate.
- After `1`, cuts `2` and `3` are both viable next steps, with stronger current evidence for `3` because the live runtime control surface already disagrees about `waiting-schedule` stop behavior across monitor and controller paths. Evidence: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`, `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`, `src/composables/frames/sendFrame/useSendTaskController.ts:161-168`.
- The post-gate review order is `3 -> 2 -> 4 -> 5`, and that order is a prioritization heuristic rather than a hard dependency chain.
- The ranking keeps control distinct from creation entry, preserves the trigger-input cut as its own seam, and keeps timer resources last as a downstream infrastructure seam rather than a mixed timer/cleanup bucket.

## Acceptance Criteria
- The plan defines 5 cuts and each cut names:
  - one ownership conflict,
  - explicit exclusions,
  - adjacent cuts it must exclude.
- Cut `2` is creation-entry only and does not own dialog close or background-continue behavior.
- Cut `2` excludes start/restart of an already-created task from monitor/control surfaces.
- Cut `3` explicitly owns dialog close/background-continue, monitor `start/retry`, and other ongoing control semantics, not creation-entry.
- Cut `1` is the only hard gate stated by the plan.
- Cuts `4` and `5` may touch execution paths that currently end in `completed`, but they fail review if they absorb lifecycle-end authority instead of deferring to cut `1`.
- The draft remains planning-only and does not prescribe implementation design.
- A reviewer can trace every cut back to cited evidence and verify that neighboring cuts are intentionally disjoint.
- A reviewer can also trace non-adjacent lifecycle-end bleed by following current `updateTaskStatus(..., 'completed')` callers in trigger and scheduled execution paths back to store-level removal.

## Risks And Mitigations
- Risk: cut-boundary bleed between creation-entry and control, especially dialog close/background-continue behavior.
  Mitigation: assign those decisions only to cut `3`, and require cut `2` to exclude them explicitly.
- Risk: cut-boundary bleed between creation-entry and control around monitor `start/retry` on an already-created task.
  Mitigation: classify first-start during task creation under cut `2`, and classify monitor/control-surface start or retry of an existing task under cut `3`.
- Risk: cut-boundary bleed between control and timer seams, especially around waiting-schedule semantics.
  Mitigation: keep waiting-schedule interpretation in control ownership unless the issue is strictly timer-resource authority.
- Risk: trigger or timer cuts absorb lifecycle-end ambiguity indirectly.
  Mitigation: keep `1` as the gate and reject later-cut framing that redefines stop/completed/remove meaning.
- Risk: timer work is mislabeled as generic cleanup.
  Mitigation: keep cut `5` labeled and evidenced strictly as timer-resource ownership, with cleanup framing excluded.
- Risk: sequential-dialog creation/start remains implicit and reintroduces creation/control ambiguity.
  Mitigation: keep `EnhancedSequentialSendDialog` creation/start evidence under cut `2`, while reserving its close/background behavior for cut `3`.

## Verification Steps
1. Re-check each cut against its cited files and confirm the evidence matches the stated seam.
2. For each adjacent pair (`1/2`, `2/3`, `3/4`, `4/5`), prove disjointness by showing what one cut owns and what it explicitly excludes.
3. Re-check principle/option consistency against the single dominant seam rule; reject any cut that mixes two authorities.
4. Re-check non-adjacent lifecycle-end bleed by tracing each current `updateTaskStatus(..., 'completed')` caller in trigger and scheduled paths back into `sendTasksStore` removal.
   Evidence anchors: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-304`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-600`, `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-874`, `src/stores/frames/sendTasksStore.ts:424-426`
5. Apply an explicit pass/fail rule to cut `4`: it may touch trigger-execution paths that currently end in `completed`, but it fails review if it absorbs lifecycle-end authority instead of deferring to cut `1`.
6. Apply an explicit pass/fail rule to cut `5`: it may touch timer-driven execution paths that currently end in `completed`, but it fails review if it absorbs lifecycle-end authority instead of deferring to cut `1`.
7. Re-check monitor `start/retry` classification against the plan rule by inspecting `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103` and `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`; reject the draft if that surface is not owned only by cut `3`.
8. Re-check that `1` is the only hard gate and that post-`1` ordering is presented as ranked preference, not as an unsupported prerequisite chain.
9. Re-check that the draft stays planning-only and does not drift into solution design.

## ADR
- Decision: keep the lifecycle-first sequence, but split post-gate control and creation into separate cuts, prioritize control before creation after the lifecycle gate, and tighten every cut around one dominant seam.
- Drivers: stop/completed/remove collapse; live control inconsistency around `waiting-schedule`; start/restart ambiguity between creation and control surfaces; need for reviewer-verifiable disjointness across adjacent and non-adjacent cuts.
- Alternatives considered: entrypoint-first sequencing; timer-first sequencing; broader mixed cleanup framing.
- Why chosen: it preserves the strongest lifecycle-first gate while correcting the main over-bundling and seam-bleed weaknesses identified in review, and it acknowledges that current control contradictions are a stronger post-gate signal than creation-entry multiplicity alone.
- Consequences: the draft becomes stricter about exclusions and disjointness, which should reduce later execution ambiguity without implying implementation choices.
- Follow-ups: next review should challenge seam disjointness first, then decide whether a later execution lane needs `ralph` or `team`.
