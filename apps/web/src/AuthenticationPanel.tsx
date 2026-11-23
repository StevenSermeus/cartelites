import { useState } from 'react';
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi';
import { AppearanceControl, BrandLogo, brand } from './brand';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';

type Props = {
  email: string; password: string; newPassword: string; resetToken: string | null;
  loading: boolean; signupEnabled: boolean | null; resetRequested: boolean; error: string;
  onEmail: (value: string) => void; onPassword: (value: string) => void; onNewPassword: (value: string) => void;
  onLogin: () => void; onRegister: () => void; onResetRequest: () => void; onResetComplete: () => void;
};
export function AuthenticationPanel(props: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const error = ({ INVALID_CREDENTIALS: 'L’adresse e-mail ou le mot de passe est incorrect.', EMAIL_DELIVERY_UNAVAILABLE: 'L’envoi d’e-mails n’est pas configuré pour cette boutique.', INVALID_SESSION: 'Votre session a expiré. Reconnectez-vous.' } as Record<string, string>)[props.error] ?? props.error;
  return <>
    <div className="auth-topbar"><a href="/convention" className="auth-brand"><BrandLogo decorative /><span>{brand.name}</span></a><AppearanceControl /></div>
    <div className="auth-content"><div className="auth-heading"><span className="auth-eyebrow">ESPACE DE GESTION</span><h1>{props.resetToken ? 'Un nouveau départ.' : 'Bienvenue à la boutique.'}</h1><p>{props.resetToken ? 'Choisissez un nouveau mot de passe pour votre compte.' : 'Retrouvez votre stock, vos opérations et vos documents.'}</p></div>
      <form className="auth-form" onSubmit={event => { event.preventDefault(); props.resetToken ? props.onResetComplete() : props.onLogin(); }}>
        <h2>{props.resetToken ? 'Réinitialiser le mot de passe' : 'Connexion'}</h2>
        {!props.resetToken && <label htmlFor="login-email">Adresse e-mail<Input id="login-email" type="email" autoComplete="username" required value={props.email} onChange={event => props.onEmail(event.target.value)} placeholder="vous@boutique.fr" /></label>}
        <label htmlFor="login-password">{props.resetToken ? 'Nouveau mot de passe' : 'Mot de passe'}</label><div className="auth-password"><Input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete={props.resetToken ? 'new-password' : 'current-password'} required minLength={props.resetToken ? 12 : undefined} value={props.resetToken ? props.newPassword : props.password} onChange={event => (props.resetToken ? props.onNewPassword : props.onPassword)(event.target.value)} /><Button type="button" variant="ghost" size="icon" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <FiEyeOff /> : <FiEye />}</Button></div>
        {props.resetToken && <p className="auth-hint">12 caractères minimum.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {props.resetRequested && <p className="auth-notice" role="status">Si un compte correspond à cette adresse, un lien de réinitialisation a été envoyé.</p>}
        <Button type="submit" className="auth-submit" disabled={props.loading}>{props.loading ? 'Connexion en cours…' : props.resetToken ? 'Enregistrer le mot de passe' : 'Se connecter'}<FiArrowRight aria-hidden="true" /></Button>
        {!props.resetToken && <div className="auth-secondary"><Button variant="link" type="button" disabled={props.loading} onClick={props.onResetRequest}>Mot de passe oublié ?</Button>{props.signupEnabled && <Button variant="link" type="button" disabled={props.loading} onClick={props.onRegister}>Créer un compte</Button>}</div>}
      </form><a className="auth-catalogue-link" href="/convention">Consulter le catalogue Convention <FiArrowRight aria-hidden="true" /></a></div>
    <footer className="auth-footer"><span>{brand.name}</span><nav aria-label="Informations légales"><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Confidentialité</a><a href="/cookies">Cookies</a></nav></footer>
  </>;
}
