/** Staff history transport. Source records remain authoritative; these are read DTOs. */
export const activityHistorySources=['purchases','sales','consignments','payments','events','receipts','gifts','openings'] as const;
export type ActivityHistorySource=typeof activityHistorySources[number];
export type HistoryOrigin='purchase'|'supplier'|'consignment';
export type ActivityHistoryStatus='active'|'pending'|'cancelled'|'open'|'closed'|'recorded';
export interface ActivityHistoryQuery {
 source:ActivityHistorySource;size?:number;cursor?:string;search?:string;from?:number;to?:number;
 status?:'all'|ActivityHistoryStatus;origin?:'all'|HistoryOrigin;
 paymentStatus?:'all'|'received'|'pending'|'unknown';eventKind?:'all'|'return'|'terms';
}
export interface ActivityHistoryRow {
 _id:string;source:ActivityHistorySource;title:string;recordedAt:number;occurredAt:number|null;
 amountCents:number|null;amountStatus:'known'|'unknown'|'detail-required';status:ActivityHistoryStatus;
 origins:HistoryOrigin[];detailsIncomplete:boolean;
 reference?:string;sellerId?:string;sellerName?:string;supplier?:string;itemId?:string;itemName?:string;
 purchaseId?:string;consignmentId?:string;quantity?:number|null;packSize?:number;
 recipient?:string;reason?:string;note?:string;authorizationNote?:string;method?:string;
 kind?:'return'|'terms';paymentStatus?:'received'|'pending'|'unknown';cancelledAt?:number|null;
}
export interface ActivityHistoryPage {items:ActivityHistoryRow[];nextCursor:string|null;isDone:boolean;order:'recorded-desc'}
export interface SalePaymentSnapshot {
 collectionStatus:'received'|'pending'|'unknown';cashCents:number|null;transferCents:number|null;
 receivedAt:number|null;reference:string|null;
}
export interface SalePaymentHistoryRow extends SalePaymentSnapshot {
 id:string;state:'current'|'superseded'|'reversed';kind:'initial'|'revision';
 changedAt:number|null;actorLabel:string|null;previous:SalePaymentSnapshot|null;
}
export interface SalePaymentHistoryPage {
 items:SalePaymentHistoryRow[];nextCursor:string|null;isDone:boolean;
 saleStatus:'active'|'cancelled';current:SalePaymentSnapshot;currentEntryId:string|null;historyStatus:'complete'|'incomplete';
}
