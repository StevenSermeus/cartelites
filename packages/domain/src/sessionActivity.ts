export type SessionTiming = { issuedAt: number; expiresAt: number; refreshAfterSeconds?: number };
const INTERVAL = 15 * 60_000;

/** Activity is explicit: network traffic and background timers never mark activity. */
export function createActivitySession(refresh: () => Promise<SessionTiming>, now = Date.now) {
  let timing: SessionTiming | undefined;
  let lastActivity = -Infinity;
  let foreground = true;
  let revision = 0;
  let retryAt = 0;
  let pending: Promise<void> | undefined;
  return {
    setSession(value: SessionTiming) { timing = value; retryAt = 0; },
    stop() { revision++; timing = undefined; lastActivity = -Infinity; },
    setForeground(value: boolean) { foreground = value; if (!value) lastActivity = -Infinity; },
    activity() { if (foreground) lastActivity = now(); },
    tick(): Promise<void> {
      if (pending) return pending;
      const time = now();
      const interval = (timing?.refreshAfterSeconds ?? INTERVAL / 1000) * 1000;
      if (!timing || !foreground || time >= timing.expiresAt || time < retryAt ||
          time - timing.issuedAt < interval || time - lastActivity >= interval) return Promise.resolve();
      const current = revision;
      pending = refresh().then(value => {
        if (revision === current) timing = value;
      }).catch(() => {
        if (revision === current) retryAt = now() + 30_000;
      }).finally(() => { pending = undefined; });
      return pending;
    },
  };
}
