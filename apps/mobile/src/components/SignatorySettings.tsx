import { useEffect, useState } from "react";
import { Text, View, Pressable, Alert, ActivityIndicator } from "react-native";
import type { SignatoryProfile } from "../../../../packages/domain/src/consignmentReceipt";
import { request } from "../data/apiRepository";
import { SignaturePad } from "./SignaturePad";
import { Field } from "./Field";
export function SignatorySettings({
  onEditingChange,
}: {
  onEditingChange?: (editing: boolean) => void;
}) {
  const [saved, setSaved] = useState<SignatoryProfile>({
    firstName: "",
    lastName: "",
    capacity: "",
  });
  const [profile, setProfile] = useState(saved);
  const [loading, setLoading] = useState(true),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  async function load() {
    setLoading(true);
    setFailed(false);
    setMessage("");
    try {
      const p = await request<SignatoryProfile>("/auth/profile");
      setSaved(p);
      setProfile(p);
    } catch {
      setFailed(true);
      setMessage("Impossible de charger le signataire.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  async function save() {
    setLoading(true);
    setMessage("");
    try {
      const p = await request<SignatoryProfile>(
        "/auth/profile",
        profile,
        "PATCH",
      );
      setSaved(p);
      setProfile(p);
      setEditing(false);
      setMessage("Signataire et signature enregistrés.");
    } catch {
      setMessage(
        "Enregistrement impossible. Vérifiez les informations et réessayez.",
      );
    } finally {
      setLoading(false);
    }
  }
  const button = (label: string, action: () => void) => (
    <Pressable
      disabled={loading}
      accessibilityRole="button"
      onPress={action}
      style={{ padding: 14, borderRadius: 14, backgroundColor: "#f8ecd6" }}
    >
      <Text style={{ color: "#815216", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        padding: 18,
        gap: 16,
        backgroundColor: "white",
        borderRadius: 20,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        {editing ? "Modifier mon signataire" : "Ma boutique"}
      </Text>
      {loading && <ActivityIndicator />}
      {failed ? (
        button("Réessayer", () => void load())
      ) : editing ? (
        <>
          {(["firstName", "lastName", "capacity"] as const).map((key, i) => (
            <Field
              key={key}
              label={["Prénom", "Nom", "Qualité / fonction"][i]}
              value={profile[key]}
              editable={!loading}
              onChangeText={(v) => setProfile({ ...profile, [key]: v })}
            />
          ))}
          <SignaturePad
            label="Ma signature"
            value={profile.signature ?? []}
            onChange={(signature) =>
              setProfile({
                ...profile,
                signature: signature.length ? signature : null,
              })
            }
            disabled={loading}
          />
          <Text>
            Cette signature sera proposée pour vos documents. Vous confirmerez
            chaque utilisation.
          </Text>
          {button("Enregistrer", () => void save())}
          {button("Annuler", () => {
            const discard = () => {
              setProfile(saved);
              setEditing(false);
            };
            if (JSON.stringify(saved) !== JSON.stringify(profile))
              Alert.alert(
                "Abandonner les modifications ?",
                "Votre signature enregistrée sera conservée.",
                [
                  { text: "Continuer", style: "cancel" },
                  {
                    text: "Abandonner",
                    style: "destructive",
                    onPress: discard,
                  },
                ],
              );
            else discard();
          })}
        </>
      ) : (
        <>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>
            {[saved.firstName, saved.lastName].filter(Boolean).join(" ") ||
              "Signataire à configurer"}
          </Text>
          {!!saved.capacity && <Text>{saved.capacity}</Text>}
          <Text>
            {saved.signature?.length
              ? "Signature enregistrée"
              : "Signature à configurer"}
          </Text>
          {!!saved.signature?.length && (
            <SignaturePad
              label="Signature réutilisable"
              value={saved.signature}
              onChange={() => {}}
              disabled
            />
          )}
          {button("Modifier mon signataire", () => setEditing(true))}
        </>
      )}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
    </View>
  );
}
