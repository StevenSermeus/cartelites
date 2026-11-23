export type ConflictLine={itemId:string;name:string;quantity:number};
export type SaleConflictIssue={code:string;conflictId?:string;lines:ConflictLine[]};
export type CurrentStock={_id:string;name:string;status:string;origin?:string;quantity?:number;sourceStatus?:string;contractPending?:boolean};
export function saleConflictIssue(error:unknown,lines:ConflictLine[]):SaleConflictIssue|null {
  if(!error||typeof error!=='object')return null;
  const value=error as {status?:number;code?:string;conflictId?:unknown};
  if(value.status!==409||!['SALE_CONFLICT','ITEM_UNAVAILABLE','ITEM_NOT_AVAILABLE','ITEM_STATE_INVALID','ITEM_UNAVAILABLE_AT_DATE'].includes(value.code??''))return null;
  return {code:value.code!,conflictId:typeof value.conflictId==='string'&&value.conflictId?value.conflictId:undefined,lines:lines.map(line=>({...line}))};
}
export function conflictItemId(value:unknown):string|null {
  if(!value||typeof value!=='object')return null;
  const row=value as {itemId?:unknown;stockItemId?:unknown};
  return typeof row.itemId==='string'?row.itemId:typeof row.stockItemId==='string'?row.stockItemId:null;
}
export function stockConflictReason(line:ConflictLine,current:CurrentStock|null):string|null {
  if(!current)return 'Article introuvable dans le stock actuel.';
  if(current._id!==line.itemId)return 'La fiche reçue ne correspond pas à cet article.';
  if(current.status!=='available')return 'Cet article n’est plus disponible.';
  if(current.sourceStatus&&current.sourceStatus!=='active')return 'L’acquisition n’est plus active.';
  if(current.contractPending)return 'Le contrat du dépôt doit être signé avant la vente.';
  const available=current.quantity??(current.origin==='supplier'?null:1);
  if(available===null||!Number.isSafeInteger(available))return 'Quantité disponible inconnue. Vérifiez la fiche avant de vendre.';
  return available<line.quantity?`${line.quantity} unité(s) demandée(s), ${available} actuellement disponible(s).`:null;
}
/** A known rejection may be corrected. A prior lost response stays recovery-only. */
export function canCorrectSaleAttempt(attempt:{state:string;executing:boolean;unresolved:boolean}|undefined) {
  return !!attempt&&attempt.state==='rejected'&&!attempt.executing&&!attempt.unresolved;
}
