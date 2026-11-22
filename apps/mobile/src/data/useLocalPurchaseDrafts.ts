import { useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { getApiBaseUrl, readSession } from '../auth/session';
import { hasPurchaseContent, purchaseSnapshot, readPurchaseSnapshot, updateLocalPurchase, type LocalPurchaseDraft, type LocalPurchaseState } from './localPurchaseDrafts';
import type { PurchaseDraft } from './apiRepository';

// Serial writes prevent an older keystroke from replacing a newer save.
let writes: Promise<void> = Promise.resolve();
export function useLocalPurchaseDrafts(authenticated: boolean, freshRows: () => PurchaseDraft[], today: () => string) {
  const blank = (): LocalPurchaseDraft => ({ id: Crypto.randomUUID(), clientId: '', date: today(), step: 0, rows: freshRows(), updatedAt: Date.now() });
  const [state, setState] = useState<LocalPurchaseState>(() => { const draft = blank(); return { activeId: draft.id, drafts: [draft] }; });
  const [storage, setStorage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const revision = useRef(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setReady(false); setStorage(null); setError('');
    const empty = blank();
    setState({ activeId: empty.id, drafts: [empty] });
    if (!authenticated) return;
    void (async () => {
      try {
        const token = await readSession();
        if (!token) throw new Error('Reconnectez-vous pour retrouver vos brouillons.');
        const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const subject = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))).sub;
        if (typeof subject !== 'string' || !subject) throw new Error('Compte introuvable pour les brouillons.');
        const scope = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${getApiBaseUrl()}|${subject}`);
        const directory = `${FileSystem.documentDirectory}purchase-drafts/${scope}/`;
        await writes;
        await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
        const candidates = []; let existing = 0;
        for (const slot of [0, 1]) {
          const path = `${directory}${slot}.json`;
          if (!(await FileSystem.getInfoAsync(path)).exists) continue;
          existing++;
          try { candidates.push(readPurchaseSnapshot(await FileSystem.readAsStringAsync(path))); } catch { /* Other slot retains the previous complete save. */ }
        }
        candidates.sort((a, b) => b.revision - a.revision);
        if (existing && !candidates.length) throw new Error('Lecture des brouillons impossible. Les fichiers existants sont conservés.');
        if (current !== generation.current) return;
        const restored = candidates[0];
        const draft = blank();
        const next = restored?.state ?? { activeId: draft.id, drafts: [draft] };
        if (!next.drafts.length) { next.drafts.push(draft); next.activeId = draft.id; }
        if (!next.drafts.some(d => d.id === next.activeId)) next.activeId = next.drafts[0].id;
        revision.current = restored?.revision ?? 0;
        setState(next); setStorage(directory); setReady(true);
      } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : 'Lecture des brouillons impossible.'); }
    })();
    return () => { generation.current++; };
  }, [authenticated]);
  useEffect(() => {
    if (!ready || !storage) return;
    const current = generation.current;
    const snapshot = purchaseSnapshot(state);
    const version = ++revision.current;
    setSaving(true);
    writes = writes.catch(() => undefined).then(async () => {
      // Camera and picker files may live in a temporary cache. Keep a durable copy.
      for (const draft of snapshot.drafts) for (const row of draft.rows) {
        if (!row.photo || row.photo.uri.startsWith(storage)) continue;
        const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, row.photo.uri);
        const destination = `${storage}photo-${hash}`;
        if (!(await FileSystem.getInfoAsync(destination)).exists) await FileSystem.copyAsync({ from: row.photo.uri, to: destination });
        row.photo = { ...row.photo, uri: destination };
      }
      // Alternating snapshots leave one valid copy if the process stops during writing.
      await FileSystem.writeAsStringAsync(`${storage}${version % 2}.json`, JSON.stringify({ version: 1, revision: version, state: snapshot }));
      if (current === generation.current && version === revision.current) {
        setSaving(false); setError('');
        setState(previous => {
          let changed = false;
          const drafts = previous.drafts.map(draft => ({ ...draft, rows: draft.rows.map(row => {
            const saved = snapshot.drafts.find(d => d.id === draft.id)?.rows.find(r => r.key === row.key);
            if (!row.photo || !saved?.photo || row.photo.uri === saved.photo.uri) return row;
            changed = true; return { ...row, photo: saved.photo };
          }) }));
          return changed ? { ...previous, drafts } : previous;
        });
      }
    }).catch(reason => {
      if (current === generation.current) { setSaving(false); setError(`Brouillon non sauvegardé : ${reason instanceof Error ? reason.message : 'stockage indisponible'}`); }
    });
  }, [state, ready, storage]);
  const active = state.drafts.find(draft => draft.id === state.activeId) ?? state.drafts[0];
  function set<K extends 'clientId' | 'clientName' | 'date' | 'step' | 'rows' | 'buyerNote' | 'sellerNote'>(key: K, value: LocalPurchaseDraft[K] | ((previous: LocalPurchaseDraft[K]) => LocalPurchaseDraft[K])) {
    setState(previous => updateLocalPurchase(previous, key, value));
  }
  const start = () => { const draft = blank(); setState(previous => ({ activeId: draft.id, drafts: [...previous.drafts.filter(hasPurchaseContent), draft] })); };
  const remove = (id: string) => setState(previous => {
    const drafts = previous.drafts.filter(draft => draft.id !== id);
    if (id !== previous.activeId) return { ...previous, drafts };
    const draft = blank(); return { activeId: draft.id, drafts: [...drafts, draft] };
  });
  return { active, drafts: state.drafts.filter(hasPurchaseContent), ready, error, saving, start, remove,
    resume: (id: string) => setState(previous => ({ ...previous, activeId: id })),
    setClientId: (value: Parameters<typeof set<'clientId'>>[1]) => set('clientId', value),
    setBuyerNote: (value: string) => set('buyerNote', value),
    setSellerNote: (value: string) => set('sellerNote', value),
    setClientName: (value: string) => set('clientName', value),
    setDate: (value: Parameters<typeof set<'date'>>[1]) => set('date', value),
    setStep: (value: Parameters<typeof set<'step'>>[1]) => set('step', value),
    setRows: (value: Parameters<typeof set<'rows'>>[1]) => set('rows', value),
  };
}
