export type ActivityKind='acquisition'|'sale'|'sale-cancellation'|'gift'|'gift-reversal'|'opening'|'opening-reversal'|'consignment-return'|'consignment-terms'|'purchase-correction'|'opening-balance';
export type ItemActivity={id:string;kind:ActivityKind|string;occurredAt:number|null;quantityDelta:number|null;source:{type:string;id:string};reference?:string;counterpartItemId?:string;reversesId?:string;lotId?:string};
export type ItemActivityPage={items:ItemActivity[];nextCursor:string|null;isDone:boolean;historyStatus:'complete'|'indexing'|'incomplete'};
export type StockLot={id:string;originalQuantity:number|null;remainingQuantity:number|null;originalCostCents:number|null;remainingCostCents:number|null;occurredAt:number|null;sourceKind:string;sourceId?:string;reference?:string;supplier?:string;openingBalanceOnly:boolean};
const record=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Réponse de traçabilité invalide.');
  return value as Record<string,unknown>;
};
const text=(value:unknown)=>typeof value==='string'&&value.length?value:undefined;
const alias=(row:Record<string,unknown>,canonical:string,legacy:string)=>Object.hasOwn(row,canonical)?row[canonical]:row[legacy];
function nonnegative(value:unknown):number|null {
  if(value===null||value===undefined)return null;
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Quantité ou coût de lot incohérent.');
  return value;
}
function date(value:unknown):number|null {
  if(value===null||value===undefined)return null;
  if(typeof value!=='number'||!Number.isFinite(new Date(value).getTime()))throw new Error('Date de traçabilité invalide.');
  return value;
}
export function stockLot(value:unknown):StockLot {
  const row=record(value),id=text(row._id);if(!id)throw new Error('Lot sans identifiant.');
  const source=row.source?record(row.source):{},receipt=row.receipt?record(row.receipt):{};
  const sourceKind=source.kind==='purchase'&&receipt.type==='supplier'?'supplier':text(source.kind)??(row.openingId?'opening':row.receiptId||row.receipt?'supplier':'unknown');
  return {id,sourceKind,sourceId:text(source.purchaseId)??text(source.consignmentId)??text(source.operationId)??text(row.openingId)??text(row.receiptId),
    originalQuantity:nonnegative(alias(row,'originalQuantity','received')),remainingQuantity:nonnegative(alias(row,'remainingQuantity','remaining')),
    originalCostCents:nonnegative(alias(row,'originalCostCents','totalCostCents')),remainingCostCents:nonnegative(row.remainingCostCents),
    occurredAt:date(alias(row,'acquiredAt','occurredAt')),reference:text(receipt.reference),supplier:text(receipt.supplier),openingBalanceOnly:row.openingBalanceOnly===true};
}
export function stockLots(value:unknown):StockLot[] {
  const rows=record(value).lots;if(!Array.isArray(rows))throw new Error('Liste des lots invalide.');return rows.map(stockLot);
}
export function itemActivityPage(value:unknown):ItemActivityPage {
  const row=record(value);
  if(!Array.isArray(row.items)||!(row.nextCursor===null||typeof row.nextCursor==='string')||typeof row.isDone!=='boolean'||!['complete','indexing','incomplete'].includes(String(row.historyStatus)))throw new Error('Page des mouvements invalide.');
  if(!row.isDone&&!row.nextCursor)throw new Error('Le curseur des mouvements est manquant.');
  const items=row.items.map(value=>{
    const event=record(value),source=record(event.source),id=text(event.id),kind=text(event.kind),sourceId=text(source.id),sourceType=text(source.type);
    if(!id||!kind||!sourceId||!sourceType||!(event.quantityDelta===null||(typeof event.quantityDelta==='number'&&Number.isSafeInteger(event.quantityDelta))))throw new Error('Mouvement de stock invalide.');
    return {id,kind,source:{type:sourceType,id:sourceId},occurredAt:date(event.occurredAt),quantityDelta:event.quantityDelta as number|null,reference:text(event.reference),counterpartItemId:text(event.counterpartItemId),reversesId:text(event.reversesId),lotId:text(event.lotId)};
  });
  return {items,nextCursor:row.nextCursor as string|null,isDone:row.isDone,historyStatus:row.historyStatus as ItemActivityPage['historyStatus']};
}
const labels:Record<ActivityKind,string>={'acquisition':'Entrée en stock','sale':'Vente','sale-cancellation':'Annulation de vente','gift':'Don / cadeau','gift-reversal':'Annulation de don','opening':'Ouverture de display','opening-reversal':'Annulation d’ouverture','consignment-return':'Restitution au déposant','consignment-terms':'Révision de l’accord','purchase-correction':'Correction du rachat','opening-balance':'Solde initial repris'};
export const movementLabel=(kind:string)=>labels[kind as ActivityKind]??'Mouvement historique';
export function quantityChangeLabel(quantity:number|null){return quantity===null?'Variation non renseignée':quantity===0?'Quantité inchangée':`${quantity>0?'+':''}${quantity} unité(s)`;}
export function lotOriginLabel(lot:StockLot){return lot.openingBalanceOnly?'Solde initial repris':({purchase:'Rachat',supplier:'Achat fournisseur',consignment:'Dépôt-vente',opening:'Ouverture de display','opening-balance':'Solde initial repris'} as Record<string,string>)[lot.sourceKind]??'Origine historique';}
export const activitySourceLabel=(type:string)=>({purchases:'Acquisition',supplierReceipts:'Facture fournisseur',consignments:'Dépôt-vente',sales:'Vente',stockGifts:'Don',stockOpenings:'Ouverture de display',consignmentEvents:'Événement de dépôt',stockOperations:'Opération de stock'} as Record<string,string>)[type]??'Document source';
export function nextActivityCursor(page:ItemActivityPage|null,cursors:(string|undefined)[]) {return !page||page.isDone||!page.nextCursor||cursors.includes(page.nextCursor)?null:page.nextCursor;}
export function previousActivityPage(cursors:(string|undefined)[]){return cursors.length>1?cursors.slice(0,-1):cursors;}
export function nextActivityPage(cursors:(string|undefined)[],cursor:string|null){return cursor&&!cursors.includes(cursor)?[...cursors,cursor]:cursors;}
