import type {ActivityHistoryQuery,ActivityHistorySource,ActivityHistoryStatus,ActivityHistoryRow} from '../../../../packages/domain/src/history';
import {dateFilters} from './dateFilters';

export type HistoryFilters = {search:string;from:string;to:string;status:NonNullable<ActivityHistoryQuery['status']>;origin:NonNullable<ActivityHistoryQuery['origin']>;paymentStatus:NonNullable<ActivityHistoryQuery['paymentStatus']>;eventKind:NonNullable<ActivityHistoryQuery['eventKind']>};
export const emptyHistoryFilters = ():HistoryFilters => ({search:'',from:'',to:'',status:'all',origin:'all',paymentStatus:'all',eventKind:'all'});
export const historyStatusLabels:Record<ActivityHistoryStatus,string>={active:'Actif',pending:'En attente',cancelled:'Annulé',open:'Ouvert',closed:'Clôturé',recorded:'Enregistré'};
export function historyFilterQuery(value:HistoryFilters) {
  const dates=dateFilters(value.from,value.to);
  // Invalid dates must never silently broaden a query to all business records.
  if(dates.error)return {params:null,error:dates.error};
  return {params:{search:value.search.trim()||undefined,from:dates.from,to:dates.to,status:value.status,origin:value.origin,paymentStatus:value.paymentStatus,eventKind:value.eventKind},error:''};
}
/** The shared readModels sales query has no eventKind argument. */
export function salesHistoryQuery(value:HistoryFilters) {
  const result=historyFilterQuery(value);
  if(!result.params)return {params:null,error:result.error};
  const {eventKind,...params}=result.params;
  return {params,error:''};
}
export function historyFilterCount(value:HistoryFilters) {
  return Number(!!value.from)+Number(!!value.to)+Number(value.status!=='all')+Number(value.origin!=='all')+Number(value.paymentStatus!=='all')+Number(value.eventKind!=='all');
}
export function historyQueryString(value:HistoryFilters,cursor?:string|null) {
  const {params,error}=historyFilterQuery(value);if(!params)throw new Error(error);
  const query=new URLSearchParams({size:'25'});
  for(const [key,item] of Object.entries(params))if(item!==undefined&&item!=='all')query.set(key,String(item));
  if(cursor)query.set('cursor',cursor);
  return query.toString();
}
export type HistoryFilterOptions={statuses:ActivityHistoryStatus[];origins?:('purchase'|'supplier'|'consignment')[];payment?:boolean;events?:boolean};
export const saleHistoryOptions:HistoryFilterOptions={statuses:['active','cancelled'],origins:['purchase','supplier','consignment'],payment:true};
export function activityFilterOptions(source:ActivityHistorySource|'all'):HistoryFilterOptions {
  if(source==='all')return {statuses:[]};
  if(source==='sales')return saleHistoryOptions;
  if(source==='purchases')return {statuses:['pending','active','cancelled']};
  if(source==='consignments')return {statuses:['pending','open','closed']};
  if(source==='gifts')return {statuses:['active','cancelled'],origins:['purchase','supplier']};
  if(source==='openings')return {statuses:['active','cancelled']};
  return {statuses:[],events:source==='events'};
}
/** Keep common filters when changing categories; unsupported server filters must not leak. */
export function changeHistorySource(value:HistoryFilters):HistoryFilters {
  return {...emptyHistoryFilters(),search:value.search,from:value.from,to:value.to};
}

export function activityRowStatus(row:Pick<ActivityHistoryRow,'status'|'paymentStatus'>):string {
  if(row.status==='cancelled')return historyStatusLabels.cancelled;
  return row.paymentStatus==='pending'?'À encaisser':historyStatusLabels[row.status];
}
