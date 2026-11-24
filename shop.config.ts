import { cartelitesThemes } from './branding/theme';
import { legal } from './branding/legal';
import { resolveShopLinks } from './packages/domain/src/shopLinks';
// Deployment configuration. Never put credentials in this file.
export const shopConfig = {
  version: 1,
  identity: { name: 'Cartélites' }, legal,
  currency: 'EUR', timezone: 'Europe/Brussels', registrationPolicy: 'closed',
  branding: { name: 'Cartélites', tagline: 'Votre univers de cartes, au même endroit.', description: 'Découvrez les cartes disponibles chez Cartélites.', catalogueLabel: 'Le classeur Cartélites', logo: '/branding/logo.png', logoDark: '/branding/logo.png',
    socialLinks: resolveShopLinks([
      { label: 'Instagram', url: 'https://www.instagram.com/cartelites/', icon: 'instagram' },
      { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61596948501271', icon: 'facebook' },
    ]),
    theme: { appearance: 'system' as const, ...cartelitesThemes } },
};
// Deliberate allowlist: no legal/private configuration is sent to clients.
export const publicShopConfig = { version: shopConfig.version, currency: shopConfig.currency, timezone: shopConfig.timezone, branding: shopConfig.branding };
