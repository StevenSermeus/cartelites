type Props = {
  signupEnabled: boolean;
  loading: boolean;
  onToggle: (enabled: boolean) => void;
};

export default function SettingsPage({ signupEnabled, loading, onToggle }: Props) {
  return (
    <section className="panel settings-page">
      <small>CONFIGURATION DU COMPTE</small>
      <h2>Paramètres</h2>
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
