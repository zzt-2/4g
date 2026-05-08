# PRD: Task System Follow-up Cut Sequence

Status: approved, planning-only, pre-implementation
Source: `.omx/plans/ralplan-task-system-cut-points-consensus-draft-2026-04-23.md`

## Requirements Summary

- Turn the completed task-system module overview into an execution-ready follow-up plan without entering design or implementation.
- Keep the plan aligned with the architecture direction that treats the task system as an independent capability domain.
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:93-112`
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:132-216`
- Sequence 5 small refactor cut points around ownership seams, not around visible UI surfaces.
- Keep `cut 1` as the only hard gate; all later cuts must remain subordinate to the lifecycle-end boundary clarified there.

## Approved Direction

The approved sequence is lifecycle-first, then control, then creation entry, then trigger ingress, then timer resources.

- Hard gate: `1`
- Ranked post-gate order: `3 -> 2 -> 4 -> 5`
- This is a prioritization heuristic, not a dependency claim between every later cut.

## RALPLAN-DR Summary

### Principles

- Preserve the architecture direction: the task system is an independent capability domain, not send-page or receive-page ownership.
- Sequence by ownership seams first, not by UI convenience or code size.
- Treat one dominant seam per cut; adjacent cuts must be explicitly disjoint.
- Stay planning-only in this phase: no implementation design, no API proposals, no execution handoff inside this artifact.

### Decision Drivers

- Lifecycle-end semantics are the current hard gate because `stopTask()` writes `completed` and `completed` immediately removes the task.
  - Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`
  - Evidence: `src/stores/frames/sendTasksStore.ts:424-426`
- Control surfaces currently contradict each other in live behavior, especially around `waiting-schedule` handling and ongoing task actions.
  - Evidence: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:365-369`
  - Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:33-39`
- Creation-entry multiplicity, trigger ingress bleed, and timer-resource bleed are valid later seams, but they must not redefine lifecycle-end meaning.

### Alternatives Considered

- Option A: lifecycle-first with split entry/control seams.
  - Chosen because it matches the hard gate in current code and preserves small-slice execution.
- Option B: entrypoint-first.
  - Rejected for first position because it leaves the `stop -> completed -> remove` collapse intact underneath.
- Option C: timer-first.
  - Rejected for first position because timer-resource work currently runs through lifecycle semantics and would risk downstream-first cleanup.

## Approved Cut Points

### 1. Lifecycle-end ownership cut

- Ownership conflict: terminal-state authority is split because stop behavior sets `completed`, while store-level `completed` handling immediately removes the task.
- Scope: stop, completed, and remove semantics only.
- Evidence:
  - `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`
  - `src/stores/frames/sendTasksStore.ts:424-426`
  - `easysdd/compound/2026-04-23-explore-task-system-module-overview.md`
- Explicit exclusions:
  - no creation-entry surfaces
  - no control surfaces
  - no trigger ingress
  - no timer-resource work
- Neighbor exclusions:
  - cuts `2` and `3` must not redefine stop/completed/remove semantics

### 2. Control ownership cut

- Ownership conflict: monitor and dialog-adjacent surfaces exercise ongoing task authority across stop, pause, resume, background-continue, monitor `start/retry`, and `waiting-schedule` interpretation.
- Scope: ongoing control ownership only after task entry exists.
- Evidence:
  - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
  - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`
  - `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`
  - `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
  - `src/composables/frames/sendFrame/useSendTaskController.ts:23-117`
- Explicit exclusions:
  - no creation-entry input capture
  - no first-start during task creation
  - no trigger candidate production
  - no timer-resource internals
- Neighbor exclusions:
  - must exclude cut `3` creation-entry authority
  - must exclude cut `4` trigger-input ingress

### 3. Creation-entry ownership cut

- Ownership conflict: page/dialog/command surfaces currently mix intent capture and first-start requests with broader task authority.
- Scope: creation-entry only, including user input capture, task creation requests, and first-start entrypoints that happen as part of creating a task instance.
- Evidence:
  - `src/pages/FrameSendPage.vue:153-183`
  - `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`
  - `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`
  - `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`
  - `src/composables/scoe/commands/readFileAndSend.ts:118-157`
- Explicit exclusions:
  - no dialog-close behavior
  - no background-continue decisions
  - no stop/pause/resume/waiting-schedule control semantics
  - no start/restart of an already-created task from monitor/control surfaces
  - no timer-resource internals
- Neighbor exclusions:
  - must exclude cut `1` lifecycle-end semantics
  - must exclude cut `2` ongoing control authority

### 4. Trigger-input boundary cut

- Ownership conflict: receive-side candidate production and task-side trigger interpretation currently cross the task-domain seam.
- Scope: trigger ingress only, between receive-produced trigger candidates and task-consumed trigger inputs.
- Evidence:
  - `src/stores/frames/receiveFramesStore.ts:1127-1139`
  - `src/stores/frames/sendTasksStore.ts:554-562`
  - `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- Explicit exclusions:
  - no lifecycle-end semantics
  - no creation/control ownership
  - no receive parsing redesign
  - no scheduling/timer cleanup framing
  - no ownership of `stop/completed/remove` meaning
  - any `updateTaskStatus(..., 'completed')` path touched here must defer semantic authority to cut `1`
- Neighbor exclusions:
  - must exclude cut `2` ongoing control authority
  - must exclude cut `5` timer-resource ownership

### 5. Timer-resource ownership cut

- Ownership conflict: task-time progression depends on timer resources split across renderer, composable bridge, and main-process timer management.
- Scope: timer-resource ownership only for scheduling/time-progression infrastructure used by tasks.
- Evidence:
  - `src/composables/common/useTimerManager.ts:20-52`
  - `src/composables/common/useTimerManager.ts:226-250`
  - `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
  - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`
  - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`
- Explicit exclusions:
  - no boot/exit cleanup bucket
  - no dialog close/background behavior
  - no waiting-schedule control semantics beyond the resource seam they depend on
  - no new scheduling features
  - no ownership of `stop/completed/remove`
  - no changes to completion-vs-removal semantics
  - any `updateTaskStatus(..., 'completed')` path touched here must defer semantic authority to cut `1`
- Neighbor exclusions:
  - must exclude cut `4` trigger ingress
  - must exclude cut `2` control ownership

## Acceptance Criteria

- The plan defines 5 cuts and each cut names:
  - one ownership conflict
  - explicit exclusions
  - adjacent cuts it must exclude
- `cut 1` is the only hard gate stated by the plan.
- `cut 2` owns control of an already-created task, including monitor `start/retry`, close/background-continue, and `waiting-schedule` control interpretation.
- `cut 3` owns creation-entry and first-start during creation only, and excludes control of an already-created task.
- `cuts 4` and `5` may touch execution paths that currently end in `completed`, but they fail review if they absorb lifecycle-end authority instead of deferring to `cut 1`.
- A reviewer can trace every cut back to cited evidence and verify adjacent and non-adjacent seam disjointness.
- The artifact remains planning-only and does not prescribe implementation design.

## Risks And Mitigations

- Risk: cut-boundary bleed between creation-entry and control, especially dialog close/background-continue behavior.
  - Mitigation: assign those decisions only to `cut 2`, and require `cut 3` to exclude them explicitly.
- Risk: cut-boundary bleed between creation-entry and control around monitor `start/retry` on an already-created task.
  - Mitigation: classify first-start during task creation under `cut 3`, and classify monitor/control-surface start or retry of an existing task under `cut 2`.
- Risk: cut-boundary bleed between control and timer seams, especially around `waiting-schedule` semantics.
  - Mitigation: keep `waiting-schedule` interpretation in control ownership unless the issue is strictly timer-resource authority.
- Risk: trigger or timer cuts absorb lifecycle-end ambiguity indirectly.
  - Mitigation: keep `cut 1` as the gate and reject later-cut framing that redefines stop/completed/remove meaning.
- Risk: timer work is mislabeled as generic cleanup.
  - Mitigation: keep `cut 5` labeled and evidenced strictly as timer-resource ownership, with cleanup framing excluded.

## Verification Steps

1. Re-check each cut against its cited files and confirm the evidence matches the stated seam.
2. For each adjacent pair (`1/2`, `2/3`, `3/4`, `4/5`), prove disjointness by showing what one cut owns and what it explicitly excludes.
3. Re-check principle/option consistency against the single dominant seam rule; reject any cut that mixes two authorities.
4. Re-check non-adjacent lifecycle-end bleed by tracing each current `updateTaskStatus(..., 'completed')` caller in trigger and scheduled paths back into `sendTasksStore` removal.
   - Evidence anchors:
     - `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-304`
     - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-600`
     - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-874`
     - `src/stores/frames/sendTasksStore.ts:424-426`
5. Apply an explicit pass/fail rule to `cut 4`: it may touch trigger-execution paths that currently end in `completed`, but it fails review if it absorbs lifecycle-end authority instead of deferring to `cut 1`.
6. Apply an explicit pass/fail rule to `cut 5`: it may touch timer-driven execution paths that currently end in `completed`, but it fails review if it absorbs lifecycle-end authority instead of deferring to `cut 1`.
7. Re-check monitor `start/retry` classification against the plan rule by inspecting:
   - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
   - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`
8. Re-check that `cut 1` is the only hard gate and that post-gate ordering is presented as ranked preference, not as an unsupported prerequisite chain.
9. Re-check that the artifact stays planning-only and does not drift into solution design.

## ADR

- Decision:
  - Use a lifecycle-first sequence, then prioritize control before creation entry, then trigger ingress, then timer resources.
- Drivers:
  - stop/completed/remove collapse
  - live control inconsistency around `waiting-schedule`
  - start/restart ambiguity between creation and control surfaces
  - need for reviewer-verifiable disjointness across adjacent and non-adjacent cuts
- Alternatives considered:
  - entrypoint-first sequencing
  - timer-first sequencing
  - broader mixed-cleanup framing
- Why chosen:
  - It preserves the strongest lifecycle-first gate while giving later execution slices single-seam boundaries and explicit fail conditions.
- Consequences:
  - Early work stays structural rather than user-visible.
  - Later execution should be narrower and easier to verify slice by slice.
- Follow-ups:
  - Use this PRD together with the companion test spec for later execution approval.
  - Decide between `ralph` and `$team` at execution time based on whether only cut `1-3` or the full `1-5` set is being attempted.

## Available-Agent-Types Roster

- `explore`: repo-local fact lookup and impact mapping
- `planner`: plan maintenance and sequencing
- `architect`: boundary/tradeoff review
- `critic`: plan-quality gate
- `executor`: implementation lane
- `test-engineer`: regression/test-shape lane
- `verifier`: completion evidence lane

## Follow-up Staffing Guidance

- Preferred `ralph` path:
  - `cut 1-3`
  - Reason: lifecycle, control, and creation seams are tightly coupled and benefit from one owner maintaining invariant continuity.
- Possible `$team` path:
  - `cut 4-5` only after `cut 1` is complete and accepted
  - Reason: trigger ingress and timer-resource work can split into bounded execution and verification lanes once lifecycle semantics are stable.
- Suggested reasoning levels by lane:
  - boundary review: high
  - implementation: high
  - test/verification: medium to high

## Launch Hints

- Ralph handoff:
  - `"$ralph use .omx/plans/prd-task-system-followup-2026-04-23.md and .omx/plans/test-spec-task-system-followup-2026-04-23.md"`
- Team handoff:
  - `"$team execute .omx/plans/prd-task-system-followup-2026-04-23.md with test-engineer and verifier lanes"`

## Team Verification Path

- During execution, each cut must prove:
  - unchanged behavior on untouched neighboring seams
  - explicit ownership boundary assertions for the cut under review
  - explicit failure if a later cut tries to redefine lifecycle-end meaning
- Before shutdown, the team must show:
  - adjacent-pair disjointness checks passed
  - non-adjacent lifecycle-bleed trace passed
  - the cut did not violate its explicit exclusions
- After any team handoff, a final verifier pass should confirm the resulting state still trends toward the architecture ownership model in `easysdd/architecture/domain-task-system-ownership.md`.

## Plan Changelog

- Split creation-entry and ongoing control into separate cuts.
- Moved post-gate priority to `3 -> 2 -> 4 -> 5` based on stronger live control evidence.
- Added explicit `start/retry` ownership rules.
- Added per-cut pass/fail rules for trigger/timer cuts that currently touch `completed`.
