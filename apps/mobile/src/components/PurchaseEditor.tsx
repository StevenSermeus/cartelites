import { useTheme, type ThemeColors } from '../theme/ThemeProvider';
import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActionSheetIOS,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Field } from './Field';
import type { PurchaseDraft } from '../data/apiRepository';
import { AttachmentPreview } from './AttachmentPreview';
import type { Tcg } from '../../../../packages/domain/src/riftbound';
const amount = (v: string) => Number(v.replace(',', '.')) || 0;
export const purchaseTotal = (rows: PurchaseDraft[]) =>
  rows
    .filter((r) => r.included)
    .reduce((s, r) => s + Math.round(amount(r.marketValue) * amount(r.discountPercent)), 0) / 100;
const money = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
function Button({
  title,
  onPress,
  disabled = false,
  selected = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  const s = createStyles(colors);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        selected && s.selected,
        primary && {
          backgroundColor: colors.accent,
          borderColor: colors.accent,
          minHeight: 49,
          borderRadius: 13,
        },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={[
          { color: colors.text },
          [s.buttonText, primary && { color: colors.onAccent, textAlign: 'center' }],
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
type Props = {
  rows: PurchaseDraft[];
  setRows: Dispatch<SetStateAction<PurchaseDraft[]>>;
  fresh: () => PurchaseDraft;
  search: (d: PurchaseDraft) => Promise<void>;
  select: (d: PurchaseDraft, c: PurchaseDraft['cardResults'][number]) => Promise<void>;
  changeTcg: (d: PurchaseDraft, t: Tcg, reset?: boolean) => void;
  changeLanguage: (d: PurchaseDraft, l: 'fr' | 'en' | 'ja' | 'zh') => Promise<void>;
  photo: (key: string, file: import('../data/apiRepository').AttachmentFile | null) => void;
};
export function PurchaseEditor({
  rows,
  setRows,
  fresh,
  search,
  select,
  changeTcg,
  changeLanguage,
  photo,
}: Props) {
  const { colors, dark } = useTheme();
  const s = createStyles(colors);

  const [expanded, setExpanded] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [manual, setManual] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [page, setPage] = useState(0);
  const draft = rows.find((r) => !r.included),
    items = rows.filter((r) => r.included);
  const patch = (key: string, v: Partial<PurchaseDraft>) =>
    setRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const identity = (r: PurchaseDraft) => (
    <View style={s.identity}>
      {r.photo?.mimeType.startsWith('image/') ? (
        <Image
          accessibilityLabel={`Photo personnelle de ${r.name}`}
          source={{ uri: r.photo.uri }}
          style={s.thumb}
          resizeMode="contain"
        />
      ) : r.catalogueImageUrl ? (
        <Image source={{ uri: r.catalogueImageUrl }} style={s.thumb} resizeMode="contain" />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[{ color: colors.text }, s.name]}>{r.name}</Text>
        <Text style={[{ color: colors.text }, s.muted]}>
          {r.tcg === 'other' ? 'Autre' : r.tcg === 'riftbound' ? 'Riftbound' : 'Pokémon'} · {r.series} · {r.identifier} ·{' '}
          {r.language.toUpperCase()}
        </Text>
      </View>
    </View>
  );
  const choose = (title: string, choices: { label: string; apply: () => void }[]) => {
    if (Platform.OS === 'ios')
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...choices.map((choice) => choice.label), 'Annuler'],
          cancelButtonIndex: choices.length,
          userInterfaceStyle: dark ? 'dark' : 'light',
        },
        (index) => choices[index]?.apply(),
      );
    else
      Alert.alert(title, undefined, [
        ...choices.map((choice) => ({ text: choice.label, onPress: choice.apply })),
        { text: 'Annuler', style: 'cancel' },
      ]);
  };
  const selectRow = (label: string, value: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${value}`}
      onPress={onPress}
      style={s.formRow}
    >
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
      <Text style={s.chevron}>›</Text>
    </Pressable>
  );
  const inputRow = (
    label: string,
    value: string,
    change: (value: string) => void,
    numeric = false,
  ) => (
    <View style={s.formRow}>
      <Text style={s.rowLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={change}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        keyboardAppearance={dark ? 'dark' : 'light'}
        placeholder={numeric ? '0,00' : ''}
        placeholderTextColor={colors.placeholder}
        style={s.rowInput}
      />
    </View>
  );
  const content = (
    <View style={s.workspace}>
      {adding && (
        <View style={s.section}>
          <Text style={[{ color: colors.text }, s.step]}>RECHERCHE</Text>
          <Text style={[{ color: colors.text }, s.heading]}>Trouvez votre carte</Text>
          {draft && (
            <>
              <View style={s.wrap}>
                {(['pokemon', 'riftbound'] as const).map((tcg) => (
                  <Pressable
                    key={tcg}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: (draft.tcg ?? 'pokemon') === tcg,
                    }}
                    onPress={() => {
                      changeTcg(draft, tcg);
                      setPage(0);
                    }}
                    style={[s.game, (draft.tcg ?? 'pokemon') === tcg && s.selected]}
                  >
                    <Image
                      source={
                        tcg === 'pokemon'
                          ? require('../../../../assets/tcg/pokemon.png')
                          : require('../../../../assets/tcg/riftbound.png')
                      }
                      style={{ width: 50, height: 28 }}
                      resizeMode="contain"
                      accessible={false}
                    />
                    <Text style={[{ color: colors.text }, s.buttonText]}>
                      {tcg === 'pokemon' ? 'Pokémon' : 'Riftbound'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <AttachmentPreview current={draft.photo} onUse={(file) => photo(draft.key, file)} />
              {draft.photo?.mimeType.startsWith('image/') && (
                <Image
                  accessibilityLabel="Aperçu de la photo personnelle"
                  source={{ uri: draft.photo.uri }}
                  style={s.thumb}
                  resizeMode="contain"
                />
              )}
              {draft.photo && (
                <Pressable accessibilityRole="button" onPress={() => photo(draft.key, null)}>
                  <Text style={{ color: colors.text }}>Retirer la photo</Text>
                </Pressable>
              )}
              <Field
                label="Nom ou numéro de carte"
                value={draft.cardSearch}
                onChangeText={(v) => patch(draft.key, { cardSearch: v })}
                placeholder={draft.tcg === 'riftbound' ? 'Sett, OGN-…' : 'Pikachu, 151/165…'}
              />
              <Button
                title={draft.searching ? 'Recherche…' : 'Rechercher'}
                disabled={draft.searching || !draft.cardSearch.trim()}
                onPress={() => {
                  setPage(0);
                  void search(draft);
                }}
              />
              {draft.cardResults.length > 0 && (
                <>
                  <Text style={[{ color: colors.text }, s.muted]}>
                    {draft.cardResults.length} résultats · sélectionnez une version
                  </Text>
                  <View style={s.results}>
                    {draft.cardResults.slice(page * 6, page * 6 + 6).map((card) => (
                      <Pressable
                        accessibilityRole="button"
                        key={`${card.language}-${card.id}`}
                        onPress={() => void select(draft, card)}
                        style={s.result}
                      >
                        {card.image && (
                          <Image
                            source={{
                              uri:
                                draft.tcg === 'riftbound' ? card.image : `${card.image}/low.webp`,
                            }}
                            style={s.resultImage}
                            resizeMode="contain"
                          />
                        )}
                        <Text style={[{ color: colors.text }, s.name]}>{card.name}</Text>
                        <Text style={[{ color: colors.text }, s.muted]}>
                          {card.setName ?? card.id} · {card.localId} · {card.language.toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {draft.cardResults.length > 6 && (
                    <View style={s.wrap}>
                      <Button
                        title="Précédent"
                        disabled={!page}
                        onPress={() => setPage((p) => p - 1)}
                      />
                      <Text style={{ color: colors.text }}>
                        {page + 1}/{Math.ceil(draft.cardResults.length / 6)}
                      </Text>
                      <Button
                        title="Suivant"
                        disabled={(page + 1) * 6 >= draft.cardResults.length}
                        onPress={() => setPage((p) => p + 1)}
                      />
                    </View>
                  )}
                </>
              )}
              <Button
                title={manual ? 'Fermer la saisie manuelle' : 'Saisie manuelle'}
                onPress={() => setManual(!manual)}
              />
              {manual && (
                <>
                  <Field
                    label="Nom de la carte"
                    value={draft.name}
                    onChangeText={(v) => patch(draft.key, { name: v })}
                  />
                  <Field
                    label="Série"
                    value={draft.series}
                    onChangeText={(v) => patch(draft.key, { series: v })}
                  />
                  <Field
                    label="Numéro"
                    value={draft.identifier}
                    onChangeText={(v) => patch(draft.key, { identifier: v })}
                  />
                </>
              )}
              {!!draft.name.trim() && (
                <View style={s.preview}>
                  {identity(draft)}
                  <Button
                    primary
                    title="Ajouter au rachat"
                    disabled={draft.searching}
                    onPress={() => {
                      setRows((rows) => [
                        ...rows.map((r) =>
                          r.key === draft.key
                            ? {
                                ...r,
                                included: true,
                                cardResults: [],
                                searching: false,
                              }
                            : r,
                        ),
                        {
                          ...fresh(),
                          tcg: draft.tcg,
                          language: draft.tcg === 'riftbound' ? 'en' : 'fr',
                        },
                      ]);
                      setExpanded(draft.key);
                      setAdding(false);
                      setManual(false);
                      setPage(0);
                    }}
                  />
                  <Button
                    title="Annuler la sélection"
                    onPress={() => {
                      changeTcg(draft, draft.tcg ?? 'pokemon', true);
                      setManual(false);
                    }}
                  />
                </View>
              )}
            </>
          )}
        </View>
      )}
      {!adding && (
        <View style={expanded ? s.editor : s.section}>
          {!expanded && (
            <>
              <Text style={s.step}>CARTES À REPRENDRE</Text>
              <Text style={s.heading}>{items.length} carte(s) à reprendre</Text>
            </>
          )}
          {!expanded && <Button title="＋ Ajouter une carte" onPress={() => setAdding(true)} />}
          {!items.length && (
            <Text style={[{ color: colors.text }, s.empty]}>
              Ajoutez une carte depuis la recherche ou la saisie manuelle.
            </Text>
          )}
          {!expanded &&
            items.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`Évaluer ${item.name}`}
                onPress={() => setExpanded(item.key)}
                style={s.listItem}
              >
                {identity(item)}
                <View style={s.between}>
                  <Text style={[{ color: colors.text }, s.muted]}>
                    {item.condition} · Reprise à {item.discountPercent} %
                  </Text>
                  <Text style={[{ color: colors.text }, s.name]}>
                    {money(
                      Math.round(amount(item.marketValue) * amount(item.discountPercent)) / 100,
                    )}{' '}
                    ›
                  </Text>
                </View>
              </Pressable>
            ))}
          {items
            .filter((item) => item.key === expanded)
            .map((item) => (
              <View key={item.key} style={s.editor}>
                <Text accessibilityRole="header" style={s.editorTitle}>
                  {item.name}
                </Text>
                <Text style={s.muted}>Identification et estimation de la carte</Text>
                <View style={s.identityGroup}>{identity(item)}</View>
                <View style={s.formGroup}>
                  {selectRow(
                    'Langue',
                    { fr: 'Français', en: 'Anglais', ja: 'Japonais', zh: 'Chinois' }[item.language],
                    () =>
                      choose(
                        'Langue',
                        (['fr', 'en', 'ja', 'zh'] as const)
                          .filter(
                            (l) =>
                              (item.tcg !== 'riftbound' || l !== 'ja') &&
                              (!item.catalogueCardId || item.availableLanguages?.includes(l)),
                          )
                          .map((l) => ({
                            label: { fr: 'Français', en: 'Anglais', ja: 'Japonais', zh: 'Chinois' }[l],
                            apply: () => {
                              void changeLanguage(item, l);
                            },
                          })),
                      ),
                  )}
                  {selectRow(
                    'État',
                    {
                      M: 'Mint',
                      NM: 'Near Mint',
                      EX: 'Excellent',
                      GD: 'Good',
                      LP: 'Light Played',
                      PL: 'Played',
                      PO: 'Poor',
                    }[item.condition],
                    () =>
                      choose(
                        'État de la carte',
                        (['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const).map((condition) => ({
                          label: {
                            M: 'Mint',
                            NM: 'Near Mint',
                            EX: 'Excellent',
                            GD: 'Good',
                            LP: 'Light Played',
                            PL: 'Played',
                            PO: 'Poor',
                          }[condition],
                          apply: () => patch(item.key, { condition }),
                        })),
                      ),
                  )}
                  {selectRow(
                    'Gradation',
                    item.gradingCompany
                      ? `${item.gradingCompany} ${item.gradingGrade ?? ''}`.trim()
                      : 'Non gradée',
                    () =>
                      choose(
                        'Gradation',
                        (['', 'PSA', 'CollectAura', 'PCA', 'CCC'] as const).map((company) => ({
                          label: company || 'Non gradée',
                          apply: () =>
                            patch(item.key, {
                              gradingCompany: company || undefined,
                              gradingGrade: '',
                              gradingCertificate: '',
                              gradingNotes: '',
                            }),
                        })),
                      ),
                  )}
                  {item.gradingCompany && (
                    <>
                      {inputRow('Note', item.gradingGrade ?? '', (v) =>
                        patch(item.key, { gradingGrade: v }),
                      )}
                      {inputRow('Certificat', item.gradingCertificate ?? '', (v) =>
                        patch(item.key, { gradingCertificate: v }),
                      )}
                      {inputRow('Notes de gradation', item.gradingNotes ?? '', (v) =>
                        patch(item.key, { gradingNotes: v }),
                      )}
                    </>
                  )}
                  {inputRow(
                    'Cote du marché (€)',
                    item.marketValue,
                    (v) =>
                      patch(item.key, {
                        marketValue: v,
                        askingPrice: item.askingPriceTouched ? item.askingPrice : v,
                      }),
                    true,
                  )}
                </View>
                <View style={s.formGroup}>
                  {inputRow(
                    'Reprise de la cote (%)',
                    item.discountPercent,
                    (v) => patch(item.key, { discountPercent: v }),
                    true,
                  )}
                  <View style={s.rateOptions}>
                    {[70, 75, 80, 85, 90].map((rate) => (
                      <Pressable
                        key={rate}
                        accessibilityRole="button"
                        accessibilityLabel={`Reprise à ${rate} %`}
                        accessibilityState={{ selected: amount(item.discountPercent) === rate }}
                        onPress={() => patch(item.key, { discountPercent: String(rate) })}
                        style={[
                          s.rateOption,
                          amount(item.discountPercent) === rate && s.rateSelected,
                        ]}
                      >
                        <Text
                          style={{
                            color:
                              amount(item.discountPercent) === rate
                                ? colors.accent
                                : colors.secondary,
                            fontSize: 14,
                          }}
                        >
                          {rate} %
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <Text style={s.note}>
                  Reprise habituelle : 70 à 90 % de la cote. Comparez Cardmarket et, pour le gradé
                  et l’ancien, GCC, eBay et Vinted.
                </Text>
                <View style={s.formGroup}>
                  {selectRow('Identité et prix de vente', advanced ? 'Masquer' : 'Modifier', () =>
                    setAdvanced(!advanced),
                  )}
                  {advanced && (
                    <>
                      {inputRow('Nom', item.name, (v) => patch(item.key, { name: v }))}
                      {inputRow('Série', item.series, (v) => patch(item.key, { series: v }))}
                      {inputRow('Numéro', item.identifier, (v) =>
                        patch(item.key, { identifier: v }),
                      )}
                      {inputRow(
                        'Prix de vente (€)',
                        item.askingPriceTouched ? item.askingPrice : item.marketValue,
                        (v) => patch(item.key, { askingPrice: v, askingPriceTouched: true }),
                        true,
                      )}
                    </>
                  )}
                </View>
                <AttachmentPreview current={item.photo} onUse={(file) => photo(item.key, file)} />
                {item.photo && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => photo(item.key, null)}
                    style={s.inlineAction}
                  >
                    <Text style={{ color: colors.danger }}>Retirer la photo</Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRows((rows) => rows.filter((r) => r.key !== item.key));
                    setExpanded(null);
                    setAdvanced(false);
                  }}
                  style={s.inlineAction}
                >
                  <Text style={{ color: colors.danger }}>Retirer cette carte du rachat</Text>
                </Pressable>
              </View>
            ))}
        </View>
      )}
    </View>
  );
  const current = items.find((item) => item.key === expanded);
  const valid =
    current &&
    !current.searching &&
    current.name.trim() &&
    current.marketValue.trim() &&
    Number.isFinite(Number(current.marketValue.replace(',', '.'))) &&
    amount(current.marketValue) >= 0 &&
    current.discountPercent.trim() &&
    Number.isFinite(Number(current.discountPercent.replace(',', '.'))) &&
    amount(current.discountPercent) >= 0 &&
    amount(current.discountPercent) <= 100;
  if (!adding && !expanded) return content;
  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        setAdding(false);
        setExpanded(null);
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={s.nav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAdding(false);
              setExpanded(null);
              setAdvanced(false);
            }}
            style={s.navBack}
          >
            <Text style={{ color: colors.accent, fontSize: 14 }}>‹ Retour</Text>
          </Pressable>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>
            {expanded ? 'Estimation' : 'Recherche'}
          </Text>
          <View style={{ width: 56 }} />
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            key={expanded ?? 'search'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 9, paddingBottom: 24 }}
          >
            {content}
          </ScrollView>
          {current && (
            <View style={s.summary}>
              <View style={s.between}>
                <Text style={[{ color: colors.text }, s.muted]}>Montant de la reprise</Text>
                <Text style={[{ color: colors.text }, s.total]}>
                  {money(
                    Math.round(amount(current.marketValue) * amount(current.discountPercent)) / 100,
                  )}
                </Text>
              </View>
              {!valid && (
                <Text style={[{ color: colors.text }, s.muted]}>
                  Indiquez une cote valide et une reprise entre 0 et 100 %.
                </Text>
              )}
              <Button
                primary
                title="Terminer l’évaluation"
                disabled={!valid}
                onPress={() => {
                  setExpanded(null);
                  setAdvanced(false);
                }}
              />
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function PurchaseSummary({
  rows,
  busy,
  hasClient,
  save,
}: {
  rows: PurchaseDraft[];
  busy: boolean;
  hasClient: boolean;
  save: () => void;
}) {
  const { colors } = useTheme();
  const s = createStyles(colors);

  const items = rows.filter((r) => r.included),
    pending = rows.some((r) => !r.included && r.name.trim());
  return (
    <View style={s.summary}>
      <View style={s.between}>
        <Text style={[{ color: colors.text }, s.muted]}>
          {items.length} carte(s) · Total du rachat
        </Text>
        <Text style={[{ color: colors.text }, s.total]}>{money(purchaseTotal(rows))}</Text>
      </View>
      <Button
        title={busy ? 'Enregistrement…' : 'Enregistrer et consulter le PDF'}
        disabled={busy || !items.length || !hasClient || pending}
        onPress={save}
      />
      {pending ? (
        <Text style={[{ color: colors.text }, s.muted]}>Ajoutez ou annulez la carte en cours.</Text>
      ) : !hasClient ? (
        <Text style={[{ color: colors.text }, s.muted]}>Sélectionnez un client.</Text>
      ) : null}
    </View>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    workspace: { gap: 16 },
    editor: { gap: 12 },
    editorTitle: {
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      letterSpacing: -1,
      color: colors.text,
    },
    nav: {
      height: 51,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    navBack: { minHeight: 44, minWidth: 56, justifyContent: 'center' },
    formGroup: { backgroundColor: colors.surface, borderRadius: 15, overflow: 'hidden' },
    identityGroup: { backgroundColor: colors.surface, borderRadius: 15, padding: 14 },
    formRow: {
      minHeight: 57,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 15,
      gap: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowLabel: { color: colors.text, fontSize: 15 },
    rowValue: { color: colors.secondary, fontSize: 15, flex: 1, textAlign: 'right' },
    rowInput: {
      color: colors.text,
      fontSize: 16,
      flex: 1,
      textAlign: 'right',
      minHeight: 49,
      minWidth: 55,
    },
    chevron: { color: colors.secondary, fontSize: 21 },
    rateOptions: { flexDirection: 'row', padding: 6, gap: 3 },
    rateOption: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
    },
    rateSelected: { backgroundColor: colors.accentSoft },
    note: { color: colors.secondary, fontSize: 12, lineHeight: 18, paddingHorizontal: 14 },
    inlineAction: { minHeight: 44, justifyContent: 'center' },
    listItem: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 16,
      gap: 12,
    },
    section: {
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 12,
    },
    step: {
      fontSize: 10,
      letterSpacing: 1.5,
      color: colors.accent,
      fontWeight: '700',
    },
    heading: { fontSize: 20, fontWeight: '700', color: colors.text },
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    button: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      minHeight: 44,
      justifyContent: 'center',
    },
    buttonText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
    selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    game: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    results: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 10,
    },
    result: {
      width: '48%',
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      gap: 6,
    },
    resultImage: { width: '100%', height: 140 },
    name: { fontWeight: '700', fontSize: 14, color: colors.text },
    muted: { fontSize: 13, color: colors.secondary, lineHeight: 19 },
    thumb: { width: 44, height: 62 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    preview: {
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.accentSoft,
      gap: 10,
    },
    line: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, gap: 12 },
    priceRow: { flexDirection: 'row', gap: 12 },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    total: { fontSize: 21, fontWeight: '700', color: colors.text },
    details: {
      padding: 12,
      backgroundColor: colors.background,
      borderRadius: 10,
      gap: 12,
    },
    empty: {
      paddingVertical: 24,
      textAlign: 'center',
      color: colors.secondary,
      fontSize: 13,
      lineHeight: 20,
    },
    summary: {
      backgroundColor: colors.surface,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
  });
