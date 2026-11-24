import { cartelitesThemes } from './theme';

// Identité de cette instance web. Le mobile commun ne dépend pas de ce fichier.
const theme = cartelitesThemes.light;
export const brand = {
  name: 'Cartélites',
  tagline: 'Votre univers de cartes, au même endroit.',
  catalogueLabel: 'Le classeur Cartélites',
  description: 'Découvrez les cartes disponibles chez Cartélites.',
  colors: {
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
  },
};
