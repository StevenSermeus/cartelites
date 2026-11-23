import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export type Page =
  | 'purchaseDetail'
  | 'saleDetail'
  | 'activity'
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
  purchaseDetail: ['Dossier de rachat', 'Contact, cartes et documents.'],
  saleDetail: ['Détail de la vente', 'Règlements, documents et corrections.'],
  activity: ['Activité', 'Achats, ventes et mouvements de stock.'],
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
  if (['sales', 'saleSummary', 'salePayment', 'saleComplete'].includes(page))
    return 'sales';
  if (['history', 'purchase', 'purchaseDetail'].includes(page)) return 'history';
  if (['salesHistory', 'saleDetail'].includes(page)) return 'activity';
  if (['account', 'clients', 'consignments'].includes(page)) return 'account';
  return page;
}
const tabs = [
  ['history', 'Rachats', 'receipt-outline'],
  ['sales', 'Vendre', 'cart-outline'],
  ['stock', 'Stock', 'albums-outline'],
  ['activity', 'Activité', 'time-outline'],
  ['account', 'Plus', 'ellipsis-horizontal'],
] as const;
export function MobileNavigation({
  page,
  onChange,
  onReset,
  disabled = false,
  basketCount = 0,
  onHeightChange,
}: {
  page: Page;
  onChange: (page: Page) => void;
  onReset: (page: Page) => void;
  disabled?: boolean;
  basketCount?: number;
  onHeightChange?: (height:number)=>void;
}) {
  const { colors } = useTheme();
  const s = createStyles(colors);
  const lastPress = useRef<{ target: Page; at: number } | null>(null);

  return (
    <View accessibilityRole="tablist" style={s.bar} onLayout={event=>onHeightChange?.(event.nativeEvent.layout.height)}>
      {tabs.map(([target, title, icon]) => {
        const selected = activeTab(page) === target;
        return (
          <Pressable
            key={target}
            accessibilityRole="tab"
            accessibilityLabel={target === 'sales' ? `${title}, ${basketCount} article(s) au panier` : title}
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
            <View><Ionicons name={icon} size={23} color={selected ? colors.accent : colors.secondary} />
              {target==='sales'&&basketCount>0&&<View accessible={false} style={{position:'absolute',left:16,top:-6,minWidth:18,paddingHorizontal:3,borderRadius:9,backgroundColor:colors.accent}}><Text maxFontSizeMultiplier={1.3} style={{fontSize:10,color:colors.onAccent,textAlign:'center'}}>{basketCount>99?'99+':basketCount}</Text></View>}
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[{ color: colors.text }, [s.label, selected && s.activeLabel]]}>
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
  const { colors, shopName, shopLogo } = useTheme();
  const s = createStyles(colors);

  return (
    <View style={s.header}>
      <View style={[s.nav, { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", gap: 10 }]}>
        {!!shopLogo && <Image source={{uri: shopLogo}} accessibilityLabel={shopName} style={{width: 36, height: 36}} resizeMode="contain" />}
        <Text style={[{ color: colors.text }, s.brand]}>{shopName || "Espace vendeur"}</Text>
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
