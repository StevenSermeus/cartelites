import { useState, type Dispatch, type SetStateAction } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Field } from './Field';
import type { PurchaseDraft } from '../data/apiRepository';
import { AttachmentPreview } from './AttachmentPreview';
import type { Tcg } from '../../../../packages/domain/src/riftbound';
const amount = (v: string) => Number(v.replace(',', '.')) || 0;
export const purchaseTotal = (rows: PurchaseDraft[]) =>
  rows
    .filter((r) => r.included)
    .reduce((s, r) => s + Math.round(amount(r.marketValue) * amount(r.discountPercent)), 0) / 100;
const money = (n: number) => `${n.toFixed(2)} €`;
function Button({
  title,
  onPress,
  disabled = false,
  selected = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, selected && s.selected, disabled && { opacity: 0.45 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
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
  changeLanguage: (d: PurchaseDraft, l: 'fr' | 'en' | 'ja') => Promise<void>;
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
  const [expanded, setExpanded] = useState<string | null>(null),
    [manual, setManual] = useState(false),
    [page, setPage] = useState(0);
  const draft = rows.find((r) => !r.included),
    items = rows.filter((r) => r.included);
  const patch = (key: string, v: Partial<PurchaseDraft>) =>
    setRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...v } : r)));
  const identity = (r: PurchaseDraft) => (
    <View style={s.identity}>
      {r.photo?.mimeType.startsWith('image/') ? (
        <Image accessibilityLabel={`Photo personnelle de ${r.name}`} source={{ uri: r.photo.uri }} style={s.thumb} resizeMode="contain" />
      ) : r.catalogueImageUrl ? (
        <Image source={{ uri: r.catalogueImageUrl }} style={s.thumb} resizeMode="contain" />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{r.name}</Text>
        <Text style={s.muted}>
          {r.tcg === 'riftbound' ? 'Riftbound' : 'Pokémon'} · {r.series} · {r.identifier} ·{' '}
          {r.language.toUpperCase()}
        </Text>
      </View>
    </View>
  );
  return (
    <View style={s.workspace}>
      <View style={s.section}>
        <Text style={s.step}>01 · AJOUTER</Text>
        <Text style={s.heading}>Trouvez votre carte</Text>
        {draft && (
          <>
            <View style={s.wrap}>
              {(['pokemon', 'riftbound'] as const).map((tcg) => (
                <Pressable
                  key={tcg}
                  accessibilityRole="button"
                  accessibilityState={{ selected: (draft.tcg ?? 'pokemon') === tcg }}
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
                  <Text style={s.buttonText}>{tcg === 'pokemon' ? 'Pokémon' : 'Riftbound'}</Text>
                </Pressable>
              ))}
            </View>
            <AttachmentPreview current={draft.photo} onUse={(file) => photo(draft.key, file)} />
            {draft.photo?.mimeType.startsWith('image/') && <Image accessibilityLabel="Aperçu de la photo personnelle" source={{ uri: draft.photo.uri }} style={s.thumb} resizeMode="contain" />}
            {draft.photo && <Pressable accessibilityRole="button" onPress={() => photo(draft.key, null)}><Text>Retirer la photo</Text></Pressable>}
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
                <Text style={s.muted}>
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
                            uri: draft.tcg === 'riftbound' ? card.image : `${card.image}/low.webp`,
                          }}
                          style={s.resultImage}
                          resizeMode="contain"
                        />
                      )}
                      <Text style={s.name}>{card.name}</Text>
                      <Text style={s.muted}>
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
                    <Text>
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
                  title="Ajouter au rachat"
                  disabled={draft.searching}
                  onPress={() => {
                    setRows((rows) => [
                      ...rows.map((r) =>
                        r.key === draft.key
                          ? { ...r, included: true, cardResults: [], searching: false }
                          : r,
                      ),
                      {
                        ...fresh(),
                        tcg: draft.tcg,
                        language: draft.tcg === 'riftbound' ? 'en' : 'fr',
                      },
                    ]);
                    setExpanded(null);
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
      <View style={s.section}>
        <Text style={s.step}>02 · VÉRIFIER</Text>
        <Text style={s.heading}>Votre rachat · {items.length} carte(s)</Text>
        {!items.length && (
          <Text style={s.empty}>Ajoutez une carte depuis la recherche ou la saisie manuelle.</Text>
        )}
        {items.map((item) => (
          <View key={item.key} style={s.line}>
            {identity(item)}
            <View style={s.priceRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Valeur (€)"
                  keyboardType="decimal-pad"
                  value={item.marketValue}
                  onChangeText={(v) =>
                    patch(item.key, {
                      marketValue: v,
                      askingPrice: item.askingPriceTouched ? item.askingPrice : v,
                    })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Rachat (%)"
                  keyboardType="decimal-pad"
                  value={item.discountPercent}
                  onChangeText={(v) => patch(item.key, { discountPercent: v })}
                />
              </View>
            </View>
            <View style={s.wrap}>
              {(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const).map((c) => (
                <Button
                  key={c}
                  title={c}
                  selected={item.condition === c}
                  onPress={() => patch(item.key, { condition: c })}
                />
              ))}
            </View>
            <View style={s.between}>
              <Text style={s.muted}>À payer</Text>
              <Text style={s.total}>
                {money(Math.round(amount(item.marketValue) * amount(item.discountPercent)) / 100)}
              </Text>
            </View>
            <View style={s.between}>
              <Button
                title={expanded === item.key ? 'Fermer les détails' : 'Détails'}
                onPress={() => setExpanded(expanded === item.key ? null : item.key)}
              />
              <Button
                title="Retirer"
                onPress={() => setRows((rows) => rows.filter((r) => r.key !== item.key))}
              />
            </View>
            {expanded === item.key && (
              <View style={s.details}>
                <Field
                  label="Nom"
                  value={item.name}
                  onChangeText={(v) => patch(item.key, { name: v })}
                />
                <Field
                  label="Série"
                  value={item.series}
                  onChangeText={(v) => patch(item.key, { series: v })}
                />
                <Field
                  label="Numéro"
                  value={item.identifier}
                  onChangeText={(v) => patch(item.key, { identifier: v })}
                />
                <Text style={s.muted}>Langue</Text>
                <View style={s.wrap}>
                  {(['fr', 'en', 'ja'] as const)
                    .filter(
                      (l) =>
                        (item.tcg !== 'riftbound' || l !== 'ja') &&
                        (!item.catalogueCardId || item.availableLanguages?.includes(l)),
                    )
                    .map((l) => (
                      <Button
                        key={l}
                        title={l.toUpperCase()}
                        selected={item.language === l}
                        onPress={() => void changeLanguage(item, l)}
                      />
                    ))}
                </View>
                <Text style={s.muted}>Gradation</Text>
                <View style={s.wrap}>
                  {(['', 'PSA', 'CollectAura', 'PCA', 'CCC'] as const).map((c) => (
                    <Button
                      key={c}
                      title={c || 'Non gradée'}
                      selected={(item.gradingCompany ?? '') === c}
                      onPress={() =>
                        patch(item.key, {
                          gradingCompany: c || undefined,
                          gradingGrade: '',
                          gradingCertificate: '',
                          gradingNotes: '',
                        })
                      }
                    />
                  ))}
                </View>
                {item.gradingCompany && (
                  <>
                    <Field
                      label="Note"
                      value={item.gradingGrade ?? ''}
                      onChangeText={(v) => patch(item.key, { gradingGrade: v })}
                    />
                    <Field
                      label="Certificat"
                      value={item.gradingCertificate ?? ''}
                      onChangeText={(v) => patch(item.key, { gradingCertificate: v })}
                    />
                    <Field
                      label="Notes de gradation"
                      value={item.gradingNotes ?? ''}
                      onChangeText={(v) => patch(item.key, { gradingNotes: v })}
                    />
                  </>
                )}
                <Field
                  label="Prix de vente proposé (€)"
                  keyboardType="decimal-pad"
                  value={item.askingPriceTouched ? item.askingPrice : item.marketValue}
                  onChangeText={(v) =>
                    patch(item.key, { askingPrice: v, askingPriceTouched: true })
                  }
                />
                <AttachmentPreview current={item.photo} onUse={(file) => {
                  if (file) photo(item.key, file);
                }} />
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
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
  const items = rows.filter((r) => r.included),
    pending = rows.some((r) => !r.included && r.name.trim());
  return (
    <View style={s.summary}>
      <View style={s.between}>
        <Text style={s.muted}>{items.length} carte(s) · Total du rachat</Text>
        <Text style={s.total}>{money(purchaseTotal(rows))}</Text>
      </View>
      <Button
        title={busy ? 'Enregistrement…' : 'Mettre en attente et partager le PDF'}
        disabled={busy || !items.length || !hasClient || pending}
        onPress={save}
      />
      {pending ? (
        <Text style={s.muted}>Ajoutez ou annulez la carte en cours.</Text>
      ) : !hasClient ? (
        <Text style={s.muted}>Sélectionnez un client.</Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  workspace: { gap: 20, marginTop: 20 },
  section: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e1e7ed',
    backgroundColor: '#fff',
    gap: 12,
  },
  step: { fontSize: 10, letterSpacing: 1.5, color: '#55717f', fontWeight: '700' },
  heading: { fontSize: 20, fontWeight: '700', color: '#173449' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7e0e7',
    backgroundColor: '#f7fafc',
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonText: { color: '#173d55', fontSize: 13, fontWeight: '600' },
  selected: { backgroundColor: '#e5f2fa', borderColor: '#377fa9' },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7e0e7',
  },
  results: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  result: {
    width: '48%',
    padding: 10,
    borderWidth: 1,
    borderColor: '#e1e7ed',
    borderRadius: 10,
    gap: 6,
  },
  resultImage: { width: '100%', height: 140 },
  name: { fontWeight: '700', fontSize: 14, color: '#173449' },
  muted: { fontSize: 11, color: '#677b89', lineHeight: 16 },
  thumb: { width: 44, height: 62 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { padding: 12, borderRadius: 10, backgroundColor: '#edf6fb', gap: 10 },
  line: { borderTopWidth: 1, borderColor: '#e1e7ed', paddingTop: 16, gap: 12 },
  priceRow: { flexDirection: 'row', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  total: { fontSize: 21, fontWeight: '700', color: '#173449' },
  details: { padding: 12, backgroundColor: '#f7f9fb', borderRadius: 10, gap: 12 },
  empty: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#677b89',
    fontSize: 13,
    lineHeight: 20,
  },
  summary: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#d7e0e7',
    gap: 8,
  },
});
