import { SignaturePad } from './SignaturePad';
import { useEffect, useState } from 'react';
import type { SignatoryProfile } from './receiptPdf';

type Props = {
  loadProfile: () => Promise<SignatoryProfile>;
  saveProfile: (profile: SignatoryProfile) => Promise<SignatoryProfile>;
  signupEnabled: boolean;
  loading: boolean;
  onToggle: (enabled: boolean) => void;
};

export default function SettingsPage({ signupEnabled, loading, onToggle, loadProfile, saveProfile }: Props) {
  const [profile, setProfile] = useState<SignatoryProfile>({ firstName: '', lastName: '', capacity: '' });
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [initialLoad] = useState(() => loadProfile);
  useEffect(() => {
    let active = true;
    void initialLoad().then((value) => { if (active) setProfile(value); })
      .catch(() => { if (active) setProfileError('Chargement impossible. Rouvrez les paramètres pour réessayer.'); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [initialLoad]);
  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      setProfile(await saveProfile(profile));
      setMessage('Votre nom et votre qualité ont été enregistrés pour les prochains bordereaux.');
    } catch {
      setMessage('Enregistrement impossible. Vérifiez les champs et réessayez.');
    } finally { setSaving(false); }
  }
  return (
    <section className="panel settings-page">
      <small>CONFIGURATION DU COMPTE</small>
      <h2>Paramètres</h2>
      <form onSubmit={(event) => void submitProfile(event)} className="signatory-settings">
        <h3>Votre signature sur les bordereaux</h3>
        <p>Ces informations sont propres à votre compte. Elles identifient la personne qui signe pour la société acheteuse.</p>
        {profileError && <p role="alert">{profileError}</p>}
        <fieldset disabled={profileLoading || saving || Boolean(profileError)}>
          <legend>Signataire de la société</legend>
          <label>Prénom<input autoComplete="given-name" required maxLength={100} value={profile.firstName} onChange={(event) => setProfile({ ...profile, firstName: event.target.value })} /></label>
          <label>Nom<input autoComplete="family-name" required maxLength={100} value={profile.lastName} onChange={(event) => setProfile({ ...profile, lastName: event.target.value })} /></label>
          <label>Qualité<input required maxLength={100} placeholder="Administrateur, représentant mandaté…" value={profile.capacity} onChange={(event) => setProfile({ ...profile, capacity: event.target.value })} /></label>
          <SignaturePad label="Votre signature réutilisable (facultative)" value={profile.signature ?? []} onChange={signature => setProfile({ ...profile, signature: signature.length ? signature : null })} disabled={profileLoading || saving || Boolean(profileError)} />
          <p>Elle sera proposée sur iOS et PC. Vous confirmerez son utilisation sur chaque document. Effacez puis enregistrez pour la supprimer.</p>
          <button type="submit">{saving ? 'Enregistrement…' : 'Enregistrer mon signataire'}</button>
        </fieldset>
        {message && <p role="status">{message}</p>}
      </form>
      <div className="settings-option">
        <div>
          <h3>Création de compte</h3>
          <p>
            {signupEnabled
              ? 'Les nouvelles personnes peuvent créer un compte depuis la page de connexion.'
              : 'Les nouvelles inscriptions sont bloquées. Votre compte et votre connexion restent actifs.'}
          </p>
        </div>
        <label className="settings-switch">
          <span>Autoriser les inscriptions</span>
          <input
            type="checkbox"
            checked={signupEnabled}
            disabled={loading}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>
      </div>
      <p className="settings-note">
        Cette préférence est enregistrée côté serveur et s’applique aussi aux tentatives d’inscription directes.
      </p>
    </section>
  );
}
