# Task Context Snapshot

- Task statement: Based on the existing task-system module overview, produce a consensus plan for the next follow-up work. The plan should prioritize 3-5 small refactor cut points and define sequencing, boundaries, acceptance criteria, risks, and verification. It must not enter design or implementation.
- Desired outcome: A reusable planning artifact under `.omx/plans/` that turns the exploration findings into a bounded, execution-ready follow-up plan for later use by `ralph` or `team`.

## Known Facts / Evidence

- The architecture docs define the task system as an independent capability domain, but the current code is still a mixed runtime block spanning page/dialogs, task store, task composables, receive pipeline, timer bridge, and boot cleanup.
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:93-112`
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:132-216`
  - Evidence: `easysdd/compound/2026-04-23-explore-task-system-module-overview.md`
- Current formal entry points are split across UI creation, SCOE command creation, receive-side trigger input, and monitor-side control.
  - Evidence: `src/pages/FrameSendPage.vue:264-400`
  - Evidence: `src/composables/scoe/commands/readFileAndSend.ts:118-157`
  - Evidence: `src/stores/frames/receiveFramesStore.ts:1127-1139`
  - Evidence: `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
- Lifecycle ownership is fragmented across `sendTasksStore`, `useSendTaskTriggerListener`, `task.timers`, Electron main-process timer manager, and renderer-side native timers.
  - Evidence: `src/stores/frames/sendTasksStore.ts:145-175`
  - Evidence: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:28-31`
  - Evidence: `src/composables/common/useTimerManager.ts:20-52`
  - Evidence: `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
- The most blocking couplings for future feature work are:
  - trigger semantics depend on receive mappings
  - end semantics are collapsed into immediate completion/removal
  - timer ownership is split between main and renderer paths
  - dialogs still own creation and background-run decisions
  - Evidence: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
  - Evidence: `src/stores/frames/sendTasksStore.ts:424-426`
  - Evidence: `src/composables/common/useTimerManager.ts:226-250`
  - Evidence: `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`

## Constraints

- Planning only. Do not design concrete solutions and do not implement code in this workflow.
- The plan should stay aligned with the existing architecture docs and the completed module-overview document.
- The follow-up should prefer small, reviewable, reversible refactor slices rather than broad rewrites.
- No new dependency adoption is in scope.
- The user asked specifically for the next-step recommendation after exploration; the plan should therefore focus on sequencing and cut-point selection.

## Unknowns / Open Questions

- Which cut point should be executed first if the team wants to maximize short-term feature velocity versus long-term architectural convergence?
- What minimum regression coverage is already present around the task lifecycle, and where will new tests be needed before any cleanup slice?
- Whether the next execution phase should be handled by a single owner (`ralph`) or coordinated lanes (`team`) depends on the approved cut-point sequence.

## Likely Codebase Touchpoints

- `src/pages/FrameSendPage.vue`
- `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue`
- `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue`
- `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue`
- `src/components/frames/FrameSend/ActiveTasksMonitor.vue`
- `src/stores/frames/sendTasksStore.ts`
- `src/stores/frames/receiveFramesStore.ts`
- `src/composables/frames/sendFrame/useSendTaskManager.ts`
- `src/composables/frames/sendFrame/useSendTaskCreator.ts`
- `src/composables/frames/sendFrame/useSendTaskExecutor.ts`
- `src/composables/frames/sendFrame/useSendTaskController.ts`
- `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts`
- `src/composables/common/useTimerManager.ts`
- `src/boot/taskManager.ts`
- `easysdd/architecture/domain-task-system-ownership.md`
- `easysdd/architecture/topology-receive-send-mainlines.md`
- `easysdd/architecture/boundary-runtime-state-ownership.md`
