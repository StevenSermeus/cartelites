import { resolveTheme } from '../packages/domain/src/shopTheme';

// Instance palette: neutral surfaces keep the gold focused on actions.
export const cartelitesThemes = {
  light: resolveTheme({
    primary: '#d9b66f', primaryForeground: '#24272b', primaryHover: '#cba35a',
    secondary: '#f2eee5', secondaryForeground: '#514536',
    accent: '#80602c', accentForeground: '#ffffff', actionTint: '#80602c',
    selected: '#f3e8d2', selectedForeground: '#62491f',
    background: '#f6f5f2', foreground: '#24272b',
    card: '#ffffff', cardForeground: '#24272b',
    popover: '#ffffff', popoverForeground: '#24272b',
    muted: '#eeede9', mutedForeground: '#626466',
    border: '#deddd7', input: '#83827c', ring: '#80602c',
  }, 'light'),
  dark: resolveTheme({
    primary: '#d9b66f', primaryForeground: '#202225', primaryHover: '#e6c787',
    secondary: '#292b2e', secondaryForeground: '#e4e2dc',
    accent: '#d9b66f', accentForeground: '#202225', actionTint: '#d9b66f',
    selected: '#393326', selectedForeground: '#e6c787',
    background: '#18191b', foreground: '#f1f0ec',
    card: '#222427', cardForeground: '#f1f0ec',
    popover: '#292b2e', popoverForeground: '#f1f0ec',
    muted: '#2d2f32', mutedForeground: '#b8b8b3',
    border: '#414347', input: '#85878b', ring: '#d9b66f',
  }, 'dark'),
};
