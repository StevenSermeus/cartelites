import { realtime } from './realtime';
import { useEffect, useMemo, useRef, useState } from 'react';

type Period = 'day' | 'month';
type Summary = { purchaseCents: number; salesCents: number; pendingCents: number; unknownCents: number; cashCents: number; transferCents: number; gains: number; losses: number; commissions: number; consignmentSales: number; net: number; purchaseCount: number; saleCount: number; dueCents: number; regularizationCents: number };
type Day = { key: string; purchases: number; sales: number; gains: number; losses: number };
type Breakdown = { key: string; label: string; stockCount: number; marginCents: number };
type Data = { summary: Summary; days: Day[]; byTcg?: Breakdown[]; byOrigin?: Breakdown[] };
type Row = Day & { label: string; margin: number };
type Props = { request: <T = unknown>(path: string) => Promise<T>; onOpenConsignments: () => void };
const euro = (cents: number) => new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export default function DashboardPage({ request, onOpenConsignments }: Props) {
  const [dimension, setDimension] = useState<'tcg' | 'origin'>('tcg');
  const [metric, setMetric] = useState<'stock' | 'margin'>('stock');
  const [period, setPeriod] = useState<Period>('month'); const [data, setData] = useState<Data | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    setBusy(true); setError('');
    return realtime.subscribe<Data>('readModels:dashboardSummary', {}, result => {
      setData(result); setBusy(false); setError('');
    }, error => { setData(null); setError(error.message); setBusy(false); });
  }, [retry]);
  const rows = useMemo<Row[]>(() => {
    const count = period === 'day' ? 30 : 12; const now = new Date(); const today = dayKey(now);
    const [year, month, date] = today.split('-').map(Number);
    const buckets: Row[] = Array.from({ length: count }, (_, i) => {
      const d = period === 'day' ? new Date(Date.UTC(year, month - 1, date - count + i + 1, 12)) : new Date(Date.UTC(year, month - count + i, 1, 12));
      const key = period === 'day' ? dayKey(d) : dayKey(d).slice(0, 7);
      return { key, label: period === 'day' ? d.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short' }) : d.toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', month: 'short', year: '2-digit' }), purchases: 0, sales: 0, gains: 0, losses: 0, margin: 0 };
    });
    const map = new Map(buckets.map(row => [row.key, row]));
    for (const day of data?.days ?? []) { const row = map.get(period === 'day' ? day.key : day.key.slice(0, 7)); if (row) { row.purchases += day.purchases; row.sales += day.sales; row.gains += day.gains; row.losses += day.losses; } }
    for (const row of buckets) row.margin = row.gains - row.losses;
    return buckets;
  }, [data, period]);
  if (busy && !data) return <section className="panel"><p>Chargement du dashboard…</p></section>;
  if (error && !data) return <section className="panel"><p className="error">Impossible de charger le dashboard : {error}</p><button type="button" onClick={() => setRetry(v => v + 1)}>Réessayer</button></section>;
  const s = data!.summary;
  return <div className="dashboard-page">
    {error && <p className="error">Actualisation impossible : {error} <button type="button" className="secondary" onClick={() => setRetry(v => v + 1)}>Réessayer</button></p>}
    <div className="dashboard-summary-grid" aria-label="Synthèse, tout l’historique">
      <article className="dashboard-summary-card"><span>Ventes encaissées</span><strong>{euro(s.salesCents)}</strong><small>Tout l’historique</small></article>
      <article className="dashboard-summary-card dashboard-net"><span>Marge et commissions</span><strong>{euro(s.net)}</strong><small>Avant frais · tout l’historique</small></article>
      <article className="dashboard-summary-card"><span>À encaisser</span><strong>{euro(s.pendingCents)}</strong><small>Paiements en attente</small></article>
      <article className="dashboard-summary-card"><span>À reverser</span><strong>{euro(s.dueCents)}</strong><small>Tout l’historique</small><button type="button" className="secondary" onClick={onOpenConsignments}>Voir reversements</button></article>
    </div>
    <section className="panel dashboard-panel distribution-explorer">
      <div className="distribution-explorer-heading"><div><h3>Comprendre la répartition</h3><p>Comparez le poids de chaque jeu ou activité.</p></div>
        <div className="dashboard-period" role="group" aria-label="Répartition par catégorie">
          <button type="button" className={dimension === 'tcg' ? '' : 'secondary'} aria-pressed={dimension === 'tcg'} onClick={() => setDimension('tcg')}>Par TCG</button>
          <button type="button" className={dimension === 'origin' ? '' : 'secondary'} aria-pressed={dimension === 'origin'} onClick={() => setDimension('origin')}>Par activité</button>
        </div>
      </div>
      <div className="distribution-metric-tabs" role="group" aria-label="Indicateur de répartition">
        <button type="button" aria-pressed={metric === 'stock'} onClick={() => setMetric('stock')}>Stock disponible</button>
        <button type="button" aria-pressed={metric === 'margin'} onClick={() => setMetric('margin')}>Marge et commissions</button>
      </div>
      <BreakdownChart title={dimension === 'tcg' ? 'Par TCG' : 'Par activité'} rows={dimension === 'tcg' ? data!.byTcg : data!.byOrigin} metric={metric} />
    </section>
    <header className="dashboard-heading"><p>Évolution de l’activité <small> · période des graphiques</small></p><div className="dashboard-period" role="group" aria-label="Période des graphiques"><button type="button" className={period === 'day' ? '' : 'secondary'} aria-pressed={period === 'day'} onClick={() => setPeriod('day')}>30 jours</button><button type="button" className={period === 'month' ? '' : 'secondary'} aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>12 mois</button></div></header>
    <ActivityChart rows={rows} title="Ventes encaissées et rachats" first="sales" second="purchases" labels={['Ventes encaissées', 'Rachats']} />
    <ActivityChart rows={rows} title="Marge et commissions" first="margin" labels={['Marge après pertes, avant frais']} />
  </div>;
}
function ActivityChart({ rows, title, first, second, labels }: { rows: Row[]; title: string; first: 'sales' | 'margin'; second?: 'purchases'; labels: string[] }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(900);
  useEffect(() => {
    if (!chartRef.current) return;
    const observer = new ResizeObserver(entries => setChartWidth(Math.max(240, entries[0].contentRect.width)));
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, [rows.some(row => row.sales || row.purchases || row.margin)]);
  const values = rows.flatMap(row => second ? [row[first], row[second]] : [row[first]]); const low = Math.min(0, ...values); const high = values.some(value => value !== 0) ? Math.max(0, ...values) : 100; const span = high - low || 1;
  const width = chartWidth; const height = 250; const left = 64; const right = 30; const top = 14; const bottom = 38; const x = (i: number) => left + (rows.length <= 1 ? 0 : i * (width - left - right) / (rows.length - 1)); const y = (v: number) => top + (high - v) / span * (height - top - bottom);
  const ticks = Array.from({ length: 5 }, (_, i) => low + span * i / 4); const line = (field: 'sales' | 'purchases' | 'margin') => rows.map((row, i) => `${i ? 'L' : 'M'}${x(i)},${y(row[field])}`).join(' ');
  const labelStep = Math.ceil((rows.length - 1) / (width < 500 ? 3 : 6));
  return <section className="panel dashboard-panel"><div className="dashboard-panel-heading"><h3>{title}</h3><div className="dashboard-legend">{labels.map((label, i) => <span key={label}><i className={`dashboard-dot dashboard-dot-${i ? 'purchase' : first === 'margin' ? 'gain' : 'sales'}`} />{label}</span>)}</div></div>
    {!rows.some(row => row.sales || row.purchases || row.margin) ? <p className="dashboard-empty">Aucune activité sur cette période.</p> : <>
      <p className="dashboard-chart-note">Par date d’opération · montants en euros</p>
      <div className="dashboard-svg-wrap" ref={chartRef}><svg className="dashboard-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, montants en euros`}>
        {ticks.map((tick, i) => <g key={i}><line className={Math.abs(tick) < 0.001 ? 'dashboard-zero' : 'dashboard-gridline'} x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} /><text className="dashboard-axis-label" x={left - 8} y={y(tick) + 4} textAnchor="end">{new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(tick / 100)}</text></g>)}
        <line className="dashboard-zero" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
        {rows.map((row, i) => <g key={row.key}><title>{row.label}: {labels[0]} {euro(row[first])}{second ? `, ${labels[1]} ${euro(row[second])}` : ''}</title><circle className={first === 'margin' ? 'dashboard-point-margin' : 'dashboard-point-sales'} cx={x(i)} cy={y(row[first])} r="3.5" />{second && <circle className="dashboard-point-purchase" cx={x(i)} cy={y(row[second])} r="3.5" />}{((i % labelStep === 0 && i < rows.length - labelStep / 2) || i === rows.length - 1) && <text className="dashboard-axis-label" x={x(i)} y={height - 9} textAnchor="middle">{row.label}</text>}</g>)}
        <path className={first === 'margin' ? 'dashboard-line dashboard-line-margin' : 'dashboard-line dashboard-line-sales'} d={line(first)} />{second && <path className="dashboard-line dashboard-line-purchases" d={line(second)} />}
      </svg></div>
      <details><summary>Voir les montants détaillés</summary><div className="table-scroll"><table><thead><tr><th>Période</th>{labels.map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.key}><td>{row.label}</td><td>{euro(row[first])}</td>{second && <td>{euro(row[second])}</td>}</tr>)}</tbody></table></div></details>
    </>}</section>;
}

function BreakdownChart({ title, rows, metric }: { title: string; rows?: Breakdown[]; metric: 'stock' | 'margin' }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(240, entries[0].contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [!!rows]);
  if (!rows) return <section className="panel dashboard-panel"><h3>{title}</h3><p>Répartition indisponible. Actualisez après la mise à jour du serveur.</p></section>;
  const stock = rows.reduce((total, row) => total + row.stockCount, 0);
  const margin = rows.reduce((total, row) => total + row.marginCents, 0);
  const percent = (value: number) => new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 1 }).format(value);
  const colors = ['var(--primary)', 'var(--brand-accent)', 'var(--muted)'];
  const low = Math.min(0, ...rows.map(row => row.marginCents));
  const high = Math.max(0, ...rows.map(row => row.marginCents));
  const scale = (value: number) => 14 + (value - low) / (high - low || 1) * (width - 28);
  return <div className="dashboard-breakdown-group" ref={container}>
    <div hidden={metric !== 'stock'} className="dashboard-breakdown">
      <div className="distribution-chart">
        <svg viewBox={`0 0 ${width} ${rows.length * 67 + 28}`} className="stock-distribution" role="img" aria-label={`Répartition de ${stock} articles en stock. ${rows.map(row => `${row.label} : ${row.stockCount}, ${stock ? percent(row.stockCount / stock) : '0 %'}`).join('. ')}`}>
          {[0, .5, 1].map(tick => <g key={tick}><line x1={14 + tick * (width - 28)} x2={14 + tick * (width - 28)} y1="27" y2={rows.length * 67} stroke="var(--line)" strokeDasharray="3 4" /><text x={14 + tick * (width - 28)} y={rows.length * 67 + 19} textAnchor={tick === 0 ? 'start' : tick === 1 ? 'end' : 'middle'} className="distribution-value">{percent(tick)}</text></g>)}
          {rows.map((row, index) => <g key={row.key}>
            <text x="14" y={index * 67 + 19} className="distribution-category">{row.label}</text>
            <rect x="14" y={index * 67 + 28} width={stock ? row.stockCount / stock * (width - 28) : 0} height="17" rx="3" fill={colors[index % colors.length]}><title>{row.stockCount} articles · {stock ? percent(row.stockCount / stock) : '—'}</title></rect>
            <text x="14" y={index * 67 + 59} className="distribution-value">{row.stockCount} article(s) · {stock ? percent(row.stockCount / stock) : '—'}</text>
          </g>)}
        </svg>
        <p className="dashboard-chart-note">Stock disponible, articles masqués du catalogue inclus.</p>
      </div>
    </div>
    <div hidden={metric !== 'margin'} className="dashboard-breakdown">
      <div className="distribution-chart">
        <svg viewBox={`0 0 ${width} ${rows.length * 67 + 28}`} className="margin-distribution" role="img" aria-label={`Marge et commissions par catégorie : ${rows.map(row => `${row.label}, ${euro(row.marginCents)}, ${margin > 0 ? percent(row.marginCents / margin) : 'part non calculable'}`).join('. ')}`}>
          <line x1={scale(0)} x2={scale(0)} y1="27" y2={rows.length * 67} stroke="var(--line)" strokeWidth="1" />
          {rows.map((row, index) => <g key={row.key}>
            <text x="14" y={index * 67 + 19} className="distribution-category">{row.label}</text>
            <rect x={Math.min(scale(0), scale(row.marginCents))} y={index * 67 + 28} width={Math.abs(scale(row.marginCents) - scale(0))} height="17" rx="3" fill={row.marginCents < 0 ? 'var(--brand-danger)' : colors[index % colors.length]}><title>{euro(row.marginCents)} · {margin > 0 ? percent(row.marginCents / margin) : '—'}</title></rect>
            <text x="14" y={index * 67 + 59} className="distribution-value">{euro(row.marginCents)} · {margin > 0 ? percent(row.marginCents / margin) : '—'}</text>
          </g>)}
          <text x={scale(0)} y={rows.length * 67 + 19} textAnchor="middle" className="distribution-value">0 €</text>
        </svg>
        <p className="dashboard-chart-note">Marge après pertes, commissions incluses, avant frais. Tout l’historique des ventes actives, encaissées ou non.</p>
        {margin <= 0 && <p className="dashboard-chart-note">Parts non calculables : marge totale nulle ou négative.</p>}
        {rows.some(row => row.marginCents < 0) && margin > 0 && <p className="dashboard-chart-note">Les pertes ont une part négative ; les autres contributions peuvent dépasser 100 %.</p>}
      </div>
    </div>
  </div>;
}
