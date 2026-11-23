import type {ActivityHistoryRow,ActivityHistoryPage,ActivityHistorySource} from '../../../../packages/domain/src/history';
export const activitySources = [
  {id:'purchases', label:'Rachats'},
  {id:'sales', label:'Ventes'},
  {id:'consignments', label:'Dépôts'},
  {id:'payments', label:'Versements'},
  {id:'events', label:'Retours et accords'},
  {id:'receipts', label:'Achats fournisseur'},
  {id:'gifts', label:'Dons'},
  {id:'openings', label:'Ouvertures'},
] as const;
export type ActivitySource = ActivityHistorySource;
export type ActivityRecord = ActivityHistoryRow;
export type ActivityEntry = {key:string; source:ActivitySource; date:number|null; record:ActivityRecord};
export type ActivityPage = ActivityHistoryPage;
export type ActivityState = {entries:ActivityEntry[]; cursors:Partial<Record<ActivitySource,string|null>>; done:ActivitySource[]};
export const emptyActivity = ():ActivityState => ({entries:[],cursors:{},done:[]});
/** A source cursor orders recording times, never missing business dates. Only loaded rows are merged. */
export function mergeActivity(state:ActivityState, source:ActivitySource, page:ActivityPage):ActivityState {
  if(page.order!=='recorded-desc'||!Array.isArray(page.items)||page.items.some(row=>row.source!==source||typeof row._id!=='string'||!Number.isFinite(row.recordedAt)||(row.occurredAt!==null&&!Number.isFinite(row.occurredAt))))throw new Error('Réponse d’activité invalide. Réessayez le chargement.');
  if(!page.isDone&&!page.nextCursor)throw new Error('La page suivante est indisponible. Actualisez l’activité.');
  const entries=new Map(state.entries.map(entry=>[entry.key,entry]));
  for(const record of page.items) {
    const key=`${source}:${record._id}`;
    entries.set(key,{key,source,date:record.occurredAt,record});
  }
  return {entries:[...entries.values()].sort((a,b)=>b.record.recordedAt-a.record.recordedAt||a.key.localeCompare(b.key)),
    cursors:{...state.cursors,[source]:page.nextCursor},done:page.isDone?[...new Set([...state.done,source])]:state.done.filter(id=>id!==source)};
}
/** Changes invalidate in-flight reads even if a previous category is selected again. */
export class HistoryRequestGeneration {
  private generation=0;
  invalidate(){return ++this.generation;}
  current(){return this.generation;}
  accepts(value:number){return value===this.generation;}
}
