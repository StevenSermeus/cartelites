import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
export function Pagination({
  data,
}: {
  data: {
    loading: boolean;
    error: string;
    page: number;
    hasPrevious: boolean;
    nextCursor: string | null;
    previous(): void;
    next(): void;
    reload(): void;
  };
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const button = (label: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={[{ color: colors.text }, styles.label]}>{label}</Text>
    </Pressable>
  );
  if (!data.loading && !data.error && !data.hasPrevious && !data.nextCursor) return null;
  return (
    <View style={styles.container}>
      {data.loading && <ActivityIndicator color={colors.accent} accessibilityLabel="Chargement" />}
      {!!data.error && (
        <View>
          <Text accessibilityRole="alert" style={[{ color: colors.text }, styles.error]}>
            {data.error}
          </Text>
          {button('Réessayer', data.reload)}
        </View>
      )}
      <Text style={[{ color: colors.text }, styles.page]}>Page {data.page}</Text>
      <View style={styles.actions}>
        {button('Précédent', data.previous, data.loading || !data.hasPrevious)}
        {button('Suivant', data.next, data.loading || !data.nextCursor)}
      </View>
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { gap: 10, marginVertical: 16 },
    actions: { flexDirection: 'row', gap: 12 },
    button: {
      flexGrow: 1,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    label: { color: colors.accent, fontSize: 15, fontWeight: '600' },
    page: { color: colors.secondary, textAlign: 'center', fontSize: 13 },
    disabled: { opacity: 0.4 },
    error: { color: colors.danger, marginBottom: 8 },
  });
