import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
export function Pagination({ data }: { data: { loading: boolean; error: string; page: number; hasPrevious: boolean; nextCursor: string | null; previous(): void; next(): void; reload(): void } }) {
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.label}>{label}</Text></Pressable>;
  return <View style={styles.container}>
    {data.loading && <ActivityIndicator color="#164f73" accessibilityLabel="Chargement" />}
    {!!data.error && <View><Text accessibilityRole="alert" style={styles.error}>{data.error}</Text>{button('Réessayer', data.reload)}</View>}
    <Text style={styles.page}>Page {data.page}</Text>
    <View style={styles.actions}>
      {button('Précédent', data.previous, data.loading || !data.hasPrevious)}
      {button('Suivant', data.next, data.loading || !data.nextCursor)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 10, marginVertical: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d7e1e7', borderRadius: 8, backgroundColor: '#fff' },
  label: { color: '#164f73', fontSize: 14, fontWeight: '600' },
  page: { color: '#536b7a', textAlign: 'center', fontSize: 12 },
  disabled: { opacity: 0.4 },
  error: { color: '#a4352d', marginBottom: 8 },
});
