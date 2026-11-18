import { StyleSheet, Text, TextInput, View } from 'react-native';
export function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
  secureTextEntry = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad';
  placeholder?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        editable={editable}
        style={styles.input}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#263238' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5dc',
    backgroundColor: 'white',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
});
