import {dateFilters} from './dateFilters';
export function giftDateRange(from:string,to:string) {
  if(!from||!to)throw new Error('Choisissez les dates de début et de fin de l’export.');
  const range=dateFilters(from,to);if(range.error)throw new Error(range.error);
  return {from:range.from,to:range.to};
}
export function giftPageQuery(from:string,to:string,cursor?:string|null) {
  const range=giftDateRange(from,to),query=new URLSearchParams();
  if(range.from!==undefined)query.set('from',String(range.from));
  if(range.to!==undefined)query.set('to',String(range.to));
  if(cursor)query.set('cursor',cursor);return query.toString();
}
export async function completeGiftExport<T extends {_id:string}>(read:(cursor?:string)=>Promise<{page:T[];isDone:boolean;continueCursor?:string|null}>,assertActive:()=>void,limit=10000):Promise<T[]> {
  const rows:T[]=[],ids=new Set<string>(),seen=new Set<string>();let cursor:string|undefined;
  for(;;){assertActive();const page=await read(cursor);assertActive();
    for(const row of page.page){if(ids.has(row._id))throw new Error('L’historique a changé pendant l’export. Relancez-le pour obtenir un fichier complet.');ids.add(row._id);rows.push(row);}
    if(rows.length>limit)throw new Error('Réduisez la période (maximum 10 000 dons par export).');
    if(page.isDone)return rows;
    const next=page.continueCursor;if(!next||seen.has(next))throw new Error('Pagination incomplète des dons. Aucun fichier n’a été exporté.');
    seen.add(next);cursor=next;
  }
}
