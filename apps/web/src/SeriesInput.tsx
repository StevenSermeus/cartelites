import { useEffect, useId, useState } from 'react';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';
import { realtime } from './realtime';

export function useSeriesOptions(tcg: string, includeUnavailable = false, enabled = true) {
  const key = JSON.stringify([tcg, includeUnavailable, enabled]);
  const [result, setResult] = useState<{ key: string; options: string[]; error?: string }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setResult(undefined);
    const stop = realtime.subscribe<string[]>('readModels:stockSeries', { tcg, includeUnavailable },
      options => { if (active) setResult({ key, options }); },
      error => { if (active) setResult({ key, options: [], error: error.message }); });
    return () => { active = false; stop(); };
  }, [key, retry]);
  const current = enabled && result?.key === key ? result : undefined;
  return { options: current?.options ?? [], error: current?.error, loading: enabled && !current, reload: () => setRetry(value => value + 1) };
}

/** Native datalist completion keeps arbitrary manual entries and keyboard support. */
export function SeriesInput({ tcg = 'pokemon', value, onChange, maxLength = 300, disabled = false }: {
  tcg?: string; value: string; onChange: (value: string) => void; maxLength?: number; disabled?: boolean;
}) {
  const id = useId();
  const series = useSeriesOptions(tcg, true);
  return <>
    <Input list={id} aria-label="Série / extension" value={value} onChange={event => onChange(event.target.value)}
      maxLength={maxLength} disabled={disabled} autoComplete="off" placeholder="Série existante ou nouvelle série" />
    <datalist id={id}>{series.options.map(option => <option key={option} value={option} />)}</datalist>
    {series.loading && <small role="status">Chargement des séries connues…</small>}
    {series.error && <span role="status"><small>Suggestions indisponibles. La saisie libre reste possible.</small> <Button type="button" variant="link" size="sm" onClick={series.reload}>Réessayer</Button></span>}
  </>;
}

export function SeriesFilter({ value, onChange, options, loading, error, onRetry }: {
  value: string; onChange: (value: string) => void; options: readonly string[]; loading?: boolean; error?: string; onRetry?: () => void;
}) {
  return <>
    <select aria-label="Série / extension" value={value} onChange={event => onChange(event.target.value)}>
      <option value="">Toutes les séries</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
    {loading && <small role="status">Chargement des séries…</small>}
    {error && <span role="status"><small>Séries indisponibles.</small> <Button type="button" variant="link" size="sm" onClick={onRetry}>Réessayer</Button></span>}
  </>;
}
