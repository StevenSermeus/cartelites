import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type Page =
  | 'clients'
  | 'consignments'
  | 'purchase'
  | 'stock'
  | 'sales'
  | 'saleSummary'
  | 'salePayment'
  | 'saleComplete'
  | 'history'
  | 'salesHistory'
  | 'account';
export const pageHeaders: Record<Page, [string, string]> = {
  stock: ['Stock', 'Vos cartes, collections et articles disponibles.'],
  sales: ['Vente', 'Ajoutez les articles au panier.'],
  saleSummary: ['Vente', 'Panier en cours'],
  salePayment: ['Encaisser', 'Enregistrez le règlement de cette vente.'],
  saleComplete: ['Vente enregistrée', 'Retrouvez le détail de votre encaissement.'],
  history: ['Rachats', 'Vos rachats et documents'],
  purchase: ['Nouveau rachat', 'Client, cartes et document.'],
  consignments: ['Dépôts-vente', 'Dossiers, contrats et reversements.'],
  clients: ['Clients', 'Coordonnées de vos vendeurs et déposants.'],
  salesHistory: ['Historique des ventes', 'Ventes et encaissements.'],
  account: ['Plus', 'Clients, compte et préférences.'],
};
export function activeTab(page: Page): Page {
  if (['sales', 'saleSummary', 'salePayment', 'saleComplete', 'salesHistory'].includes(page))
    return 'sales';
  if (['history', 'purchase'].includes(page)) return 'history';
  if (['account', 'clients'].includes(page)) return 'account';
  return page;
}
const tabs = [
  ['stock', 'Stock', 'albums-outline'],
  ['sales', 'Vendre', 'cart-outline'],
  ['history', 'Rachats', 'receipt-outline'],
  ['consignments', 'Dépôts', 'cube-outline'],
  ['account', 'Plus', 'ellipsis-horizontal'],
] as const;
export function MobileNavigation({
  page,
  onChange,
  onReset,
  disabled = false,
}: {
  page: Page;
  onChange: (page: Page) => void;
  onReset: (page: Page) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const lastPress = useRef<{ target: Page; at: number } | null>(null);

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
            accessibilityHint="Appuyez deux fois rapidement pour revenir au début de cet onglet."
            onPressIn={() => {
              const now = Date.now();
              const previous = lastPress.current;
              if (previous?.target === target && now - previous.at <= 500) {
                lastPress.current = null;
                onReset(target);
              } else {
                lastPress.current = { target, at: now };
              }
            }}
            onPress={() => onChange(target)}
            style={[s.tab, selected && s.selected]}
          >
            <Ionicons name={icon} size={23} color={selected ? colors.accent : colors.secondary} />
            <Text style={[{ color: colors.text }, [s.label, selected && s.activeLabel]]}>
              {title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
export function MobileHeader({
  page,
  title,
  subtitle,
}: {
  page: Page;
  title?: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  const s = createStyles(colors);

  return (
    <View style={s.header}>
      <View style={s.nav}>
        <Text style={[{ color: colors.text }, s.brand]}>Espace vendeur</Text>
      </View>
      <Text accessibilityRole="header" style={[{ color: colors.text }, s.title]}>
        {title ?? pageHeaders[page][0]}
      </Text>
      {!!(subtitle ?? pageHeaders[page][1]) && (
        <Text style={[{ color: colors.text }, s.subtitle]}>{subtitle ?? pageHeaders[page][1]}</Text>
      )}
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      paddingHorizontal: 6,
      paddingVertical: 8,
      marginHorizontal: -16,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      borderRadius: 12,
    },
    selected: { backgroundColor: colors.accentSoft },
    label: { fontSize: 11, color: colors.secondary, fontWeight: '500' },
    activeLabel: { color: colors.accent, fontWeight: '600' },
    header: { marginBottom: 16 },
    nav: { minHeight: 44, justifyContent: 'center' },
    brand: { color: colors.text, fontSize: 15, fontWeight: '700' },
    title: {
      color: colors.text,
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: -1,
      marginTop: 9,
      marginBottom: 10,
    },
    subtitle: { color: colors.secondary, fontSize: 15, lineHeight: 21 },
  });
