import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTicketEmailAttempt,ticketEmailStatus,ticketEmailErrorStatus,failedTicketEmailAttempt,serverTicketEmailAttempts,TicketEmailLedger,type TicketEmailAttempt} from '../src/data/ticketEmailAttempt';
const target={ticketId:'ticket',recipient:'qa@example.invalid'};
test('confirmed failure needs explicit retry and a fresh operation ID',()=>{
 const failed:TicketEmailAttempt={...target,id:'first',status:'failed'};
 assert.equal(prepareTicketEmailAttempt(failed,target,()=>{throw new Error('No approval');}),failed);
 assert.deepEqual(prepareTicketEmailAttempt(failed,target,()=> 'second',true),{...target,id:'second',status:'unknown',uncertain:false});
 assert.equal(ticketEmailStatus('failed'),'failed');assert.equal(ticketEmailStatus('EMAIL_DELIVERY_FAILED'),'failed');
});
test('unknown, network and provider errors keep the operation and original recipient',()=>{
 const pending:TicketEmailAttempt={...target,id:'first',status:'unknown'};
 const changed={ticketId:'another-ticket',recipient:'another@example.invalid'};
 assert.equal(prepareTicketEmailAttempt(pending,changed,()=>{throw new Error('No duplicate');},true),pending);
 for(const status of ['EMAIL_RESULT_UNKNOWN','Network failure','sending','queued','EMAIL_DELIVERY_UNAVAILABLE'])assert.equal(ticketEmailStatus(status),'unknown');
});
test('accepted sends do not repeat for the same ticket and recipient',()=>{
 const accepted:TicketEmailAttempt={...target,id:'first',status:'accepted'};
 assert.equal(prepareTicketEmailAttempt(accepted,target,()=>{throw new Error('No duplicate');}),accepted);
 assert.equal(prepareTicketEmailAttempt(accepted,{...target,recipient:'next@example.invalid'},()=> 'second').id,'second');
});
test('stable API codes distinguish known non-delivery from translated or ambiguous server failures',()=>{
 for(const code of ['EMAIL_DELIVERY_FAILED','INVALID_EMAIL','EMAIL_DELIVERY_UNAVAILABLE'])assert.equal(ticketEmailErrorStatus(Object.assign(new Error('Message traduit'),{code,status:503})),'failed');
 for(const error of [new Error('EMAIL_DELIVERY_FAILED'),Object.assign(new Error('Message traduit'),{code:'EMAIL_RESULT_UNKNOWN',status:502}),{status:503},new Error('Network timeout')])assert.equal(ticketEmailErrorStatus(error),'unknown');
});

test('stale rejection permits explicit release only before any uncertain result',()=>{
 const ledger=new TicketEmailLedger();
 const sent=prepareTicketEmailAttempt(null,target,()=> 'one');
 const stale=failedTicketEmailAttempt(sent,{code:'TICKET_STALE'});
 assert.equal(stale.status,'stale');ledger.put('owner',stale);
 assert.equal(prepareTicketEmailAttempt(stale,{...target,ticketId:'new'},()=> 'two'),stale);
 ledger.releaseStale('owner','one');assert.equal(ledger.current('owner',['ticket'],[]),null);
 const unknown=failedTicketEmailAttempt(sent,new Error('lost response'));
 for(const code of ['TICKET_STALE','INVALID_EMAIL','EMAIL_DELIVERY_UNAVAILABLE','EMAIL_DELIVERY_FAILED']) {
  const retry=failedTicketEmailAttempt(unknown,{code});assert.equal(retry.status,'unknown');ledger.put('owner',retry);assert.throws(()=>ledger.releaseStale('owner','one'));
 }
});
test('recovery across versions and remount retains destination, account isolation and execution lock',()=>{
 const ledger=new TicketEmailLedger();const original={...target,id:'one',status:'unknown' as const,uncertain:false,saleIds:['sale']};
 ledger.restore('shop/account-a',[original]);
 const restored=ledger.current('shop/account-a',['new-ticket'],['sale'])!;
 assert.equal(restored.uncertain,true);assert.equal(restored.recipient,target.recipient);
 assert.equal(ledger.current('shop/account-b',['ticket'],['sale']),null);
 assert.equal(ledger.current('another-shop/account-a',['ticket'],['sale']),null);
 ledger.begin('shop/account-a',restored);assert.throws(()=>ledger.begin('shop/account-a',restored));ledger.end('shop/account-a',restored);ledger.begin('shop/account-a',restored);
});
test('authoritative server history resolves the same uncertain attempt without another send',()=>{
 const ledger=new TicketEmailLedger();ledger.restore('owner',[{...target,id:'one',status:'unknown',saleIds:['sale']}]);
 const canonical=serverTicketEmailAttempts('ticket',[{attemptKey:'one',recipient:target.recipient,state:'accepted',attemptAt:42}]);
 ledger.reconcile('owner',canonical);const resolved=ledger.current('owner',['ticket'],['sale'])!;
 assert.equal(resolved.status,'accepted');assert.equal(resolved.updatedAt,42);assert.deepEqual(resolved.saleIds,['sale']);
 assert.equal(prepareTicketEmailAttempt(resolved,target,()=>{throw Error('duplicate');}),resolved);
 assert.equal(serverTicketEmailAttempts('ticket',[{operationId:'legacy',recipient:'old@example.invalid',status:'failed',createdAt:10}])[0].status,'failed');
 assert.throws(()=>serverTicketEmailAttempts('ticket',[{status:'sending'}]));
});
