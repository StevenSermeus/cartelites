/** Keeps retry identity and a confirmed result independent of follow-up reads/uploads. */
export class OperationAttempt {
  private attempt: { signature: string; body: string; confirmed: boolean; result: unknown } | null =
    null;
  prepare(path: string, payload: object) {
    const signature = JSON.stringify({ path, payload });
    if (this.attempt?.signature !== signature)
      this.attempt = {
        signature,
        body: JSON.stringify({ operationId: crypto.randomUUID(), ...payload }),
        confirmed: false,
        result: undefined,
      };
    return this.attempt;
  }
  confirm(result: unknown) {
    if (this.attempt) {
      this.attempt.confirmed = true;
      this.attempt.result = result;
    }
  }
  reset() {
    this.attempt = null;
  }
}
/** Invalidating a key makes every outstanding request for that editor stale. */
export class RequestGenerations {
  private values = new Map<string, number>();
  begin(key: string) {
    const value = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, value);
    return () => this.values.get(key) === value;
  }
}
