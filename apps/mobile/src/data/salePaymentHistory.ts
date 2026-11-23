import type {SalePaymentHistoryPage,SalePaymentSnapshot} from '../../../../packages/domain/src/history';
export function paymentSnapshotTotal(value:SalePaymentSnapshot):number|null {
  return value.cashCents!==null&&value.transferCents!==null&&Number.isSafeInteger(value.cashCents)&&Number.isSafeInteger(value.transferCents)&&Number.isSafeInteger(value.cashCents+value.transferCents)?value.cashCents+value.transferCents:null;
}
export function mergePaymentHistory(current:SalePaymentHistoryPage|null,page:SalePaymentHistoryPage):SalePaymentHistoryPage {
  if(!Array.isArray(page.items)||!page.current||(page.currentEntryId!==null&&typeof page.currentEntryId!=='string')||!['complete','incomplete'].includes(page.historyStatus)||!page.isDone&&!page.nextCursor)throw new Error('Historique des règlements invalide. Réessayez.');
  const rows=new Map(current?.items.map(row=>[row.id,row])??[]);
  for(const row of page.items)rows.set(row.id,row);
  // Current/reversed state can change between pages. Do not leave earlier loaded rows current.
  const items=[...rows.values()].map(row=>row.id===page.currentEntryId
    ?{...row,state:page.saleStatus==='cancelled'?'reversed' as const:'current' as const}
    :row.state==='current'?{...row,state:'superseded' as const}:row);
  return {...page,items,historyStatus:current?.historyStatus==='incomplete'?'incomplete':page.historyStatus};
}
