import { setShopFormatting } from './shopFormatting';
import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, Pressable, Text, View, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { resolveTheme, type ThemeTokens } from '../../../../packages/domain/src/shopTheme';
import { instanceFetch, getApiBaseUrl } from '../auth/session';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeColors = {
  background: string; surface: string; raised: string; text: string; secondary: string;
  placeholder: string; border: string; accent: string; onAccent: string; accentSoft: string;
  danger: string; dangerSoft: string; success: string; successSoft: string; warning: string;
  warningSoft: string; info: string; infoSoft: string; shadow: string; overlay: string; signature: string;
  primary: string; onPrimary: string; secondaryFill: string; onSecondary: string;
};
function mapTheme(t: ThemeTokens): ThemeColors {
  return {background: t.background, surface: t.card, raised: t.muted, text: t.foreground,
    secondary: t.mutedForeground, placeholder: t.mutedForeground, border: t.border,
    accent: t.accent, onAccent: t.accentForeground, accentSoft: t.selected,
    danger: t.destructive, dangerSoft: t.muted, success: t.success, successSoft: t.muted,
    warning: t.warning, warningSoft: t.muted, info: t.actionTint, infoSoft: t.selected,
    shadow: '#000000', overlay: 'rgba(0,0,0,0.55)', signature: t.foreground,
    primary: t.primary, onPrimary: t.primaryForeground, secondaryFill: t.secondary, onSecondary: t.secondaryForeground};
}
export const lightColors = mapTheme(resolveTheme({}, 'light'));
export const darkColors = mapTheme(resolveTheme({}, 'dark'));
const neutralColors = (dark: boolean): ThemeColors => ({ ... (dark ? darkColors : lightColors),
  background: dark ? '#181818' : '#f5f5f5', surface: dark ? '#242424' : '#ffffff',
  raised: dark ? '#303030' : '#eeeeee', text: dark ? '#ffffff' : '#181818',
  accent: dark ? '#eeeeee' : '#333333', onAccent: dark ? '#181818' : '#ffffff',
  accentSoft: dark ? '#333333' : '#eeeeee', primary: dark ? '#eeeeee' : '#333333',
  onPrimary: dark ? '#181818' : '#ffffff', border: dark ? '#555555' : '#cccccc' });
type ShopBranding = {name: string; currency: string; timezone: string; logo: string; logoDark?: string; appearance: ThemePreference; light: ThemeTokens; dark: ThemeTokens};
const key = 'cartelites.theme-preference';
const ThemeContext = createContext<{
  colors: ThemeColors;
  shopName: string;
  shopLogo: string;
  currency: string;
  timezone: string;
  brandingReady: boolean;
  brandingError: string;
  loadBranding: () => Promise<void>;
  clearBranding: () => void;
  dark: boolean;
  reduceMotion: boolean;
  preference: ThemePreference;
  saving: boolean;
  setPreference: (value: ThemePreference) => Promise<void>;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Until the accessibility preference is known, avoid introducing movement.
  const [reduceMotion,setReduceMotion]=useState(true);
  useEffect(()=>{
    let active=true,changed=false;
    const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{changed=true;setReduceMotion(value);});
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active&&!changed)setReduceMotion(value);}).catch(()=>undefined);
    return ()=>{active=false;listener.remove();};
  },[]);
  const [branding, setBranding] = useState<ShopBranding | null>(null);
  const [brandingError, setBrandingError] = useState('');
  const brandingRequest = useRef(0);
  const cache = useRef(new Map<string, ShopBranding>());
  const clearBranding = () => { setShopFormatting(null); brandingRequest.current++; setBranding(null); setBrandingError(''); };
  const loadBranding = async () => {
    const revision = ++brandingRequest.current;
    const instance = getApiBaseUrl();
    setShopFormatting(null); setBranding(null); setBrandingError('');
    if (!instance) return;
    try {
      const response = await instanceFetch('/public/shop-config');
      if (!response.ok) throw new Error('Configuration de la boutique indisponible.');
      const data = await response.json();
      if (data?.version !== 1 || typeof data.branding?.name !== 'string' || !data.branding?.theme?.light || !data.branding?.theme?.dark) throw new Error('Configuration de boutique incompatible.');
      const appearance = data.branding.theme.appearance;
      if (!['system', 'light', 'dark'].includes(appearance) || typeof data.branding.logo !== 'string') throw new Error('Identité visuelle de boutique invalide.');
      const logoUrl = (path: string) => { const url = new URL(path, instance); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL de logo invalide.'); return url.toString(); };
      if (typeof data.currency !== 'string' || typeof data.timezone !== 'string') throw new Error('Devise ou fuseau horaire manquant.');
      new Intl.NumberFormat('fr-BE', {style: 'currency', currency: data.currency});
      new Intl.DateTimeFormat('fr-BE', {timeZone: data.timezone});
      const value: ShopBranding = {currency: data.currency, timezone: data.timezone, name: data.branding.name, logo: logoUrl(data.branding.logo), logoDark: data.branding.logoDark ? logoUrl(data.branding.logoDark) : undefined, appearance, light: resolveTheme(data.branding.theme.light, 'light'), dark: resolveTheme(data.branding.theme.dark, 'dark')};
      if (revision !== brandingRequest.current || instance !== getApiBaseUrl()) return;
      cache.current.set(instance, value); setShopFormatting(value); setBranding(value);
    } catch (reason) {
      if (revision !== brandingRequest.current || instance !== getApiBaseUrl()) return;
      // Only reuse a previously validated configuration for this exact instance.
      const previous = cache.current.get(instance);
      if (previous) { setShopFormatting(previous); setBranding(previous); }
      else setBrandingError(reason instanceof Error ? reason.message : 'Chargement de la boutique impossible.');
    }
  };
  const [preference, setValue] = useState<ThemePreference>('system');
  const [saving, setSaving] = useState(true);
  useEffect(() => {
    let mounted = true;
    void SecureStore.getItemAsync(key)
      .then((value) => {
        if (mounted && (value === 'light' || value === 'dark' || value === 'system'))
          setValue(value);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setSaving(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  const effectivePreference = preference === 'system' ? branding?.appearance ?? 'system' : preference;
  const dark = effectivePreference === 'dark' || (effectivePreference === 'system' && system === 'dark');
  useEffect(() => {
    Appearance.setColorScheme(effectivePreference === 'system' ? 'unspecified' : effectivePreference);
  }, [effectivePreference]);
  async function setPreference(value: ThemePreference) {
    setSaving(true);
    try {
      await SecureStore.setItemAsync(key, value);
      setValue(value);
    } finally {
      setSaving(false);
    }
  }
  return (
    <ThemeContext.Provider
      value={{ colors: branding ? mapTheme(dark ? branding.dark : branding.light) : neutralColors(dark), currency: branding?.currency ?? "EUR", timezone: branding?.timezone ?? "Europe/Brussels", shopName: branding?.name ?? "", shopLogo: branding ? (dark ? branding.logoDark ?? branding.logo : branding.logo) : "", brandingReady: !!branding, brandingError, loadBranding, clearBranding, dark, reduceMotion, preference, saving, setPreference }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('ThemeProvider manquant');
  return value;
}
export function AppearanceSettings() {
  const { colors, preference, saving, setPreference } = useTheme();
  const [error, setError] = useState('');
  return (
    <View style={{ marginVertical: 18, gap: 10 }}>
      <Text
        style={{ color: colors.secondary, fontSize: 12, letterSpacing: 0.6, marginHorizontal: 14 }}
      >
        APPARENCE
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{
          backgroundColor: colors.surface,
          padding: 5,
          borderRadius: 14,
          flexDirection: 'row',
          gap: 4,
        }}
      >
        {(
          [
            ['system', 'Système'],
            ['light', 'Clair'],
            ['dark', 'Sombre'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: preference === value, disabled: saving }}
            disabled={saving}
            onPress={() => {
              setError('');
              void setPreference(value).catch(() =>
                setError('Impossible d’enregistrer l’apparence. Réessayez.'),
              );
            }}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: preference === value ? colors.accentSoft : colors.surface,
            }}
          >
            <Text
              style={{
                color: preference === value ? colors.accent : colors.secondary,
                fontSize: 14,
                fontWeight: preference === value ? '600' : '400',
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
