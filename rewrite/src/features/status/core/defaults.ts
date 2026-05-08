import { STATUS_SCHEMA_VERSION, type StatusSnapshot } from './types';
import { cloneStatusSnapshot } from './clone';

const DEFAULT_HEALTH_OVERALL = 'unknown' as const;

const DEFAULT_STATUS: StatusSnapshot = {
  schemaVersion: STATUS_SCHEMA_VERSION,
  health: {
    overallLevel: DEFAULT_HEALTH_OVERALL,
    sources: [],
  },
  indicators: [],
  indicatorConfigs: [],
};

export function createDefaultStatusSnapshot(): StatusSnapshot {
  return cloneStatusSnapshot(DEFAULT_STATUS);
}
