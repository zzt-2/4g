export interface DataRecord {
  readonly timestamp: number;
  readonly data: unknown;
}

export interface DataRecorder {
  record(data: unknown): void;
  getRecords(): readonly DataRecord[];
  clear(): void;
}

export function createDataRecorder(): DataRecorder {
  const records: DataRecord[] = [];

  return {
    record(data: unknown): void {
      records.push({ timestamp: Date.now(), data });
    },

    getRecords(): readonly DataRecord[] {
      return [...records];
    },

    clear(): void {
      records.length = 0;
    },
  };
}
