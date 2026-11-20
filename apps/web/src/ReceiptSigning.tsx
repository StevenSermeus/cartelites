import { useEffect, useRef, useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { validSignature, type Signature } from '../../../packages/domain/src/signature';
import type { SignatoryProfile } from './receiptPdf';

type Request = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Kind = 'purchase' | 'consignment';
type Draft = {
  id: string;
  consent: string;
  pdfBase64: string;
  snapshot: { reference: string; client: { name: string; email?: string } };
};
type Signed = {
  id: string;
  signedAt?: number;
  emailStatus: string;
  emailError?: string;
  recipient?: string;
};
export const emailLabel = (status: string) =>
  ({
    accepted: 'Accepté par Brevo — réception non confirmée',
    pending: 'Pas encore envoyé',
    sending: 'Envoi en cours',
    not_configured: 'Brevo n’est pas configuré sur cette API',
    no_email: 'Adresse e-mail du client manquante',
    failed: 'E-mail non envoyé',
    unknown: 'Résultat de l’envoi incertain — vérifier Brevo avant de renvoyer',
  })[status] ?? status;
export const deliveryErrorLabel = (code?: string) =>
  ({
    account_inactive:
      'Le compte transactionnel Brevo n’est pas activé ou est suspendu. Demandez son activation à Brevo (contact@brevo.com).',
    unauthorized_ip: 'L’adresse IP du serveur doit être autorisée dans Brevo.',
    invalid_key: 'La clé API Brevo est refusée. Vérifiez la configuration du serveur.',
    permission_denied: 'La clé Brevo doit autoriser les e-mails transactionnels (Tous).',
    sender_invalid: 'L’expéditeur est refusé par Brevo. Vérifiez son adresse et son domaine.',
    quota_exceeded: 'Le quota Brevo est atteint. Réessayez lorsque des crédits seront disponibles.',
    recipient_invalid: 'Brevo refuse l’adresse du destinataire.',
    archive_unavailable:
      'Le PDF archivé est temporairement inaccessible. Aucun e-mail n’a pu être préparé.',
    provider_error: 'Brevo a refusé l’envoi. Consultez ses journaux avant de réessayer.',
    network_error: 'Le serveur n’a pas reçu de confirmation de Brevo.',
  })[code ?? ''] ?? '';
function pdfUrl(base64: string) {
  return URL.createObjectURL(
    new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }),
  );
}
export function parseSignaturePath(path: string): { kind: Kind; targetId: string } | null {
  const match = /^\/admin\/signature\/(purchase|consignment)\/([a-zA-Z0-9_-]+)\/?$/.exec(path);
  return match ? { kind: match[1] as Kind, targetId: match[2] } : null;
}
export function ReceiptSigning({
  kind,
  targetId,
}: {
  kind: Kind;
  targetId: string;
  allowSigning?: boolean;
  request: Request;
}) {
  return (
    <a
      className="receipt-signing-link"
      href={`/admin/signature/${kind}/${encodeURIComponent(targetId)}`}
    >
      Signature & exemplaires →
    </a>
  );
}
export function ReceiptSigningPage({
  kind,
  targetId,
  request,
}: {
  kind: Kind;
  targetId: string;
  request: Request;
}) {
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const [error, setError] = useState(''),
    [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null),
    [url, setUrl] = useState('');
  const [company, setCompany] = useState<Signature>([]),
    [client, setClient] = useState<Signature>([]);
  const [profile, setProfile] = useState<SignatoryProfile | null>(null),
    [save, setSave] = useState(false);
  const [read, setRead] = useState(false),
    [accepted, setAccepted] = useState(false),
    [companyAccepted, setCompanyAccepted] = useState(false);
  const [signed, setSigned] = useState<Signed[]>([]),
    [completed, setCompleted] = useState<Signed | null>(null);
  const [delivery, setDelivery] = useState<{ configured: boolean; fromEmail: string } | null>(null);
  const back = kind === 'purchase' ? '/admin/purchases/history' : '/admin/consignments';
  const refresh = async () =>
    setSigned(
      await request<Signed[]>(`/receipts?kind=${kind}&targetId=${encodeURIComponent(targetId)}`),
    );
  useEffect(() => {
    void run(async () => {
      await refresh();
      setDelivery(await request('/receipts/delivery-config'));
    });
  }, [kind, targetId]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (draft) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [draft]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepare() {
    const p = await request<SignatoryProfile>('/auth/profile');
    setProfile(p);
    if (!p.firstName || !p.lastName || !p.capacity)
      throw new Error(
        'Complétez votre nom et votre qualité dans les paramètres du compte avant de signer.',
      );
    const d = await request<Draft>('/receipts/prepare', {
      method: 'POST',
      body: JSON.stringify({ kind, targetId }),
    });
    setDraft(d);
    setUrl(pdfUrl(d.pdfBase64));
    setCompany(p.signature ?? []);
    setClient([]);
    setRead(false);
    setAccepted(false);
    setCompanyAccepted(false);
    setSave(false);
    setStep(0);
    setCompleted(null);
  }
  async function sign() {
    if (!draft || !read || !accepted || !companyAccepted) return;
    if (save && profile)
      await request('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ ...profile, signature: company }),
      });
    const result = await request<Signed>(`/receipts/${draft.id}/sign`, {
      method: 'POST',
      body: JSON.stringify({ company, client, accepted: true }),
    });
    setCompleted({ ...result, recipient: draft.snapshot.client.email });
    setDraft(null);
    setUrl('');
    setClient([]);
    setCompany([]);
    setStep(3);
    await refresh();
  }
  async function download(id: string) {
    const pdf = await request<{ pdfBase64: string; filename: string }>(`/receipts/${id}/pdf`);
    const link = document.createElement('a'),
      href = pdfUrl(pdf.pdfBase64);
    link.href = href;
    link.download = pdf.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }
  async function resend(row: Signed) {
    if (
      !window.confirm(
        `Envoyer cet exemplaire à ${row.recipient} ? Si le résultat précédent est incertain, vérifiez Brevo pour éviter un doublon.`,
      )
    )
      return;
    await run(async () => {
      const result = await request<{ emailStatus: string; emailError?: string }>(
        `/receipts/${row.id}/email`,
        { method: 'POST' },
      );
      await refresh();
      if (completed?.id === row.id) setCompleted({ ...completed, ...result });
    });
  }
  const cancel = () => {
    if (window.confirm('Abandonner les signatures en cours ?')) {
      setDraft(null);
      setUrl('');
      setCompany([]);
      setClient([]);
      setStep(0);
    }
  };
  return (
    <main className="signing-page">
      <header className="signing-header">
        <div>
          <a href={back}>← Retour au dossier</a>
          <p className="signing-eyebrow">
            {kind === 'purchase' ? 'BORDEREAU DE RACHAT' : 'BON DE DÉPÔT-VENTE'}
          </p>
          <h1>Signature du document</h1>
        </div>
        <span className="signing-provider">
          {delivery
            ? delivery.configured
              ? `Envoi par Brevo · ${delivery.fromEmail}`
              : 'Envoi désactivé : Brevo non configuré'
            : 'Vérification de l’envoi…'}
        </span>
      </header>
      <ol className="signing-steps" aria-label="Étapes de signature">
        {['Lire le document', 'Signature boutique', 'Signature client', 'Exemplaire signé'].map(
          (name, index) => (
            <li key={name} aria-current={step === index ? 'step' : undefined}>
              <span>{index + 1}</span>
              {name}
            </li>
          ),
        )}
      </ol>
      {error && (
        <p className="signing-alert" role="alert">
          {error}
          <br />
          Si le document a changé ou expiré, annulez et préparez une nouvelle version.
        </p>
      )}
      {delivery && !delivery.configured && (
        <p className="signing-alert">
          La signature pourra être conservée, mais aucun e-mail ne partira tant que Brevo n’est pas
          configuré. Vous pourrez télécharger l’original.
        </p>
      )}
      {!draft && !completed && (
        <section className="signing-welcome">
          <h2>Prenez le temps de vérifier, puis de signer.</h2>
          <p>
            Le document complet, votre signature et celle du client : une étape à la fois, dans cet
            espace dédié.
          </p>
          <button disabled={busy} onClick={() => void run(prepare)}>
            Préparer le document à signer
          </button>
        </section>
      )}
      {draft && (
        <section className="signing-workspace">
          <div className="signing-document-summary">
            <strong>{draft.snapshot.reference}</strong>
            <span>{draft.snapshot.client.name}</span>
            <span>Copie à : {draft.snapshot.client.email || 'aucune adresse renseignée'}</span>
          </div>
          {step === 0 && (
            <>
              <h2>1. Vérifier le document</h2>
              <p>
                Contrôlez les articles, les montants, les conditions et l’adresse du destinataire
                avant de poursuivre.
              </p>
              <a href={url} target="_blank" rel="noreferrer">
                Ouvrir le PDF dans un autre onglet
              </a>
              <iframe className="signing-pdf" title="Document complet à vérifier" src={url} />
              <label className="signing-consent">
                <input
                  type="checkbox"
                  checked={read}
                  onChange={(e) => setRead(e.target.checked)}
                  disabled={busy}
                />
                Nous avons lu le document complet et vérifié les informations.
              </label>
              <div className="signing-actions">
                <button disabled={busy || !read} onClick={() => setStep(1)}>
                  Continuer vers ma signature →
                </button>
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <h2>2. La signature de la boutique</h2>
              <p>
                {profile?.firstName} {profile?.lastName} · {profile?.capacity}
              </p>
              <p>
                Votre signature enregistrée est proposée ci-dessous. Vous pouvez la conserver ou la
                redessiner.
              </p>
              <SignaturePad
                label="Votre signature"
                value={company}
                onChange={setCompany}
                disabled={busy}
              />
              <label className="signing-consent">
                <input
                  type="checkbox"
                  checked={save}
                  onChange={(e) => setSave(e.target.checked)}
                  disabled={busy}
                />
                Enregistrer cette signature pour les prochains documents
              </label>
              <label className="signing-consent">
                <input
                  type="checkbox"
                  checked={companyAccepted}
                  onChange={(e) => setCompanyAccepted(e.target.checked)}
                  disabled={busy}
                />
                Je confirme signer ce document pour la boutique.
              </label>
              <div className="signing-actions">
                <button className="secondary" disabled={busy} onClick={() => setStep(0)}>
                  Retour au document
                </button>
                <button
                  disabled={busy || !companyAccepted || !validSignature(company)}
                  onClick={() => setStep(2)}
                >
                  Faire signer le client →
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2>3. Au client de signer</h2>
              <p>
                {draft.snapshot.client.name}, signez dans le cadre avec le stylet, la souris ou
                votre doigt.
              </p>
              <SignaturePad
                label="Signature du client"
                value={client}
                onChange={setClient}
                disabled={busy}
              />
              <label className="signing-consent">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  disabled={busy}
                />
                {draft.consent}
              </label>
              <p>
                Un original sera conservé, puis son envoi à{' '}
                <strong>
                  {draft.snapshot.client.email || 'aucune adresse — remise manuelle nécessaire'}
                </strong>{' '}
                sera tenté. La validation du stock reste distincte.
              </p>
              <div className="signing-actions">
                <button className="secondary" disabled={busy} onClick={() => setStep(1)}>
                  Retour à ma signature
                </button>
                <button
                  disabled={
                    busy || !accepted || !validSignature(client) || !validSignature(company)
                  }
                  onClick={() => void run(sign)}
                >
                  {busy ? 'Archivage et envoi…' : 'Signer et envoyer l’exemplaire'}
                </button>
              </div>
            </>
          )}
          <button className="secondary signing-cancel" disabled={busy} onClick={cancel}>
            Annuler la signature en cours
          </button>
        </section>
      )}
      {completed && (
        <section className="signing-complete">
          <h2>Le document signé est conservé.</h2>
          <p>Les deux signatures sont intégrées à l’original PDF.</p>
          <div
            className={completed.emailStatus === 'accepted' ? 'signing-delivery' : 'signing-alert'}
            role="status"
          >
            <strong>{emailLabel(completed.emailStatus)}</strong>
            <p>{deliveryErrorLabel(completed.emailError)}</p>
            <p>Destinataire : {completed.recipient || 'non renseigné'}</p>
          </div>
          <button disabled={busy} onClick={() => void run(() => download(completed.id))}>
            Télécharger le PDF signé
          </button>
          <a href={back}>Revenir au dossier</a>
        </section>
      )}
      {!draft && (
        <section className="signing-archives">
          <h2>Exemplaires déjà signés</h2>
          {!signed.length && <p>Aucun exemplaire signé pour ce dossier.</p>}
          {signed.map((row) => (
            <article className="signing-archive" key={row.id}>
              <div>
                <h3>{new Date(row.signedAt!).toLocaleString('fr-BE')}</h3>
                <p>{row.recipient || 'Adresse e-mail manquante'}</p>
                <strong>{emailLabel(row.emailStatus)}</strong>
                {row.emailError && <p role="status">{deliveryErrorLabel(row.emailError)}</p>}
              </div>
              <div className="signing-archive-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(() => download(row.id))}
                >
                  Télécharger l’original
                </button>
                <button disabled={busy || !row.recipient} onClick={() => void resend(row)}>
                  Envoyer / renvoyer
                </button>
              </div>
            </article>
          ))}
          {completed && (
            <button className="secondary" disabled={busy} onClick={() => void run(prepare)}>
              Préparer une nouvelle version
            </button>
          )}
        </section>
      )}
    </main>
  );
}
