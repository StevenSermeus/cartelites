import {formatShopMoney} from '../theme/shopFormatting';
export type NullableCost = number | null | undefined;
export function formatCost(cents:NullableCost):string {return cents==null?'Coût non renseigné':formatShopMoney(cents/100);}
export function totalKnownCost(values:NullableCost[]):number|null {
 if(values.some(value=>value==null||!Number.isSafeInteger(value)))return null;
 const total=values.reduce<number>((sum,value)=>sum+value!,0);
 return Number.isSafeInteger(total)?total:null;
}
/** An explicitly unknown amount must not fall through to another, unrelated monetary field. */
export function recordAmount(record:Record<string,unknown>,fields:string[]):number|null|undefined {
 const field=fields.find(key=>Object.hasOwn(record,key));
 if(!field)return undefined;
 const value=record[field];
 return typeof value==='number'&&Number.isSafeInteger(value)?value:null;
}
export function purchaseEditValuation(item:{purchasePriceCents:NullableCost;marketValueCents?:number|null;discountPercent?:number|null}) {
 const value=item.marketValueCents??item.purchasePriceCents;
 return {marketValue:value==null?'':(value/100).toFixed(2),discountPercent:item.purchasePriceCents==null?'':String(item.marketValueCents==null?100:item.discountPercent??(item.marketValueCents?item.purchasePriceCents/item.marketValueCents*100:100))};
}
export function costCsv(cents: NullableCost): string {
  return cents == null ? 'Non renseigné' : (cents / 100).toFixed(2);
}
export function summarizeGiftCosts(rows: {costCents?: number | null; cancelledAt?: number}[]) {
  return rows.filter(row => !row.cancelledAt).reduce((total, row) => row.costCents == null
    ? {...total, unknownCount: total.unknownCount + 1}
    : {...total, knownCents: total.knownCents + row.costCents}, {knownCents: 0, unknownCount: 0});
}
