export const defaultThemes = { light: {
        primary: '#efbd53', primaryForeground: '#2c211b',
        primaryHover: '#e3ac3f',
        secondary: '#fbf0d9', secondaryForeground: '#795018',
        accent: '#795018', accentForeground: '#ffffff',
        actionTint: '#795018', // Links, native back buttons, active tabs.
        selected: '#fbf0d9', selectedForeground: '#583710',
        background: '#f7f3eb', foreground: '#2c211b',
        card: '#fffdf8', cardForeground: '#2c211b',
        popover: '#fffdf8', popoverForeground: '#2c211b',
        muted: '#f1e9dc', mutedForeground: '#706456',
        border: '#e4d9c7', input: '#75695c', ring: '#795018',
        destructive: '#a33d36', destructiveForeground: '#ffffff',
        success: '#286347', successForeground: '#ffffff',
        warning: '#805600', warningForeground: '#ffffff',
}, dark: {
        primary: '#efbd53', primaryForeground: '#2c211b',
        primaryHover: '#f6ca6d',
        secondary: '#33291e', secondaryForeground: '#fbf0d9',
        accent: '#efbd53', accentForeground: '#2c211b',
        actionTint: '#efbd53',
        selected: '#40321e', selectedForeground: '#f6ca6d',
        background: '#181410', foreground: '#fff3df',
        card: '#231d17', cardForeground: '#fff3df',
        popover: '#2b231c', popoverForeground: '#fff3df',
        muted: '#332b23', mutedForeground: '#c8b9a5',
        border: '#504335', input: '#a7947c', ring: '#efbd53',
        destructive: '#f28b82', destructiveForeground: '#281210',
        success: '#81c8a3', successForeground: '#10291d',
        warning: '#efbd53', warningForeground: '#2c211b',
} };
export type ThemeTokens = typeof defaultThemes.light;
export type Appearance = 'light' | 'dark';
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function resolveTheme(overrides: Partial<ThemeTokens> = {}, appearance: Appearance = 'light'): ThemeTokens {
  const theme = {...defaultThemes[appearance], ...overrides};
  for (const [key,value] of Object.entries(theme)) if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid theme color: ${key}`);
  const pairs: [keyof ThemeTokens,keyof ThemeTokens,number][] = [
    ['primary','primaryForeground',4.5],['primaryHover','primaryForeground',4.5],['secondary','secondaryForeground',4.5],
    ['accent','accentForeground',4.5],['selected','selectedForeground',4.5],['background','foreground',4.5],
    ['card','cardForeground',4.5],['popover','popoverForeground',4.5],['muted','mutedForeground',4.5],
    ['destructive','destructiveForeground',4.5],['success','successForeground',4.5],['warning','warningForeground',4.5],
    ['actionTint','background',4.5],['actionTint','card',4.5],['ring','background',3],['input','card',3]];
  for(const [a,b,min] of pairs) if(contrastRatio(theme[a],theme[b])<min) throw new Error(`Insufficient theme contrast: ${a}/${b}`);
  return theme;
}
