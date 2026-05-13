import { nanoid } from 'nanoid';

export interface CommandLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly commandCode: number;
  readonly result: 'success' | 'error' | 'pending';
  readonly durationMs?: number;
  readonly error?: string;
}

export interface CommandLogRecorder {
  record(entry: Omit<CommandLogEntry, 'id'>): CommandLogEntry;
  complete(id: string, patch: Partial<Pick<CommandLogEntry, 'result' | 'durationMs' | 'error'>>): void;
  getAll(): readonly CommandLogEntry[];
  clear(): void;
}

export function createCommandLogRecorder(maxEntries = 1000): CommandLogRecorder {
  const entries: CommandLogEntry[] = [];

  return {
    record(entry) {
      const full: CommandLogEntry = { ...entry, id: nanoid() };
      entries.push(full);
      if (entries.length > maxEntries) entries.shift();
      return full;
    },

    complete(id, patch) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return;
      entries[idx] = { ...entries[idx], ...patch };
    },

    getAll() {
      return [...entries];
    },

    clear() {
      entries.length = 0;
    },
  };
}
