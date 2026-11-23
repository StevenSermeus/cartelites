import type {MarketMoney,MarketListing} from '../../../../packages/domain/src/marketPrices';
export function formatMarketMoney(value:MarketMoney|null):string {
  if(!value)return 'Non renseigné';
  try {
    const formatter=new Intl.NumberFormat('fr-BE',{style:'currency',currency:value.currency});
    return formatter.format(value.amountMinor/10**(formatter.resolvedOptions().maximumFractionDigits??2));
  } catch {return `${value.amountMinor} unités mineures (${value.currency})`;}
}
export function marketPriceLabel(listing:MarketListing):string {
  if(listing.priceBasis==='accepted_offer_unknown')return 'Offre acceptée · montant final non communiqué';
  const label={asking:'Prix demandé',current_bid:'Enchère en cours',provider_sold:'Prix de vente déclaré par la source',unknown:'Nature du prix non confirmée',accepted_offer_unknown:''}[listing.priceBasis];
  const amount=listing.priceRange?`${formatMarketMoney(listing.priceRange.minimum)} – ${formatMarketMoney(listing.priceRange.maximum)}`:formatMarketMoney(listing.price);
  return `${label} : ${amount}`;
}
export function safeMarketUrl(value:string):boolean {try{return new URL(value).protocol==='https:';}catch{return false;}}
