import { useEffect, useId, useState } from 'react';
import { useReadPage, ReadPagination } from './useReadPage';
export type PickerClient = { _id: string; name: string; email?: string; phone?: string; address?: string; detail?: string };
export function ClientPicker({ clients, value, onChange, onCreate, onResolved, request, label = 'Rechercher le déposant' }: {
  clients: PickerClient[]; value: string; onChange: (id: string) => void; onCreate?: () => void;
  onResolved?: (client: PickerClient) => void; request: <T>(path: string) => Promise<T>; label?: string;
}) {
  const id = useId(), [search, setSearch] = useState(''), [resolved, setResolved] = useState<PickerClient>();
  const [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const selected = clients.find(client => client._id === value) ?? (resolved?._id === value ? resolved : undefined);
  const data = useReadPage<PickerClient>(request, '/sellers', { search: search.trim(), size: '10' }, !value && search.trim().length >= 2);
  useEffect(() => {
    if (!value || selected) return;
    let active = true; setError('');
    void request<PickerClient>(`/sellers/${encodeURIComponent(value)}`).then(client => { if (active) { setResolved(client); onResolved?.(client); } }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Fiche indisponible'); });
    return () => { active = false; };
  }, [value, !!selected, retry, request]);
  if (value) return <div className="purchase-client-selected"><div>
    <small>Client sélectionné</small><strong>{selected?.name ?? 'Chargement de la fiche…'}</strong>
    <span>{selected ? [selected.email, selected.phone, selected.address].filter(Boolean).join(' · ') : ''}</span>
    {selected?.detail && <span>{selected.detail}</span>}
    {error && <p role="alert" className="error">{error} <button onClick={() => setRetry(v => v + 1)}>Réessayer</button></p>}
    </div><button type="button" className="secondary" onClick={() => { onChange(''); setSearch(''); setResolved(undefined); }}>Changer de client</button></div>;
  return <div className="purchase-client-picker"><label htmlFor={id}>{label}</label>
    <input id={id} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, e-mail ou téléphone" autoComplete="off" />
    {search.trim().length < 2 ? <p className="purchase-client-hint">Saisissez au moins deux caractères pour rechercher un client.</p> : <>
      <div className="purchase-client-results">{data.items.map(client => <button type="button" className="purchase-client-result" key={client._id} onClick={() => { setResolved(client); onResolved?.(client); onChange(client._id); setSearch(''); }}>
        <strong>{client.name}</strong><span>{[client.email, client.phone, client.address].filter(Boolean).join(' · ')}</span><small>Réf. {client._id}</small>
      </button>)}</div><ReadPagination data={data} /></>}
    {onCreate && <button type="button" className="secondary" onClick={onCreate}>Créer une fiche client</button>}
  </div>;
}
