import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type Page =
  | "clients"
  | "consignments"
  | "purchase"
  | "stock"
  | "sales"
  | "saleSummary"
  | "salePayment"
  | "saleComplete"
  | "history"
  | "salesHistory"
  | "account";
export const pageHeaders: Record<Page, [string, string]> = {
  stock: ["Stock", "Vos cartes, collections et articles disponibles."],
  sales: ["Vente", "Ajoutez les articles au panier."],
  saleSummary: ["Panier", "Vérifiez les articles et leurs prix."],
  salePayment: ["Encaisser", "Enregistrez le règlement de cette vente."],
  saleComplete: [
    "Vente enregistrée",
    "Retrouvez le détail de votre encaissement.",
  ],
  history: ["Rachats", "Vos dossiers et bordereaux."],
  purchase: ["Nouveau rachat", "Client, cartes et document."],
  consignments: ["Dépôts-vente", "Dossiers, contrats et reversements."],
  clients: ["Clients", "Coordonnées de vos vendeurs et déposants."],
  salesHistory: ["Historique des ventes", "Ventes et encaissements."],
  account: ["Compte", "Votre boutique et votre signature."],
};
export function activeTab(page: Page): Page {
  if (
    [
      "sales",
      "saleSummary",
      "salePayment",
      "saleComplete",
      "salesHistory",
    ].includes(page)
  )
    return "sales";
  if (["history", "purchase"].includes(page)) return "history";
  if (["account", "clients"].includes(page)) return "account";
  return page;
}
const tabs = [
  ["stock", "Stock", "albums-outline"],
  ["history", "Rachat", "add-circle-outline"],
  ["sales", "Vente", "cart-outline"],
  ["consignments", "Dépôts", "cube-outline"],
  ["account", "Compte", "person-circle-outline"],
] as const;
export function MobileNavigation({
  page,
  onChange,
  disabled = false,
}: {
  page: Page;
  onChange: (page: Page) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="tablist" style={s.bar}>
      {tabs.map(([target, title, icon]) => {
        const selected = activeTab(page) === target;
        return (
          <Pressable
            key={target}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(target)}
            style={[s.tab, selected && s.selected]}
          >
            <Ionicons
              name={icon}
              size={23}
              color={selected ? "#815216" : "#6b6b73"}
            />
            <Text style={[s.label, selected && s.activeLabel]}>{title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function MobileHeader({ page }: { page: Page }) {
  return (
    <View style={s.header}>
      <Text style={s.brand}>cartélites.</Text>
      <Text accessibilityRole="header" style={s.title}>
        {pageHeaders[page][0]}
      </Text>
      <Text style={s.subtitle}>{pageHeaders[page][1]}</Text>
    </View>
  );
}
const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    padding: 5,
    marginTop: 4,
    marginHorizontal: -4,
    borderRadius: 26,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e7e7ec",
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 21,
  },
  selected: { backgroundColor: "#f8ecd6" },
  label: { fontSize: 10, color: "#6b6b73", fontWeight: "500" },
  activeLabel: { color: "#815216", fontWeight: "600" },
  header: { gap: 7, marginBottom: 20 },
  brand: { color: "#815216", fontSize: 15, fontWeight: "700", marginBottom: 9 },
  title: {
    color: "#19191c",
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  subtitle: { color: "#6b6b73", fontSize: 14, lineHeight: 20 },
});
