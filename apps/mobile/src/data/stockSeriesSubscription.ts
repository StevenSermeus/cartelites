/** Scope validation applies to successes AND errors; disposal also covers the
 * asynchronous account lookup before the realtime subscription is created. */
export function subscribeStockSeries(
  capture: () => Promise<{assertActive: () => void}>,
  subscribe: (value: (labels: string[]) => void, error: (error: Error) => void) => () => void,
  publish: (labels: string[], error: string) => void,
) {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  void capture().then(scope => {
    if (!active) return;
    scope.assertActive();
    const send = (labels: string[], error: string) => {
      if (!active) return;
      try { scope.assertActive(); } catch { return; }
      publish(labels, error);
    };
    unsubscribe = subscribe(labels => send(labels, ''), error => send([], error.message));
  }).catch(error => {
    if (active) publish([], error instanceof Error ? error.message : 'Chargement des séries impossible.');
  });
  return () => { active = false; unsubscribe?.(); };
}
