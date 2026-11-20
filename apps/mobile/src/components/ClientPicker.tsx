import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { usePagedData } from "../data/usePagedData";
import { createSeller, readRecord } from "../data/apiRepository";
import { Field } from "./Field";
import { Pagination } from "./Pagination";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Seller } from "../data/apiRepository";

export function ClientPicker({
  clients,
  value,
  onChange,
  onCreate,
  onResolved,
  label = "Déposant",
}: {
  clients: Seller[];
  value: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  onResolved?: (client: Seller) => void;
  label?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const savingLock = useRef(false);
  const saveClient = async () => {
    if (savingLock.current || !name.trim()) return;
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Indiquez une adresse e-mail valide.");
      return;
    }
    savingLock.current = true;
    setSaving(true);
    setError("");
    try {
      const input = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      };
      const result = await createSeller(input);
      const client = { ...input, _id: result.id };
      setResolved(client);
      onResolved?.(client);
      onChange(client._id);
      setCreating(false);
      setName("");
      setEmail("");
      setPhone("");
      setAddress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  };
  const [search, setSearch] = useState("");
  const [resolved, setResolved] = useState<Seller | null>(null);
  const data = usePagedData<Seller>(
    "/sellers",
    { search: search.trim(), size: 10 },
    !value && !creating,
  );
  const selected =
    clients.find((client) => client._id === value) ??
    (resolved?._id === value ? resolved : null);
  useEffect(() => {
    let active = true;
    if (value && !selected)
      void readRecord<Seller>("/sellers", value)
        .then((client) => {
          if (active) {
            setResolved(client);
            onResolved?.(client);
          }
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);
  const matches = data.items;
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {creating ? (
        <Modal
          presentationStyle="fullScreen"
          animationType="slide"
          onRequestClose={() => {
            if (!saving) setCreating(false);
          }}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: "#f2f2f7" }}>
            <View style={{ padding: 16 }}>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => setCreating(false)}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={styles.actionText}>‹ Clients</Text>
              </Pressable>
              <Text
                accessibilityRole="header"
                style={{ fontSize: 28, fontWeight: "700", color: "#19191c" }}
              >
                Nouveau client
              </Text>
            </View>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16 }}
              >
                <View style={styles.form}>
                  <Field
                    label="Nom complet"
                    value={name}
                    onChangeText={setName}
                    editable={!saving}
                  />
                  <Field
                    label="E-mail pour recevoir le document"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    editable={!saving}
                  />
                  <Field
                    label="Téléphone"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    editable={!saving}
                  />
                  <Field
                    label="Adresse"
                    value={address}
                    onChangeText={setAddress}
                    editable={!saving}
                  />
                  <Text style={styles.hint}>
                    L’adresse e-mail permet d’envoyer son exemplaire signé au
                    client.
                  </Text>
                  {!!error && (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: "#a12e25" }}
                    >
                      {error}
                    </Text>
                  )}
                </View>
              </ScrollView>
              <View style={{ padding: 16, backgroundColor: "#fff" }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || !name.trim()}
                  onPress={() => void saveClient()}
                  style={[styles.create, { backgroundColor: "#815216" }]}
                >
                  <Text style={styles.actionText}>
                    {saving
                      ? "Enregistrement…"
                      : "Créer et sélectionner ce client"}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      ) : selected ? (
        <View style={styles.selected}>
          <View style={styles.mark}>
            <Ionicons name="person" size={17} color="#815216" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.hint}>
              {[selected.email, selected.phone].filter(Boolean).join(" · ") ||
                "Coordonnées non renseignées"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer de déposant"
            style={styles.change}
            onPress={() => {
              onChange("");
              setSearch("");
            }}
          >
            <Text style={styles.actionText}>Changer</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={19} color="#6b6b73" />
            <TextInput
              accessibilityLabel="Rechercher le déposant"
              value={search}
              onChangeText={setSearch}
              placeholder="Nom, e-mail ou téléphone"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {!!search && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche client"
                onPress={() => setSearch("")}
              >
                <Ionicons name="close-circle" size={19} color="#6b6b73" />
              </Pressable>
            )}
          </View>
          {!search.trim() && <Text style={styles.label}>Clients</Text>}
          {matches.map((client) => (
            <Pressable
              key={client._id}
              accessibilityRole="button"
              style={styles.result}
              onPress={() => {
                setResolved(client);
                onResolved?.(client);
                onChange(client._id);
                setSearch("");
              }}
            >
              <View style={styles.flex}>
                <Text style={styles.name}>{client.name}</Text>
                <Text style={styles.hint}>
                  {[client.email, client.phone].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#6b6b73" />
            </Pressable>
          ))}
          {!data.loading && !data.error && !matches.length && (
            <Text style={styles.hint}>
              {search.trim()
                ? "Aucun client trouvé. Vous pouvez créer sa fiche."
                : "Créez votre première fiche client."}
            </Text>
          )}
          <Pagination data={data} />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setCreating(true);
              if (!name.trim()) setName(search);
              setError("");
            }}
            style={styles.create}
          >
            <Text style={styles.actionText}>Créer une fiche client</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  form: { padding: 16, backgroundColor: "#fff", borderRadius: 15 },
  label: { fontWeight: "600", marginBottom: 8, color: "#19191c" },
  flex: { flex: 1 },
  name: { fontWeight: "700", color: "#19191c" },
  hint: { color: "#6b6b73", fontSize: 12, marginVertical: 5 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e7e7ec",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  input: { flex: 1, paddingVertical: 10, color: "#19191c", fontSize: 15 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#e7e7ec",
    backgroundColor: "#fff",
  },
  selected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#adc6d4",
    borderRadius: 10,
    backgroundColor: "#f8ecd6",
  },
  mark: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#f8ecd6",
  },
  change: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  actionText: { color: "#815216", fontSize: 12, fontWeight: "700" },
  create: {
    padding: 13,
    alignItems: "center",
    borderRadius: 9,
    marginVertical: 8,
    backgroundColor: "#f2f2f7",
  },
});
