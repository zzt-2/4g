# Test Spec: Task System Follow-up Cut Sequence

Status: approved, planning-only
Companion PRD: `.omx/plans/prd-task-system-followup-2026-04-23.md`

## Purpose

Define the minimum verification shape required before any future execution starts on the approved task-system cut sequence. This is not an implementation test plan for a single diff; it is the acceptance and regression contract for future slice-by-slice execution.

## Global Gates

Before any cut starts:

- The execution proposal names exactly one target cut from the PRD.
- The execution proposal repeats that cut’s explicit exclusions and neighboring cuts it must exclude.
- The execution proposal states whether it can touch a path that currently ends in `updateTaskStatus(..., 'completed')`.
- If yes, the proposal must state that lifecycle-end meaning still belongs to `cut 1`.

After any cut lands:

- Adjacent-pair disjointness must still hold.
- Non-adjacent lifecycle-end bleed must still defer to `cut 1`.
- No untouched cut may silently absorb the changed seam.

## Cut-Specific Verification

### Cut 1: Lifecycle-end ownership

- Prove current stop/completed/remove behavior is explicitly mapped before any refactor.
  - Evidence anchors:
    - `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`
    - `src/stores/frames/sendTasksStore.ts:424-426`
- Verify later execution docs do not redefine completion-vs-removal semantics outside this cut.

### Cut 2: Control ownership

- Verify monitor `start/retry`, pause, resume, stop, close/background-continue, and `waiting-schedule` interpretation are treated as one control seam.
  - Evidence anchors:
    - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
    - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:333-378`
    - `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`
    - `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
- Fail the cut if it reclaims creation-time first start.

### Cut 3: Creation-entry ownership

- Verify page/dialog/command creation entry and first-start during creation are treated as one seam.
  - Evidence anchors:
    - `src/pages/FrameSendPage.vue:153-183`
    - `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:243-280`
    - `src/components/frames/FrameSend/TriggerSend/TriggerSendDialog.vue:289-368`
    - `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:631-753`
    - `src/composables/scoe/commands/readFileAndSend.ts:118-157`
- Fail the cut if it starts owning control of an already-created task.

### Cut 4: Trigger-input boundary

- Verify receive-produced trigger candidates and task-consumed trigger inputs are the only seam under review.
  - Evidence anchors:
    - `src/stores/frames/receiveFramesStore.ts:1127-1139`
    - `src/stores/frames/sendTasksStore.ts:554-562`
    - `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
- Explicit rejection rule:
  - This cut may touch paths that currently end in `completed`, but it fails verification if it absorbs lifecycle-end meaning instead of deferring to `cut 1`.

### Cut 5: Timer-resource ownership

- Verify renderer timers, timer bridge, and main-process timer manager are the only seam under review.
  - Evidence anchors:
    - `src/composables/common/useTimerManager.ts:20-52`
    - `src/composables/common/useTimerManager.ts:226-250`
    - `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
    - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`
    - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`
- Explicit rejection rule:
  - This cut may touch timer-driven paths that currently end in `completed`, but it fails verification if it absorbs lifecycle-end meaning instead of deferring to `cut 1`.

## Cross-Cut Regression Checks

1. Adjacent-pair disjointness:
   - `1/2`, `2/3`, `3/4`, `4/5`
2. Non-adjacent lifecycle bleed:
   - trace each current `updateTaskStatus(..., 'completed')` caller back into store removal
   - Evidence anchors:
     - `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:286-304`
     - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:562-600`
     - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:865-874`
     - `src/stores/frames/sendTasksStore.ts:424-426`
3. Monitor `start/retry` classification:
   - must remain inside `cut 2`, not `cut 3`
   - Evidence anchors:
     - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:82-103`
     - `src/components/frames/FrameSend/ActiveTasksMonitor.vue:373-378`
4. Planning-only gate:
   - reject any execution proposal that silently changes the cut order, enlarges scope, or introduces design choices not justified by the PRD.

## Exit Criteria

- The target cut passes its own rejection rules.
- Adjacent-pair disjointness checks pass.
- Non-adjacent lifecycle-bleed trace passes.
- No exclusion from the PRD was violated.
- The execution note can explain, in one paragraph, why the result still respects the architecture direction for task-system ownership.
