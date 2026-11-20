import { markUserActivity } from "../auth/session";
import { StyleSheet, Text, TextInput, View } from "react-native";
export function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  secureTextEntry = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?:
    "default" | "decimal-pad" | "phone-pad" | "email-address" | "url";
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
        onChangeText={(text) => {
          markUserActivity();
          onChangeText(text);
        }}
        keyboardType={keyboardType}
        autoCapitalize={
          secureTextEntry ||
          keyboardType === "email-address" ||
          keyboardType === "url"
            ? "none"
            : "sentences"
        }
        autoCorrect={
          !secureTextEntry &&
          keyboardType !== "email-address" &&
          keyboardType !== "url"
        }
        textContentType={
          secureTextEntry
            ? "password"
            : keyboardType === "email-address"
              ? "emailAddress"
              : keyboardType === "url"
                ? "URL"
                : undefined
        }
        placeholderTextColor="#8e8e93"
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
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6, color: "#19191c" },
  input: {
    borderWidth: 1,
    borderColor: "#e7e7ec",
    backgroundColor: "white",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
  },
});
