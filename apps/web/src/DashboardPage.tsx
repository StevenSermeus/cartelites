import { useMemo, useState } from 'react';

type Purchase = {
  occurredAt: number;
  status: string;
  items: { purchasePriceCents: number }[];
};
type Sale = {
  occurredAt: number;
  status: string;
  salePriceCents: number;
  purchasePriceCents: number;
};

type Period = 'day' | 'month';
type Metrics = { purchases: number; sales: number; gains: number; losses: number };
type Props = { purchases: Purchase[]; sales: Sale[] };

const euro = (cents: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function buildBuckets(period: Period, length: number) {
  const today = new Date();
  if (period === 'day') today.setHours(0, 0, 0, 0);
  else today.setDate(1);
  return Array.from({ length }, (_, index) => {
    const date = new Date(today);
    if (period === 'day') date.setDate(today.getDate() - length + index + 1);
    else date.setMonth(today.getMonth() - length + index + 1);
    return {
      key: period === 'day' ? dayKey(date) : monthKey(date),
      label: period === 'day'
        ? date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
        : date.toLocaleDateString('fr-BE', { month: 'short' }),
    };
  });
}

function LineChart({ rows }: { rows: { label: string; purchases: number; sales: number }[] }) {
  const width = 860;
  const height = 260;
  const left = 66;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...rows.flatMap((row) => [row.purchases, row.sales]));
  const points = (key: 'purchases' | 'sales') => rows.map((row, index) => {
    const x = left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
    const y = top + chartHeight - (row[key] / max) * chartHeight;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="dashboard-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Achats et ventes sur la période">
      {[0, 1, 2, 3].map((step) => {
        const y = top + (chartHeight * step) / 3;
        const value = max * (1 - step / 3);
        return <g key={step}><line x1={left} y1={y} x2={width - right} y2={y} className="dashboard-gridline" /><text x={left - 9} y={y + 4} textAnchor="end" className="dashboard-axis-label">{euro(value)}</text></g>;
      })}
      <polyline points={points('purchases')} className="dashboard-line dashboard-line-purchases" />
      <polyline points={points('sales')} className="dashboard-line dashboard-line-sales" />
      {rows.map((row, index) => {
        if (rows.length > 12 && index % Math.ceil(rows.length / 8) !== 0 && index !== rows.length - 1) return null;
        const x = left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
        return <text key={row.label + index} x={x} y={height - 12} textAnchor="middle" className="dashboard-axis-label">{row.label}</text>;
      })}
    </svg>
  );
}

function ProfitChart({ rows }: { rows: { label: string; gains: number; losses: number }[] }) {
  const width = 860;
  const height = 210;
  const left = 20;
  const right = 20;
  const top = 20;
  const bottom = 34;
  const max = Math.max(1, ...rows.flatMap((row) => [row.gains, row.losses]));
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const groupWidth = chartWidth / rows.length;
  const barWidth = Math.max(3, Math.min(12, groupWidth * 0.34));
  const zeroY = top + chartHeight;
  return (
    <svg className="dashboard-chart dashboard-profit-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gains et pertes sur la période">
      <line x1={left} y1={zeroY} x2={width - right} y2={zeroY} className="dashboard-gridline" />
      {rows.map((row, index) => {
        const center = left + groupWidth * (index + 0.5);
        const gainHeight = (row.gains / max) * chartHeight;
        const lossHeight = (row.losses / max) * chartHeight;
        const showLabel = rows.length <= 12 || index % Math.ceil(rows.length / 8) === 0 || index === rows.length - 1;
        return <g key={row.label + index}>
          <rect x={center - barWidth - 1} y={zeroY - gainHeight} width={barWidth} height={gainHeight} rx="2" className="dashboard-bar-gain" />
          <rect x={center + 1} y={zeroY - lossHeight} width={barWidth} height={lossHeight} rx="2" className="dashboard-bar-loss" />
          {showLabel && <text x={center} y={height - 9} textAnchor="middle" className="dashboard-axis-label">{row.label}</text>}
        </g>;
      })}
    </svg>
  );
}

export default function DashboardPage({ purchases, sales }: Props) {
  const [period, setPeriod] = useState<Period>('month');
  const summary = useMemo(() => {
    const purchaseCents = purchases
      .filter((purchase) => purchase.status === 'active')
      .flatMap((purchase) => purchase.items)
      .reduce((sum, item) => sum + item.purchasePriceCents, 0);
    const activeSales = sales.filter((sale) => sale.status === 'active');
    const salesCents = activeSales.reduce((sum, sale) => sum + sale.salePriceCents, 0);
    const gains = activeSales.reduce((sum, sale) => sum + Math.max(0, sale.salePriceCents - sale.purchasePriceCents), 0);
    const losses = activeSales.reduce((sum, sale) => sum + Math.max(0, sale.purchasePriceCents - sale.salePriceCents), 0);
    return { purchaseCents, salesCents, gains, losses, net: gains - losses, purchaseCount: purchases.filter((purchase) => purchase.status === 'active').length, saleCount: activeSales.length };
  }, [purchases, sales]);
  const buckets = useMemo(() => buildBuckets(period, period === 'day' ? 30 : 12), [period]);
  const rows = useMemo(() => {
    const byKey = new Map<string, Metrics>(buckets.map((bucket) => [bucket.key, { purchases: 0, sales: 0, gains: 0, losses: 0 }]));
    for (const purchase of purchases) {
      if (purchase.status !== 'active') continue;
      const date = new Date(purchase.occurredAt);
      const key = period === 'day' ? dayKey(date) : monthKey(date);
      const metric = byKey.get(key);
      if (metric) metric.purchases += purchase.items.reduce((sum, item) => sum + item.purchasePriceCents, 0);
    }
    for (const sale of sales) {
      if (sale.status !== 'active') continue;
      const date = new Date(sale.occurredAt);
      const key = period === 'day' ? dayKey(date) : monthKey(date);
      const metric = byKey.get(key);
      if (!metric) continue;
      metric.sales += sale.salePriceCents;
      const margin = sale.salePriceCents - sale.purchasePriceCents;
      if (margin >= 0) metric.gains += margin;
      else metric.losses += Math.abs(margin);
    }
    return buckets.map((bucket) => ({ ...bucket, ...byKey.get(bucket.key)! }));
  }, [buckets, period, purchases, sales]);
  return (
    <div className="dashboard-page">
      <header className="dashboard-heading">
        <div><small>VUE D’ENSEMBLE</small><h2>Dashboard</h2><p>Suivez les rachats, les ventes et la marge réalisée au fil du temps.</p></div>
        <div className="dashboard-period" role="group" aria-label="Période du graphique">
          <button type="button" className={period === 'day' ? '' : 'secondary'} aria-pressed={period === 'day'} onClick={() => setPeriod('day')}>Par jour</button>
          <button type="button" className={period === 'month' ? '' : 'secondary'} aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Par mois</button>
        </div>
      </header>
      <div className="dashboard-summary-grid">
        <article className="dashboard-summary-card"><span>Total racheté</span><strong>{euro(summary.purchaseCents)}</strong><small>{summary.purchaseCount} rachats actifs</small></article>
        <article className="dashboard-summary-card"><span>Ventes encaissées</span><strong>{euro(summary.salesCents)}</strong><small>{summary.saleCount} ventes actives</small></article>
        <article className="dashboard-summary-card dashboard-positive"><span>Gains réalisés</span><strong>{euro(summary.gains)}</strong><small>Ventes au-dessus du prix de rachat</small></article>
        <article className="dashboard-summary-card dashboard-negative"><span>Pertes réalisées</span><strong>{euro(summary.losses)}</strong><small>Ventes sous le prix de rachat</small></article>
        <article className="dashboard-summary-card dashboard-net"><span>Résultat net réalisé</span><strong>{euro(summary.net)}</strong><small>Gains moins pertes</small></article>
      </div>
      <section className="panel dashboard-panel">
        <div className="dashboard-panel-heading"><div><h3>Achats et ventes</h3><p>Comparaison des montants enregistrés {period === 'day' ? 'par jour sur 30 jours' : 'par mois sur 12 mois'}.</p></div><div className="dashboard-legend"><span><i className="dashboard-dot dashboard-dot-purchase" />Rachats</span><span><i className="dashboard-dot dashboard-dot-sales" />Ventes</span></div></div>
        <LineChart rows={rows} />
      </section>
      <section className="panel dashboard-panel">
        <div className="dashboard-panel-heading"><div><h3>Gains et pertes</h3><p>Marge réalisée sur les cartes vendues, {period === 'day' ? 'par jour' : 'par mois'}.</p></div><div className="dashboard-legend"><span><i className="dashboard-dot dashboard-dot-gain" />Gains</span><span><i className="dashboard-dot dashboard-dot-loss" />Pertes</span></div></div>
        <ProfitChart rows={rows} />
      </section>
    </div>
  );
}
