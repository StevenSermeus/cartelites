export type StockLotRecord = {
  _id:string;source?:{kind:string;purchaseId?:string;consignmentId?:string;operationId?:string};
  receiptId?:string;openingId?:string;received?:number;remaining?:number;originalQuantity?:number;remainingQuantity?:number;
  totalCostCents?:number|null;originalCostCents?:number|null;remainingCostCents?:number|null;occurredAt?:number;acquiredAt?:number;
  receipt?:{reference?:string;supplier?:string}|null;
};
const nonnegative=(value:unknown):number|null=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
export function lotView(lot:StockLotRecord) {
  const kind=lot.source?.kind??(lot.openingId?'opening':lot.receiptId?'purchase':'legacy');
  return {id:lot._id,label:kind==='opening'?'Lot issu d’une ouverture':kind==='consignment'?'Lot en dépôt-vente':kind==='purchase'?'Lot d’acquisition':'Lot historique',
    reference:lot.receipt?.reference,party:lot.receipt?.supplier,
    sourceId:lot.source?.purchaseId??lot.source?.consignmentId??lot.source?.operationId??lot.openingId??lot.receiptId,
    received:nonnegative(lot.originalQuantity??lot.received),remaining:nonnegative(lot.remainingQuantity??lot.remaining),
    originalCost:nonnegative(lot.originalCostCents===undefined?lot.totalCostCents:lot.originalCostCents),remainingCost:nonnegative(lot.remainingCostCents),
    occurredAt:nonnegative(lot.acquiredAt??lot.occurredAt)};
}
