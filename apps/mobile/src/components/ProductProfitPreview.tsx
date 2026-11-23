import { formatShopMoney } from '../theme/shopFormatting';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { parsePriceInput, priceForMargin, productProfit } from '../data/productProfit';

const money = (value: number) => formatShopMoney(value / 100);

export function ProductProfitPreview({
  cost,
  price,
  rate,
  quantity,
  onPriceChange,
}: {
  cost: string;
  price: string;
  rate: string;
  quantity: string;
  onPriceChange?: (value: string) => void;
}) {
  const { colors } = useTheme();
  const costCents = parsePriceInput(cost),
    priceCents = parsePriceInput(price),
    taxRate = parsePriceInput(rate);
  const count = Number(quantity);
  const validCost = costCents !== null && taxRate !== null && taxRate <= 10000;
  const estimate =
    validCost && priceCents !== null ? productProfit(costCents, priceCents, taxRate, count) : null;
  const threshold = validCost ? priceForMargin(costCents, taxRate, 0) : null;
  const tone = estimate && estimate.profitCents < 0 ? colors.danger : colors.text;
  return (
    <View style={{ backgroundColor: colors.raised, borderRadius: 14, padding: 16, gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
        Estimation du bénéfice
      </Text>
      {estimate ? (
        <>
          <Text
            style={{ color: tone, fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] }}
          >
            {money(estimate.profitCents)} / unité
          </Text>
          <Text style={{ color: colors.secondary }}>
            Coût HT {money(costCents!)} · Vente HT {money(estimate.netCents)}
          </Text>
          <Text style={{ color: colors.text }}>
            Marge sur vente HT :{' '}
            {estimate.marginPercent === null
              ? '—'
              : `${estimate.marginPercent.toFixed(1).replace('.', ',')} %`}
          </Text>
          {count > 1 && (
            <Text style={{ color: colors.text }}>
              Pour {count} unités : {money(estimate.totalProfitCents)}
            </Text>
          )}
          {estimate.profitCents < 0 && (
            <Text style={{ color: colors.danger }}>Ce prix ne couvre pas le coût d’achat.</Text>
          )}
        </>
      ) : (
        <Text style={{ color: colors.secondary }}>
          Renseignez le coût HT, le prix TTC, la TVA et la quantité pour voir le bénéfice.
        </Text>
      )}
      {threshold !== null && (
        <Text style={{ color: colors.text }}>Prix couvrant l’achat : {money(threshold)} TTC</Text>
      )}
      {validCost && costCents > 0 && onPriceChange && (
        <>
          <Text style={{ color: colors.secondary }}>Choisir une marge sur vente HT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[20, 30, 40].map((margin) => (
              <Pressable
                key={margin}
                accessibilityRole="button"
                accessibilityLabel={`Appliquer un prix avec ${margin} % de marge sur vente HT`}
                onPress={() => {
                  const suggested = priceForMargin(costCents, taxRate!, margin);
                  if (suggested !== null) onPriceChange((suggested / 100).toFixed(2));
                }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  borderRadius: 10,
                  backgroundColor: colors.accentSoft,
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{margin} %</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Text style={{ color: colors.secondary, fontSize: 13 }}>
        Bénéfice brut estimé après TVA, hors frais, commissions et autres charges. Total si toutes
        les unités sont vendues à ce prix.
      </Text>
    </View>
  );
}
