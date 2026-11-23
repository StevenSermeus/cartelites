import test from 'node:test';
import assert from 'node:assert/strict';
import {SubmittedAttempts,financialAttachmentTarget,isFinancialPath,type AttemptScope} from '../src/data/submittedAttempt';

const scope=(owner='shop-a/account-a'):AttemptScope=>({owner,accountId:owner.split('/')[1],assertActive(){}});
const failure=(status:number,code:string)=>Object.assign(new Error('Localized error'),{status,code});

test('lost response freezes complete basket, timestamps, mixed payment and UUID despite edited form',async()=>{
  const vault=new SubmittedAttempts(),owner=scope();
  const payload={operationId:'original',occurredAt:42,items:[{itemId:'first',quantity:2,salePriceCents:4000}],payment:{cashCents:1500,transferCents:2500}};
  const attempt=vault.prepare(owner,'/sales/bulk',payload),sent:string[]=[];
  let commits=0;
  const server=new Map<string,unknown>();
  await assert.rejects(vault.execute(owner,attempt,async(_path,body)=>{sent.push(body);server.set(JSON.parse(body).operationId,{ids:['sale-1']});commits++;throw new TypeError('response lost');}));
  payload.items[0].quantity=9;payload.payment.cashCents=0;
  assert.throws(()=>vault.prepare(owner,'/sales/bulk',{...payload,operationId:'new'}),/déjà été envoyée/);
  const result=await vault.execute(owner,attempt,async(_path,body)=>{sent.push(body);return server.get(JSON.parse(body).operationId);});
  assert.deepEqual(result,{ids:['sale-1']});assert.equal(commits,1);assert.equal(sent[0],sent[1]);assert.equal(JSON.parse(sent[1]).items[0].quantity,2);
});

test('uncertainty remains latched across later 401, 404, 429 and business 409',async()=>{
  for(const [status,code] of [[401,'INVALID_SESSION'],[404,'ITEM_NOT_FOUND'],[429,'RATE_LIMIT'],[409,'PAYMENT_EXCEEDS_BALANCE'],[409,'PURCHASE_CHANGED'],[409,'SALE_CANCELLED']] as const){
    const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/consignments/payments',{operationId:'payout',amountCents:500});
    await assert.rejects(vault.execute(owner,attempt,async()=>{throw new Error('network failure');}));
    await assert.rejects(vault.execute(owner,attempt,async()=>{throw failure(status,code);}));
    assert.equal(attempt.state,'unknown');assert.throws(()=>vault.release(owner,attempt.path),/incertain/);
  }
});

test('known initial rejection requires explicit release before a corrected request can be prepared',async()=>{
  const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/stock/donate',{operationId:'gift-1',quantity:5});
  await assert.rejects(vault.execute(owner,attempt,async()=>{throw failure(400,'INVALID_INVENTORY');}));
  assert.equal(attempt.state,'rejected');assert.throws(()=>vault.prepare(owner,attempt.path,{operationId:'gift-2'}));
  vault.release(owner,attempt.path);const next=vault.prepare(owner,attempt.path,{operationId:'gift-2',quantity:1});assert.notEqual(next.body,attempt.body);
});

test('idempotency conflict and server errors never prove non-commit',async()=>{
  for(const [status,code] of [[409,'IDEMPOTENCY_KEY_REUSED'],[400,'OPERATION_ID_CONFLICT'],[500,'INTERNAL_ERROR']] as const){
    const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/stock/open',{operationId:'opening'});
    await assert.rejects(vault.execute(owner,attempt,async()=>{throw failure(status,code);}));assert.equal(attempt.state,'unknown');
  }
});

test('pending owner data survives logout, remains hidden from other accounts and instances, and rejects stale transport',async()=>{
  const vault=new SubmittedAttempts();let epoch=1;
  const captured={...scope(),assertActive(){if(epoch!==1)throw new Error('scope changed');}};
  const attempt=vault.prepare(captured,'/purchases',{operationId:'purchase',items:[{operationId:'item-1'}]});
  epoch=2;
  assert.equal(vault.list('shop-a/account-b').length,0);assert.equal(vault.list('shop-b/account-a').length,0);
  let sends=0;
  await assert.rejects(vault.execute(captured,attempt,async()=>{sends++;return {};}),/scope changed/);
  await assert.rejects(vault.execute(scope('shop-a/account-b'),attempt,async()=>{sends++;return {};}),/MISMATCH/);
  assert.equal(sends,0);
  assert.equal(vault.list(scope().owner)[0],attempt);
  await vault.execute(scope(),attempt,async()=>({purchaseId:'p',itemIds:['i']}));assert.equal(attempt.state,'confirmed');
});

test('late acknowledgement is retained but cannot update a replaced UI scope',async()=>{
  const vault=new SubmittedAttempts();let active=true;
  const owner={...scope(),assertActive(){if(!active)throw new Error('stale UI');}};
  const attempt=vault.prepare(owner,'/supplier-receipts',{operationId:'receipt'});
  await assert.rejects(vault.execute(owner,attempt,async()=>{active=false;return {result:{id:'receipt-1',itemIds:['item-1']}};}),/stale UI/);
  assert.equal(attempt.state,'confirmed');let sends=0;
  await vault.execute(scope(),attempt,async()=>{sends++;return {};});assert.equal(sends,0);
});

test('global recovery resets original form before releasing slot; refresh failure cannot replay confirmed commit',async()=>{
  const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/sales/bulk',{operationId:'sale'});
  let commits=0,formHasSubmission=true;
  await vault.execute(owner,attempt,async()=>{commits++;return {ids:['sale-1']};});
  await assert.rejects(Promise.resolve().then(()=>{throw new Error('refresh failed');}));
  assert.equal(attempt.state,'confirmed');
  assert.throws(()=>vault.prepare(owner,attempt.path,{operationId:'second'}));
  assert.throws(()=>vault.finishRecovery(owner,attempt,()=>{throw new Error('cannot close form');}));
  assert.equal(vault.list(owner.owner).length,1);
  vault.finishRecovery(owner,attempt,()=>{assert.equal(vault.list(owner.owner).length,1);formHasSubmission=false;});
  if(formHasSubmission)await vault.execute(owner,vault.prepare(owner,attempt.path,{operationId:'bad-second'}),async()=>{commits++;return {};});
  assert.equal(commits,1);assert.equal(vault.list(owner.owner).length,0);
});

test('original purchase line files, supplier invoice and gift evidence keep exact target mappings',async()=>{
  const vault=new SubmittedAttempts(),owner=scope();
  const context={purchaseDraftId:'draft-1',files:[{target:'itemId' as const,index:1,file:{uri:'original://photo',name:'second.webp',mimeType:'image/webp'},operationId:'photo-key'}]};
  const attempt=vault.prepare(owner,'/purchases',{operationId:'purchase',items:[{operationId:'first'},{operationId:'second'}]},context);
  context.files[0].file.uri='edited://different';context.files[0].index=0;
  const photo=attempt.context.files![0];
  assert.equal(photo.file.uri,'original://photo');assert.equal(financialAttachmentTarget({itemIds:['item-a','item-b']},photo),'item-b');
  assert.equal(financialAttachmentTarget({result:{id:'receipt',itemIds:['stock']}},{...photo,target:'supplierReceiptId'}),'receipt');
  assert.equal(financialAttachmentTarget({result:'gift'},{...photo,target:'giftId'}),'gift');
  await vault.execute(owner,attempt,async()=>({purchaseId:'p',itemIds:['item-a','item-b']}));
  assert.throws(()=>vault.finishRecovery(owner,attempt,()=>{}),/NOT_FINISHED/);
  photo.uploaded=true;vault.finishRecovery(owner,attempt,()=>{});assert.equal(vault.list(owner.owner).length,0);
});

test('concurrent retry cannot send a second request',async()=>{
  const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/stock/open',{operationId:'opening'});
  let resolve!:(value:unknown)=>void,sends=0;
  const pending=vault.execute(owner,attempt,()=>{sends++;return new Promise(done=>{resolve=done;});});
  await assert.rejects(vault.execute(owner,attempt,async()=>{sends++;return {}; }),/déjà en cours/);
  resolve({id:'opening'});await pending;assert.equal(sends,1);
});

test('correction, cancellation and return preparation replay the original identity without triggering signature',async()=>{
  const paths=['/sales/payment','/sales/cancel','/consignments/returns/prepare','/purchases/purchase-1/edit'];
  for(const path of paths){
    assert.equal(isFinancialPath(path),true);
    const vault=new SubmittedAttempts(),owner=scope();
    const original={operationId:'original',saleId:'sale-1',cashCents:500,transferCents:1000,itemIds:['original-item'],conditionNotes:'original-condition',items:[{operationId:'original-line',name:'Card'}]};
    const attempt=vault.prepare(owner,path,original),sent:{path:string;body:string}[]=[];
    await assert.rejects(vault.execute(owner,attempt,async(path,body)=>{sent.push({path,body});throw new Error('lost acknowledgement');}));
    assert.throws(()=>vault.prepare(owner,path,{...original,operationId:'replacement',cashCents:1500,itemIds:['different-item']}));
    await vault.execute(owner,attempt,async(path,body)=>{sent.push({path,body});return {id:'original-result',itemIds:['original-item']};});
    assert.deepEqual(sent[0],sent[1]);assert.equal(sent.length,2);
    assert.equal(JSON.parse(sent[1].body).items[0].operationId,'original-line');
    assert.equal(sent.some(row=>row.path.includes('/sign')),false);
  }
  assert.equal(isFinancialPath('/receipts/original/sign'),false);
});
test('known correction rejection permits explicit repair without weakening an earlier uncertain request',async()=>{
  for(const code of ['PURCHASE_CHANGED','PURCHASE_ITEM_LOCKED','PURCHASE_TOO_LARGE','ITEM_UNAVAILABLE_AT_DATE','SALE_CANCELLED','RETURN_BEFORE_DEPOSIT']){
    const vault=new SubmittedAttempts(),owner=scope(),attempt=vault.prepare(owner,'/purchases/id/edit',{operationId:'edit'});
    await assert.rejects(vault.execute(owner,attempt,async()=>{throw failure(409,code);}));assert.equal(attempt.state,'rejected');
    vault.release(owner,attempt.path);assert.equal(vault.list(owner.owner).length,0);
  }
});

function durableFixture() {
  const disk = new Map<string, import('../src/data/submittedAttempt').SubmittedAttempt>();
  let fail = false;
  const storage: import('../src/data/submittedAttempt').AttemptStorage = {
    async load(owner) { return [...disk.values()].filter(row => row.owner === owner).map(row => structuredClone(row)); },
    async save(attempt) {
      if (fail) throw new Error('disk full');
      disk.set(JSON.stringify([attempt.owner, attempt.context.purchaseDraftId]), structuredClone(attempt));
    },
  };
  return {disk, storage, failWrites: () => {fail = true;}};
}

test('purchase restart replays immutable write-ahead identity and original photos after lost acknowledgement', async () => {
  const {storage, disk} = durableFixture(), owner = scope();
  const first = new SubmittedAttempts(storage);
  const payload = {operationId:'purchase-original', occurredAt:123, items:[{operationId:'line-original', name:'Original', purchasePriceCents:500}]};
  const context = {purchaseDraftId:'draft-original', files:[{target:'itemId' as const,index:0,file:{uri:'durable://original',name:'card.jpg',mimeType:'image/jpeg'},operationId:'photo-original'}]};
  const attempt = await first.preparePersisted(owner, '/purchases', payload, context);
  const sent: string[] = [];
  await assert.rejects(first.execute(owner, attempt, async (_path, body) => {
    assert.equal([...disk.values()][0].body, body); // Durable before transport.
    assert.equal([...disk.values()][0].unresolved, true);
    sent.push(body); throw new Error('committed, response lost');
  }));
  payload.items[0].name = 'Edited'; context.files[0].file.uri = 'cache://different';
  const restarted = new SubmittedAttempts(storage);
  await restarted.load(owner);
  const recovered = restarted.list(owner.owner)[0];
  await assert.rejects(restarted.preparePersisted(owner, '/purchases', {operationId:'new'}, context));
  await assert.rejects(restarted.execute(owner, recovered, async () => {throw failure(401,'INVALID_SESSION');}));
  assert.equal(recovered.state,'unknown');
  const result = await restarted.execute(owner, recovered, async (_path, body) => {sent.push(body); return {purchaseId:'original-id',itemIds:['original-line-id']};});
  assert.deepEqual(result,{purchaseId:'original-id',itemIds:['original-line-id']});
  assert.equal(sent[0],sent[1]);
  assert.equal(recovered.context.files![0].file.uri,'durable://original');
  assert.equal(recovered.context.files![0].operationId,'photo-original');
});

test('purchase storage failure prevents POST and instance/account recovery remains isolated', async () => {
  const fixture = durableFixture(), vault = new SubmittedAttempts(fixture.storage), owner = scope();
  const attempt = await vault.preparePersisted(owner,'/purchases',{operationId:'first'},{purchaseDraftId:'draft'});
  fixture.failWrites(); let sends = 0;
  await assert.rejects(vault.execute(owner,attempt,async () => {sends++;return {}; }),/disk full/);
  assert.equal(sends,0);
  for (const other of [scope('shop-b/account-a'), scope('shop-a/account-b')]) {
    const restarted = new SubmittedAttempts(fixture.storage); await restarted.load(other);
    assert.equal(restarted.list(other.owner).length,0);
    await assert.rejects(restarted.execute(other,attempt,async () => {sends++;return {}; }));
  }
  assert.equal(sends,0);
});

test('confirmed tombstone prevents duplicate when draft deletion was interrupted; exact draft is restored for cleanup', async () => {
  const {storage} = durableFixture(), owner = scope(), vault = new SubmittedAttempts(storage);
  const attempt = await vault.preparePersisted(owner,'/purchases',{operationId:'original'},{purchaseDraftId:'original-draft'});
  await vault.execute(owner,attempt,async () => ({purchaseId:'recorded',itemIds:[]}));
  await vault.releasePersisted(owner,'/purchases');
  const restarted = new SubmittedAttempts(storage); await restarted.load(owner);
  assert.equal(restarted.list(owner.owner).length,0);
  await assert.rejects(restarted.preparePersisted(owner,'/purchases',{operationId:'duplicate'},{purchaseDraftId:'original-draft'}));
  const recovered = restarted.list(owner.owner)[0]; let sends = 0;
  assert.deepEqual(await restarted.execute(owner,recovered,async () => {sends++;return {}; }),{purchaseId:'recorded',itemIds:[]});
  assert.equal(sends,0); assert.equal(recovered.context.purchaseDraftId,'original-draft');
  await restarted.releasePersisted(owner,'/purchases');
  const next = await restarted.preparePersisted(owner,'/purchases',{operationId:'legitimate-new'},{purchaseDraftId:'other-draft'});
  assert.equal(JSON.parse(next.body).operationId,'legitimate-new');
});

test('known initial purchase rejection can be explicitly released and corrected after restart', async () => {
  const {storage} = durableFixture(), owner = scope(), vault = new SubmittedAttempts(storage);
  const attempt = await vault.preparePersisted(owner,'/purchases',{operationId:'rejected'},{purchaseDraftId:'draft'});
  await assert.rejects(vault.execute(owner,attempt,async () => {throw failure(400,'INVALID_PURCHASE');}));
  await vault.releasePersisted(owner,'/purchases');
  const restarted = new SubmittedAttempts(storage);
  const corrected = await restarted.preparePersisted(owner,'/purchases',{operationId:'corrected'},{purchaseDraftId:'draft'});
  assert.equal(JSON.parse(corrected.body).operationId,'corrected');
});
