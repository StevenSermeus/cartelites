import './acquisition-workspace.css';
import { SignaturePad } from './SignaturePad';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { useEffect, useState } from 'react';
import type { SignatoryProfile } from './receiptPdf';
type Props = {loadProfile: () => Promise<SignatoryProfile>; saveProfile: (profile: SignatoryProfile) => Promise<SignatoryProfile>; signupEnabled: boolean; loading: boolean; onToggle: (enabled: boolean) => void;};
export default function SettingsPage({signupEnabled, loading, onToggle, loadProfile, saveProfile}: Props) {
  const [profile, setProfile] = useState<SignatoryProfile>({firstName: '', lastName: '', capacity: ''});
  const [profileLoading, setProfileLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState(''), [profileError, setProfileError] = useState('');
  const [initialLoad] = useState(() => loadProfile), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setProfileLoading(true); setProfileError('');
    void initialLoad().then(value => {if (active) setProfile(value);}).catch(() => {if (active) setProfileError('Le profil n’a pas pu être chargé. Réessayez.');}).finally(() => {if (active) setProfileLoading(false);});
    return () => {active = false;};
  }, [initialLoad, retry]);
  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setMessage('');
    try { setProfile(await saveProfile(profile)); setMessage('Votre nom et votre qualité ont été enregistrés pour les prochains bordereaux.'); }
    catch { setMessage('Enregistrement impossible. Vérifiez les champs et réessayez.'); }
    finally { setSaving(false); }
  }
  return <section className="acquisition-settings account-settings">
    <header className="acquisition-section-header"><div><span className="acquisition-eyebrow">VOTRE COMPTE</span><h2>Profil du signataire</h2><p>Les informations utilisées lorsque vous signez pour la société acheteuse.</p></div><span className="acquisition-counter">Personnel</span></header>
    <form onSubmit={event => void submitProfile(event)} className="signatory-settings">
      {profileLoading && <p role="status" className="acquisition-muted">Chargement de votre profil…</p>}
      {profileError && <div role="alert" className="acquisition-error"><p>{profileError}</p><Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Réessayer</Button></div>}
      <fieldset disabled={profileLoading || saving || Boolean(profileError)}>
        <legend className="sr-only">Signataire de la société</legend>
        <div className="settings-form-section"><div className="settings-section-copy"><h3>Identité</h3><p>Votre nom et votre qualité sont propres à votre compte.</p></div><div className="settings-profile-fields">
          <label>Prénom<Input autoComplete="given-name" required maxLength={100} value={profile.firstName} onChange={event => setProfile({...profile, firstName: event.target.value})} /></label>
          <label>Nom<Input autoComplete="family-name" required maxLength={100} value={profile.lastName} onChange={event => setProfile({...profile, lastName: event.target.value})} /></label>
          <label className="settings-capacity">Qualité<Input required maxLength={100} placeholder="Administrateur, représentant mandaté…" value={profile.capacity} onChange={event => setProfile({...profile, capacity: event.target.value})} /></label>
        </div></div>
        <div className="settings-form-section"><div className="settings-section-copy"><h3>Signature réutilisable</h3><p>Facultative. Elle sera proposée sur mobile et sur le web ; vous confirmerez son utilisation pour chaque document.</p></div><div className="settings-signature-field"><SignaturePad label="Votre signature" value={profile.signature ?? []} onChange={signature => setProfile({...profile, signature: signature.length ? signature : null})} disabled={profileLoading || saving || Boolean(profileError)} /><p className="acquisition-field-help">Pour supprimer la signature enregistrée, effacez-la puis enregistrez le profil.</p></div></div>
        <div className="settings-form-footer"><span>Ces changements s’appliquent aux prochains bordereaux.</span><Button type="submit">{saving ? 'Enregistrement…' : 'Enregistrer le profil'}</Button></div>
      </fieldset>
      {message && <p role="status" className="acquisition-notice">{message}</p>}
    </form>
    <div className="settings-access-section"><div className="settings-section-copy"><h3>Création de compte</h3><p>{signupEnabled ? 'Les nouvelles personnes peuvent créer un compte depuis la page de connexion.' : 'Les nouvelles inscriptions sont bloquées. Les comptes existants restent actifs.'}</p></div><div className="settings-access-control"><span>{signupEnabled?'Inscriptions ouvertes':'Inscriptions fermées'}<small>Cette politique est définie dans la configuration de la boutique. Contactez la personne qui gère son déploiement pour la modifier.</small></span></div></div>
  </section>;
}
