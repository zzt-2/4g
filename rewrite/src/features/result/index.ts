// result feature — public API
export type { CaseVerdict, CaseVerdictKind, ResultStateSnapshot } from './core';
export { isStepFailed, judgeCaseVerdict } from './core';
export type { ResultService } from './services/result-service';
export { createResultService } from './services/result-service';
export type { ResultStateContainer } from './state/result-state';
export { createResultState } from './state/result-state';
export { selectAllVerdicts, selectVerdict, selectVerdictsByDefinition } from './selectors';
