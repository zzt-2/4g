export class TimerRegistry {
  private readonly timers = new Map<string, {
    readonly groupId: string;
    readonly callback: () => void;
    readonly intervalMs: number;
    handle: ReturnType<typeof setInterval> | null;
    remainingMs: number;
    pausedAt: number | null;
  }>();

  private paused = false;

  register(id: string, callback: () => void, intervalMs: number, groupId = 'default'): string {
    this.clear(id);

    const handle = this.paused ? null : setInterval(callback, intervalMs);

    this.timers.set(id, {
      groupId,
      callback,
      intervalMs,
      handle,
      remainingMs: intervalMs,
      pausedAt: this.paused ? Date.now() : null,
    });

    return id;
  }

  clear(id: string): void {
    const entry = this.timers.get(id);
    if (!entry) return;

    if (entry.handle != null) {
      clearInterval(entry.handle);
    }
    this.timers.delete(id);
  }

  clearGroup(groupId: string): void {
    for (const [id, entry] of this.timers) {
      if (entry.groupId === groupId) {
        if (entry.handle != null) {
          clearInterval(entry.handle);
        }
        this.timers.delete(id);
      }
    }
  }

  pauseAll(): void {
    if (this.paused) return;
    this.paused = true;
    const now = Date.now();

    for (const entry of this.timers.values()) {
      if (entry.handle != null) {
        clearInterval(entry.handle);
        entry.remainingMs = Math.max(0, entry.intervalMs - ((now - (entry.pausedAt ?? now)) % entry.intervalMs));
        entry.handle = null;
        entry.pausedAt = now;
      }
    }
  }

  resumeAll(): void {
    if (!this.paused) return;
    this.paused = false;

    for (const entry of this.timers.values()) {
      if (entry.pausedAt != null) {
        entry.handle = setInterval(entry.callback, entry.intervalMs);
        entry.pausedAt = null;
      }
    }
  }

  getActiveCount(): number {
    let count = 0;
    for (const entry of this.timers.values()) {
      if (entry.handle != null) count++;
    }
    return count;
  }
}
