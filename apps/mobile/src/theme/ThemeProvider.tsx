import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Appearance, Pressable, Text, View, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference = 'system' | 'light' | 'dark';
export const lightColors = {
  background: '#f2f2f7',
  surface: '#ffffff',
  raised: '#f7f7fa',
  text: '#19191c',
  secondary: '#6b6b73',
  placeholder: '#8e8e93',
  border: '#e7e7ec',
  accent: '#815216',
  onAccent: '#ffffff',
  accentSoft: '#f8ecd6',
  danger: '#a12e25',
  dangerSoft: '#fff0ee',
  success: '#247349',
  successSoft: '#edf4f0',
  warning: '#805600',
  warningSoft: '#fff4d8',
  info: '#324e60',
  infoSoft: '#e8f1f6',
  shadow: '#000000',
  overlay: 'rgba(0,0,0,0.45)',
  signature: '#14213d',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#171719',
  surface: '#252527',
  raised: '#29292e',
  text: '#f6f6f8',
  secondary: '#adadb5',
  placeholder: '#92929d',
  border: '#39393c',
  accent: '#efbd53',
  onAccent: '#19191c',
  accentSoft: '#42341e',
  danger: '#ff8a80',
  dangerSoft: '#3b2224',
  success: '#82d4a5',
  successSoft: '#20352a',
  warning: '#f3cb72',
  warningSoft: '#352e1f',
  info: '#a4c9e0',
  infoSoft: '#25333e',
  shadow: '#000000',
  overlay: 'rgba(0,0,0,0.65)',
  signature: '#f6f6f8',
};
const key = 'cartelites.theme-preference';
const ThemeContext = createContext<{
  colors: ThemeColors;
  dark: boolean;
  preference: ThemePreference;
  saving: boolean;
  setPreference: (value: ThemePreference) => Promise<void>;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
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
  const dark = preference === 'dark' || (preference === 'system' && system === 'dark');
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);
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
      value={{ colors: dark ? darkColors : lightColors, dark, preference, saving, setPreference }}
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
