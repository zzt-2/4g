# Task System Follow-up Ralplan Draft

## RALPLAN-DR Summary

### Principles

1. Keep the next phase bounded to small, reversible slices rather than broad rewrites.
2. Separate ownership clarification from implementation design; decide boundaries before changing behavior.
3. Prioritize cuts that unblock later feature work by reducing cross-layer coupling.
4. Preserve existing runtime behavior with explicit verification before any cleanup slice lands.

### Decision Drivers

1. Remove the couplings that currently block new feature work fastest.
2. Keep the first execution slices low-risk and reviewable.
3. Align the execution order with the architecture docs' target ownership model.

### Viable Options

#### Option A: Lifecycle-first sequence

Start by clarifying terminal-state semantics and lifecycle ownership, then move to receive-trigger ingress, then timer ownership, then UI/store boundary cleanup.

Pros:
- Attacks the deepest cross-cutting ambiguity first.
- Gives later slices a clearer state model.
- Best aligned with architecture docs that place lifecycle ownership inside the task system.

Cons:
- First slice is not visually obvious in UI, so progress can look abstract.
- Requires disciplined regression checks around task transitions.

#### Option B: UI-boundary-first sequence

Start by shrinking page/dialog ownership, then address lifecycle and trigger/timer concerns later.

Pros:
- Visible surface area is easy to inventory and explain.
- Initial code reviews may feel simpler because the boundary is concrete.

Cons:
- Leaves the deeper lifecycle and timer contradictions untouched.
- Risks moving UI responsibilities without first stabilizing the underlying task facts.

#### Option C: Timer-first sequence

Start by inventorying and consolidating timer ownership before touching lifecycle or dialog boundaries.

Pros:
- Targets a concrete technical pain point with direct runtime implications.
- May simplify later cleanup in executor/controller paths.

Cons:
- Timer ambiguity is downstream of lifecycle ambiguity in several paths.
- Does not address trigger ingress and terminal-state confusion soon enough.

## Requirements Summary

- Produce a follow-up plan that turns the module overview into 3-5 ranked refactor cut points without entering design or implementation.
- Keep the sequence aligned with the architecture docs that define the task system as an independent capability domain rather than page/receive/send ownership.
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:93-112`
  - Evidence: `easysdd/architecture/domain-task-system-ownership.md:192-223`
- Ground the plan in current code facts showing fragmented entry points and lifecycle ownership.
  - Evidence: `src/pages/FrameSendPage.vue:264-400`
  - Evidence: `src/composables/scoe/commands/readFileAndSend.ts:118-157`
  - Evidence: `src/stores/frames/receiveFramesStore.ts:1127-1139`
  - Evidence: `src/stores/frames/sendTasksStore.ts:145-175`
  - Evidence: `src/composables/common/useTimerManager.ts:20-52`
- Prefer slices that are reviewable and reversible, and that can later be executed with explicit regression coverage before cleanup.

## Acceptance Criteria

1. The plan identifies 3-5 concrete refactor cut points, and each cut point includes scope, non-goals, primary files, and a reason it belongs in that position in the sequence.
2. The plan explicitly distinguishes “coupling to reduce” from “areas intentionally deferred”, so later execution does not drift into broad redesign.
3. The first slice is justified by current evidence from both architecture docs and code paths, not by implementation preference alone.
4. The plan defines the minimum verification expected before and after any future execution slice, including lifecycle, trigger ingress, timer behavior, and UI/task-control regression surfaces.
5. The plan remains pre-implementation: it does not prescribe concrete class shapes, APIs, or code edits.

## Proposed Execution-Prep Steps

### Step 1: Freeze the baseline ownership map and choose the first slice

- Use the existing module overview as the baseline fact source.
- Confirm that the first slice is selected by “feature-unblocking value + low reversibility risk”, not by surface visibility.
- Primary references:
  - `easysdd/compound/2026-04-23-explore-task-system-module-overview.md`
  - `easysdd/architecture/domain-task-system-ownership.md:93-112`
  - `easysdd/architecture/topology-receive-send-mainlines.md:173-181`

### Step 2: Slice 1 candidate — terminal-state and cleanup semantics

- Scope:
  - Clarify the execution boundary around `completed`, `stopped`, and cleanup responsibilities before any broader decomposition.
  - Focus on where lifecycle facts are held, who marks them, and who deletes them.
- Non-goals:
  - No timer redesign.
  - No UI entrypoint reshaping.
- Primary files:
  - `src/stores/frames/sendTasksStore.ts:401-477`
  - `src/composables/frames/sendFrame/useSendTaskController.ts:23-117`
  - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:451-485`
- Why this slice belongs first:
  - Current stop flow writes `completed`, and `completed` immediately removes the task, which obscures later ownership work.
  - Evidence: `src/composables/frames/sendFrame/useSendTaskController.ts:55-57`
  - Evidence: `src/stores/frames/sendTasksStore.ts:424-426`

### Step 3: Slice 2 candidate — receive-to-task trigger ingress boundary

- Scope:
  - Clarify the explicit ingress contract from receive processing into task triggering.
  - Inventory where trigger semantics depend on receive mappings and where task-specific input should begin.
- Non-goals:
  - No trigger-rule redesign.
  - No send-path rewrite.
- Primary files:
  - `src/stores/frames/receiveFramesStore.ts:1127-1228`
  - `src/stores/frames/sendTasksStore.ts:554-562`
  - `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-217`
- Why this slice belongs near the front:
  - It is the main coupling between receive ownership and task semantics, and it blocks new trigger-related features.

### Step 4: Slice 3 candidate — timer ownership inventory and convergence path

- Scope:
  - Inventory the runtime timer surfaces used by task execution and cleanup.
  - Define the execution boundary for future work between task-owned timers, Electron timer manager, and renderer local timers.
- Non-goals:
  - No scheduler redesign.
  - No transport-level changes.
- Primary files:
  - `src/composables/common/useTimerManager.ts:20-52`
  - `src-electron/main/ipc/timerManagerHandlers.ts:194-220`
  - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:140-159`
  - `src/composables/frames/sendFrame/useSendTaskExecutor.ts:252-259`
  - `src/boot/taskManager.ts:17-48`
- Why it comes after slices 1-2:
  - Timer ownership becomes easier to reason about once terminal semantics and trigger ingress facts are not competing with cleanup ambiguity.

### Step 5: Slice 4-5 candidates — UI/store orchestration boundary cleanup

- Slice 4 scope:
  - Bound what page/dialogs are allowed to decide versus what should belong to task orchestration.
  - Primary files: `src/pages/FrameSendPage.vue:264-400`, `src/components/frames/FrameSend/TimedSend/TimedSendDialog.vue:192-220`, `src/components/frames/FrameSend/EnhancedSequentialSend/EnhancedSequentialSendDialog.vue:766-793`
- Slice 5 scope:
  - Bound what stays in `sendTasksStore` as state ownership versus what belongs to orchestration helpers.
  - Primary files: `src/stores/frames/sendTasksStore.ts:145-175`, `src/stores/frames/sendTasksStore.ts:530-576`
- Non-goals:
  - No full store split in one pass.
  - No page redesign.
- Why these come later:
  - They become less speculative after lifecycle, ingress, and timer boundaries are clarified.

## Risks and Mitigations

- Risk: The plan drifts from “small slice” into hidden redesign.
  - Mitigation: Each slice must declare non-goals and changed ownership boundaries before execution starts.
- Risk: Future execution focuses on visible UI cleanup and misses the deeper lifecycle blockers.
  - Mitigation: Keep terminal-state semantics and trigger ingress ahead of dialog cleanup in the sequence.
- Risk: Cleanup begins without enough regression protection.
  - Mitigation: Require lifecycle and trigger/timer verification prep before any slice enters implementation.

## Verification Steps

1. Confirm every planned slice maps back to a documented blocker in the module overview.
2. Confirm every slice lists explicit non-goals and primary files.
3. Confirm the sequence is evidence-based and consistent with architecture ownership docs.
4. Confirm no step prescribes concrete implementation design.
5. Before any later execution handoff, require a companion test-spec that covers:
   - task terminal transitions
   - receive-trigger ingress
   - timer registration/cleanup
   - UI monitor control behavior

## ADR

- Decision:
  - Use a lifecycle-first, small-slice follow-up sequence: terminal-state semantics -> receive-trigger ingress -> timer ownership -> UI/store boundary cleanup.
- Drivers:
  - Current feature-blocking couplings are deepest in lifecycle, ingress, and timer ownership rather than in page layout alone.
  - Evidence: `src/composables/frames/sendFrame/useSendTaskTriggerListener.ts:164-183`
  - Evidence: `src/stores/frames/sendTasksStore.ts:424-426`
  - Evidence: `src/composables/common/useTimerManager.ts:226-250`
- Alternatives considered:
  - UI-boundary-first: simpler surface, but postpones deeper contradictions.
  - Timer-first: concrete technical slice, but still leaves lifecycle and ingress ambiguity ahead of it.
- Why chosen:
  - It offers the best balance of feature-unblocking value, reversibility, and alignment with the architecture docs.
- Consequences:
  - Early execution slices may feel less visible in the UI, but later slices should become narrower and less speculative.
- Follow-ups:
  - Convert this plan into PRD + test-spec artifacts for execution handoff.
  - Re-check whether the first two slices should run under `ralph` before deciding if later slices warrant `$team`.

## Available-Agent-Types Roster

- `explore`: repo-local fact lookup and impact mapping
- `planner`: plan maintenance and sequencing
- `architect`: boundary/tradeoff review
- `critic`: plan-quality gate
- `executor`: later implementation lane
- `test-engineer`: later regression/test-shape lane
- `verifier`: later completion evidence lane

## Follow-up Staffing Guidance

- Preferred first execution mode: `ralph`
  - Reason: the first 2 slices are tightly coupled and benefit from one owner carrying lifecycle invariants end-to-end.
- Later optional execution mode: `$team`
  - Reason: once invariants are stable, timer-boundary work and UI/store-boundary work may split into separate lanes.
- Suggested reasoning levels by lane:
  - Boundary/sequence review: high
  - Implementation lane: high
  - Test/verification lane: medium to high

## Launch Hints For Later

- Ralph path:
  - `"$ralph use .omx/plans/prd-task-system-followup-2026-04-23.md and .omx/plans/test-spec-task-system-followup-2026-04-23.md"`
- Team path:
  - `"$team execute .omx/plans/prd-task-system-followup-2026-04-23.md with verifier and test-engineer lanes"`

## Team Verification Path

- During team execution, each slice should prove:
  - unchanged behavior on existing task entry paths
  - explicit lifecycle-state assertions for the slice boundary
  - explicit timer/trigger cleanup behavior when relevant
- After team handoff, a final Ralph-style verification pass should confirm the overall task flow still matches the architecture ownership direction and the slice non-goals were respected.
