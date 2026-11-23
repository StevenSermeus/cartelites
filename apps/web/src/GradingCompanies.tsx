import './acquisition-workspace.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
export type Request = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Company = { _id: string; name: string; revision: number; archivedAt?: number };
export function useGradingCompanies(request: Request, enabled = true) {
  const [companies, setCompanies] = useState<Company[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(enabled);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!enabled) { setCompanies([]); setError(''); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await request<Company[]>('/grading-companies');
      if (current !== generation.current) return;
      setCompanies(rows); setError('');
    } catch (reason) {
      if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally { if (current === generation.current) setLoading(false); }
  }, [request, enabled]);
  useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
  return { companies: enabled ? companies : [], error: enabled ? error : '', loading: enabled && loading, reload };
}
export function GradingCompanyPicker({request, value, onChange, onBusyChange}: {request: Request; value?: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void}) {
  const {companies, error, loading, reload} = useGradingCompanies(request);
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const lock = useRef(false);
  const latest = useRef({onChange, onBusyChange});
  latest.current = {onChange, onBusyChange};
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (lock.current) latest.current.onBusyChange?.(false); }; }, []);
  let createOption = '__new_grading_company__';
  while (createOption === value || companies.some(company => company.name === createOption)) createOption += '_';
  async function create() {
    if (lock.current || !name.trim()) return;
    lock.current = true; setBusy(true); setFailure(''); latest.current.onBusyChange?.(true);
    try {
      await request('/grading-companies', {method: 'POST', body: JSON.stringify({name: name.trim()})});
      await reload(); if (!alive.current) return; latest.current.onChange(name.trim()); setCreating(false); setName('');
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Enregistrement impossible.'); }
    finally { lock.current = false; if (alive.current) { setBusy(false); latest.current.onBusyChange?.(false); } }
  }
  return <div className="grading-picker">
    <label>Société de gradation<select value={value ?? ''} disabled={busy} onChange={event => {
      if (event.target.value === createOption) { setCreating(true); setFailure(''); }
      else { onChange(event.target.value); setCreating(false); }
    }}>
      <option value="">Non gradée</option>
      {value && !companies.some(company => company.name === value && !company.archivedAt) && <option value={value}>{value}</option>}
      {companies.filter(company => !company.archivedAt).map(company => <option key={company._id} value={company.name}>{company.name}</option>)}
      <option value={createOption}>Autre société…</option>
    </select></label>
    <Button type="button" variant="link" size="sm" disabled={busy} aria-expanded={creating} onClick={() => setCreating(!creating)}>{creating ? 'Fermer l’ajout' : '+ Ajouter une société'}</Button>
    {loading && <small role="status">Chargement des sociétés…</small>}
    {creating && <div className="grading-create-inline"><Input autoFocus aria-label="Nom de la société" placeholder="Nom de l’autre société" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)} onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); void create();}}} /><Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? 'Ajout…' : 'Ajouter et sélectionner'}</Button></div>}
    {(error || failure) && <p role="alert" className="acquisition-error">{failure || error}</p>}
    {error && <Button type="button" variant="link" size="sm" onClick={() => void reload()}>Réessayer le chargement</Button>}
  </div>;
}
export function GradingCompanies({request}: {request: Request}) {
  const {companies, error, loading, reload} = useGradingCompanies(request);
  const [failure, setFailure] = useState(''), [notice, setNotice] = useState(''), [name, setName] = useState('');
  const [editing, setEditing] = useState<Company | null>(null), [editedName, setEditedName] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function save(company?: Company) {
    const nextName = (company ? editedName : name).trim();
    if (lock.current || !nextName) return;
    lock.current = true; setBusy(true); setFailure(''); setNotice('');
    try {
      await request(company ? `/grading-companies/${encodeURIComponent(company._id)}` : '/grading-companies', {method: company ? 'PATCH' : 'POST', body: JSON.stringify({name: nextName, ...(company ? {expectedRevision: company.revision} : {})})});
      await reload(); setEditing(null); if (!company) setName(''); setNotice(company ? 'Société mise à jour.' : 'Société ajoutée.');
    } catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Modification impossible.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="acquisition-settings grading-management">
    <header className="acquisition-section-header"><div><span className="acquisition-eyebrow">RÉFÉRENTIEL</span><h2>Sociétés de gradation</h2><p>Un répertoire commun aux rachats, au stock et aux dépôts.</p></div><span className="acquisition-counter">{companies.filter(company => !company.archivedAt).length} actives</span></header>
    <form className="grading-create-form" onSubmit={event => {event.preventDefault(); void save();}}><label>Ajouter une société<Input value={name} onChange={event => setName(event.target.value)} placeholder="Nom de la société" maxLength={100} required disabled={busy} /></label><Button type="submit" disabled={busy || !name.trim()}>Ajouter</Button></form>
    {(error || failure) && <div role="alert" className="acquisition-error"><p>{failure || error}</p>{error && <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>Réessayer</Button>}</div>}
    {notice && <p role="status" className="acquisition-notice">{notice}</p>}
    {loading && !companies.length ? <p role="status" className="acquisition-muted">Chargement du répertoire…</p> : !companies.length && !error ? <div className="acquisition-empty"><strong>Aucune société de gradation</strong><p>Ajoutez votre première société pour la sélectionner dans les fiches.</p></div> : <div className="grading-company-list">
      {companies.map(company => <div className="grading-record" key={company._id}>
        {editing?._id === company._id ? <form onSubmit={event => {event.preventDefault(); void save(company);}} className="grading-edit-form"><label className="sr-only" htmlFor={`grading-${company._id}`}>Nouveau nom de {company.name}</label><Input id={`grading-${company._id}`} autoFocus maxLength={100} required value={editedName} disabled={busy} onChange={event => setEditedName(event.target.value)} /><Button type="submit" size="sm" disabled={busy || !editedName.trim()}>Enregistrer</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(null)}>Annuler</Button></form> : <><div><strong>{company.name}</strong><span>{company.archivedAt ? 'Archivée' : 'Disponible dans les fiches'}</span></div><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => {setEditing(company); setEditedName(company.name); setFailure('');}}>Renommer</Button></>}
      </div>)}
    </div>}
  </section>;
}
