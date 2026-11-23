export type TicketEmailAttempt={id:string;ticketId:string;recipient:string;status:'unknown'|'failed'|'accepted'|'stale';uncertain?:boolean;updatedAt?:number;released?:boolean;saleIds?:string[]};
export function prepareTicketEmailAttempt(previous:TicketEmailAttempt|null,target:{ticketId:string;recipient:string},newId:()=>string,retryConfirmed=false):TicketEmailAttempt {
 const recipient=target.recipient.trim();
 if(previous?.status==='unknown'||previous?.status==='stale')return previous;
 if(previous?.status==='failed'&&!retryConfirmed)return previous;
 if(previous?.status==='accepted'&&previous.ticketId===target.ticketId&&previous.recipient===recipient)return previous;
 return {id:newId(),ticketId:target.ticketId,recipient,status:'unknown',uncertain:false};
}
export function ticketEmailStatus(value:string):TicketEmailAttempt['status'] {
 return value==='accepted'?'accepted':value==='failed'||value==='EMAIL_DELIVERY_FAILED'?'failed':'unknown';
}
export function ticketEmailErrorStatus(error:unknown):'failed'|'unknown'|'stale' {
 const code=error&&typeof error==='object'&&'code' in error?error.code:undefined;
 if(code==='TICKET_STALE')return 'stale';
 return typeof code==='string'&&['EMAIL_DELIVERY_FAILED','INVALID_EMAIL','EMAIL_DELIVERY_UNAVAILABLE'].includes(code)?'failed':'unknown';
}
/** Later pre-send errors cannot prove what happened during an earlier uncertain send. */
export function failedTicketEmailAttempt(previous:TicketEmailAttempt,error:unknown):TicketEmailAttempt {
 const classified=ticketEmailErrorStatus(error);
 const uncertain=previous.status==='unknown'&&previous.uncertain!==false;
 return {...previous,status:uncertain?'unknown':classified,uncertain:uncertain||classified==='unknown',updatedAt:Date.now()};
}
export function serverTicketEmailAttempts(ticketId:string,rows:unknown[]):TicketEmailAttempt[] {
 return rows.map(value=>{
  const row=value as Record<string,unknown>,id=row.operationId??row.attemptKey;
  if(typeof id!=='string'||!id||typeof row.recipient!=='string')throw new Error('Historique d’envoi incomplet. Aucun nouvel envoi ne peut être confirmé.');
  const status=ticketEmailStatus(String(row.status??row.state??'unknown'));
  return {id,ticketId,recipient:row.recipient,status,uncertain:status==='unknown',updatedAt:typeof row.attemptAt==='number'?row.attemptAt:typeof row.createdAt==='number'?row.createdAt:0};
 });
}
export class TicketEmailLedger {
 private owners=new Map<string,Map<string,TicketEmailAttempt>>();
 private executing=new Set<string>();
 all(owner:string){return [...(this.owners.get(owner)?.values()??[])];}
 put(owner:string,value:TicketEmailAttempt){let rows=this.owners.get(owner);if(!rows)this.owners.set(owner,rows=new Map());rows.set(value.id,{...value});}
 restore(owner:string,values:TicketEmailAttempt[]){for(const value of values)this.put(owner,{...value,uncertain:value.status==='unknown'?true:value.uncertain});}
 reconcile(owner:string,server:TicketEmailAttempt[]){for(const remote of server){const local=this.owners.get(owner)?.get(remote.id);this.put(owner,{...local,...remote,saleIds:local?.saleIds??remote.saleIds,released:local?.released});}}
 current(owner:string,ticketIds:string[],saleIds:string[]):TicketEmailAttempt|null {
  const rows=this.all(owner).filter(row=>!row.released&&(ticketIds.includes(row.ticketId)||row.saleIds?.some(id=>saleIds.includes(id)))).sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0));
  return rows.find(row=>row.status==='unknown')??rows.find(row=>row.status==='stale')??rows[0]??null;
 }
 begin(owner:string,attempt:TicketEmailAttempt){const key=owner+'|'+attempt.id;if(this.executing.has(key))throw new Error('Une vérification de cet envoi est déjà en cours.');this.executing.add(key);}
 end(owner:string,attempt:TicketEmailAttempt){this.executing.delete(owner+'|'+attempt.id);}
 releaseStale(owner:string,id:string){const attempt=this.owners.get(owner)?.get(id);if(!attempt||attempt.status!=='stale'||attempt.uncertain)throw new Error('Vérifiez la tentative incertaine avant de changer de version.');this.put(owner,{...attempt,released:true});}
}
