import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { markUserActivity } from '../auth/session';
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
  keyboardType?: 'default' | 'decimal-pad' | 'phone-pad' | 'email-address' | 'url';
  placeholder?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
}) {
  const { colors, dark } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.wrap}>
      <Text style={[{ color: colors.text }, styles.label]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => {
          markUserActivity();
          onChangeText(text);
        }}
        keyboardType={keyboardType}
        autoCapitalize={
          secureTextEntry || keyboardType === 'email-address' || keyboardType === 'url'
            ? 'none'
            : 'sentences'
        }
        autoCorrect={!secureTextEntry && keyboardType !== 'email-address' && keyboardType !== 'url'}
        textContentType={
          secureTextEntry
            ? 'password'
            : keyboardType === 'email-address'
              ? 'emailAddress'
              : keyboardType === 'url'
                ? 'URL'
                : undefined
        }
        placeholderTextColor={colors.placeholder}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        editable={editable}
        style={[{ color: colors.text }, styles.input]}
        keyboardAppearance={dark ? 'dark' : 'light'}
      />
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { marginBottom: 14 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 48,
      fontSize: 16,
    },
  });
