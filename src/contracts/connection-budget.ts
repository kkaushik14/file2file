// Shared in-memory admission limits. Keys must come from the transport, not user input.
export class ConnectionBudget {
  private addresses = new Map<string, { active: number; attempts: number; until: number }>();

  acquire(address: string, now = Date.now()): (() => void) | undefined {
    for (const [key, entry] of this.addresses)
      if (entry.active === 0 && entry.until <= now) this.addresses.delete(key);
    let entry = this.addresses.get(address);
    if (!entry) {
      if (this.addresses.size >= 1000) return;
      entry = { active: 0, attempts: 0, until: now + 60_000 };
      this.addresses.set(address, entry);
    }
    if (entry.until <= now) {
      entry.attempts = 0;
      entry.until = now + 60_000;
    }
    if (entry.active >= 8 || entry.attempts >= 60) return;
    entry.active += 1;
    entry.attempts += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        entry.active -= 1;
      }
    };
  }
}
