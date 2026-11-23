import { API } from './realtime';
import { useEffect, useState } from 'react';
import fallbackLogo from '../../../branding/logo.png';
import { publicShopConfig } from '../../../shop.config';
import { resolveTheme } from '../../../packages/domain/src/shopTheme';
export const brand = publicShopConfig.branding;
const media = window.matchMedia('(prefers-color-scheme: dark)');
function appearance() {
  let preference: string | null = null;
  try {
    preference = localStorage.getItem('shop-appearance');
  } catch {
    /* Optional preference. */
  }
  const configured = publicShopConfig.branding.theme.appearance as string;
  return preference === 'dark' || preference === 'light'
    ? preference
    : configured === 'dark' || configured === 'light'
      ? configured
      : media.matches
        ? 'dark'
        : 'light';
}
function applyTheme() {
  const mode = appearance();
  const theme = resolveTheme(publicShopConfig.branding.theme[mode], mode);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(theme))
    root.style.setProperty(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  const aliases = {
    primary: theme.primary,
    primaryHover: theme.primaryHover,
    onPrimary: theme.primaryForeground,
    accent: theme.accent,
    soft: theme.secondary,
    canvas: theme.background,
    surface: theme.card,
    ink: theme.foreground,
    muted: theme.mutedForeground,
    border: theme.border,
    success: theme.success,
    danger: theme.destructive,
    warning: theme.warning,
  };
  for (const [key, value] of Object.entries(aliases))
    root.style.setProperty(`--brand-${key}`, value);
  root.dataset.appearance = mode;
  window.dispatchEvent(new Event('shop-theme-change'));
  root.style.colorScheme = mode;
  document.title = brand.name;
}
applyTheme();
media.addEventListener('change', applyTheme);
export function AppearanceControl() {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem('shop-appearance') ?? 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(applyTheme, [value]);
  return (
    <label className="appearance-control">
      Apparence
      <select
        aria-label="Apparence"
        value={value}
        onChange={(e) => {
          try {
            localStorage.setItem('shop-appearance', e.target.value);
          } catch {}
          setValue(e.target.value);
        }}
      >
        <option value="system">Système</option>
        <option value="light">Clair</option>
        <option value="dark">Sombre</option>
      </select>
    </label>
  );
}
export function BrandLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  const [mode, setMode] = useState(appearance);
  useEffect(() => {
    const update = () => setMode(appearance());
    window.addEventListener('shop-theme-change', update);
    return () => window.removeEventListener('shop-theme-change', update);
  }, []);
  const configuredLogo = mode === 'dark' ? brand.logoDark : brand.logo;
  const logo =
    configuredLogo === '/branding/logo.png'
      ? fallbackLogo
      : configuredLogo.startsWith('/branding/')
        ? new URL(configuredLogo, new URL(API, window.location.origin).origin).href
        : configuredLogo;
  return <img className={className} src={logo} alt={decorative ? '' : `Logo ${brand.name}`} />;
}
export function BrandIdentity({ catalogue = false }: { catalogue?: boolean }) {
  return (
    <div className="brand-identity">
      <BrandLogo className="brand-logo" />
      <div>
        <small>{catalogue ? brand.catalogueLabel : 'Votre espace de gestion'}</small>
        <h1>{catalogue ? 'Cartes disponibles' : brand.name}</h1>
        <p>{catalogue ? brand.description : brand.tagline}</p>
      </div>
    </div>
  );
}
