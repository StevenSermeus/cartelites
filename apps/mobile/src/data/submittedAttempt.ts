export type AttemptState = 'unknown' | 'rejected' | 'confirmed';
export type AttemptScope = { owner: string; accountId: string; assertActive: () => void };
export type AttemptContext = { purchaseDraftId?: string; files?: { target: 'itemId' | 'supplierReceiptId' | 'giftId'; index?: number; file: {uri:string;name:string;mimeType:string}; operationId: string; uploaded?: boolean }[] };
export type SubmittedAttempt = {
  owner: string; path: string; body: string; context: AttemptContext;
  closed?: boolean; state: AttemptState; unresolved: boolean; executing: boolean; result?: unknown; error?: string;
};

export interface AttemptStorage {
  load(owner: string): Promise<SubmittedAttempt[]>;
  save(attempt: SubmittedAttempt): Promise<void>;
}
/** Purchases have a durable write-ahead record; other operations remain session-local. */
export class SubmittedAttempts {
  constructor(private storage?: AttemptStorage) {}
  private loaded = new Map<string, Promise<void>>();
  private history = new Map<string, SubmittedAttempt[]>();
  async load(scope: AttemptScope) {
    if (!this.storage) return;
    let pending = this.loaded.get(scope.owner);
    if (!pending) {
      pending = this.storage.load(scope.owner).then(rows => {
        this.history.set(scope.owner, rows);
        let attempts = this.owners.get(scope.owner);
        if (!attempts) this.owners.set(scope.owner, attempts = new Map());
        for (const row of rows.filter(row => !row.closed)) {
          row.executing = false;
          if (attempts.has(row.path)) throw new Error('Plusieurs rachats à vérifier.');
          attempts.set(row.path, row);
        }
        this.changed();
      });
      this.loaded.set(scope.owner, pending);
    }
    await pending; scope.assertActive();
  }
  async preparePersisted(scope: AttemptScope, path: string, payload: unknown, context: AttemptContext) {
    await this.load(scope);
    if (path === '/purchases' && this.storage) {
      if (!context.purchaseDraftId) throw new Error('Brouillon de rachat introuvable.');
      const previous = this.history.get(scope.owner)?.find(row => row.context.purchaseDraftId === context.purchaseDraftId && !(row.closed && row.state === 'rejected'));
      if (previous && !this.list(scope.owner).some(row => row.path === path)) {
        previous.closed = false;
        this.owners.get(scope.owner)!.set(path, previous); this.changed();
      }
    }
    return this.prepare(scope, path, payload, context);
  }
  async persist(attempt: SubmittedAttempt, beforeSend = false) {
    if (!this.storage || attempt.path !== '/purchases') return;
    await this.storage.save({...attempt, executing: false, unresolved: beforeSend || attempt.unresolved});
    const rows = this.history.get(attempt.owner) ?? [];
    const index = rows.findIndex(row => row.context.purchaseDraftId === attempt.context.purchaseDraftId);
    if (index >= 0) rows[index] = attempt; else rows.push(attempt);
    this.history.set(attempt.owner, rows);
  }
  async releasePersisted(scope: AttemptScope, path: string) {
    scope.assertActive();
    const attempt = this.list(scope.owner).find(row => row.path === path);
    if (attempt?.executing || attempt?.state === 'unknown') throw new Error('Le résultat reste incertain.');
    if (attempt) { await this.persist({...attempt, closed: true}); scope.assertActive(); }
    this.release(scope, path);
  }
  private owners = new Map<string, Map<string, SubmittedAttempt>>();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; };
  changed = () => {for (const listener of this.listeners) listener();};
  list(owner: string) { return [...(this.owners.get(owner)?.values() ?? [])]; }
  prepare(scope: AttemptScope, path: string, payload: unknown, context: AttemptContext = {}) {
    scope.assertActive();
    let attempts = this.owners.get(scope.owner);
    if (!attempts) this.owners.set(scope.owner, attempts = new Map());
    if (attempts.has(path)) throw new Error('Une opération a déjà été envoyée. Ouvrez « Opérations à vérifier » avant tout nouvel envoi.');
    const attempt: SubmittedAttempt = {owner:scope.owner,path,body:JSON.stringify(payload),context:JSON.parse(JSON.stringify(context)),state:'unknown',unresolved:false,executing:false};
    attempts.set(path,attempt); this.changed(); return attempt;
  }
  async execute<T>(scope: AttemptScope, attempt: SubmittedAttempt, send: (path:string,body:string,scope:AttemptScope)=>Promise<T>): Promise<T> {
    scope.assertActive();
    if (scope.owner !== attempt.owner || this.owners.get(scope.owner)?.get(attempt.path) !== attempt) throw new Error('RECOVERY_ACCOUNT_MISMATCH');
    if (attempt.executing) throw new Error('Une vérification est déjà en cours.');
    if (attempt.state === 'confirmed') return attempt.result as T;
    attempt.executing=true; attempt.state='unknown'; this.changed();
    try {
      await this.persist(attempt, true);
      scope.assertActive();
      const result = await send(attempt.path, attempt.body, scope);
      // Keep an acknowledged commit even when the originating UI has disappeared.
      attempt.result=result; attempt.state='confirmed'; attempt.unresolved=false; attempt.error=undefined;
      await this.persist(attempt);
      scope.assertActive();
      return result;
    } catch (error) {
      if (attempt.state !== 'confirmed') {
        const {status,code} = (typeof error==='object'&&error!==null?error:{}) as {status?:number;code?:string};
        const businessRejection=status===409 && /^(INVALID_|PAYMENT_EXCEEDS_BALANCE$|INSUFFICIENT_BALANCE$|ITEM_UNAVAILABLE$|ITEM_UNAVAILABLE_AT_DATE$|ITEM_NOT_AVAILABLE$|ITEM_STATE_INVALID$|SALE_CONFLICT$|SALE_CANCELLED$|PRICE_BELOW_AGREEMENT$|SALE_BELOW_AGREED_PRICE$|SALE_BEFORE_|PURCHASE_NOT_|PURCHASE_CHANGED$|PURCHASE_ITEM_LOCKED$|PURCHASE_TOO_LARGE$|RETURN_BEFORE_DEPOSIT$|CONSIGNMENT_.*REQUIRED$|REVISION_CONFLICT$)/.test(code??'');
        const rejected=typeof status==='number' && ([400,401,403,404,422,429].includes(status)||businessRejection) && !/IDEMPOT|REPLAY|OPERATION.*CONFLICT/.test(code??'');
        if (rejected && !attempt.unresolved) attempt.state='rejected';
        else {attempt.state='unknown';attempt.unresolved=true;}
      }
      attempt.error=error instanceof Error?error.message:'Résultat inconnu.';
      await this.persist(attempt).catch(() => undefined);
      throw error;
    } finally {attempt.executing=false;this.changed();}
  }
  release(scope: AttemptScope, path: string) {
    scope.assertActive();
    const attempts=this.owners.get(scope.owner), attempt=attempts?.get(path);
    if (attempt?.executing || attempt?.state==='unknown') throw new Error('Le résultat reste incertain. Vérifiez la même opération avant de continuer.');
    attempts?.delete(path);this.changed();
  }
  finishRecovery(scope:AttemptScope,attempt:SubmittedAttempt,resetOwnedForms:()=>void) {
    scope.assertActive();
    if(attempt.owner!==scope.owner || attempt.state!=='confirmed' || attempt.context.files?.some(file=>!file.uploaded))throw new Error('RECOVERY_NOT_FINISHED');
    // The original form must be cleared before its slot can accept a new UUID.
    resetOwnedForms();scope.assertActive();this.release(scope,attempt.path);
  }
}

export function financialAttachmentTarget(result:unknown,photo:NonNullable<AttemptContext['files']>[number]) {
  const response=result as {result?:unknown};
  const value=(response?.result??response) as {id?:string;itemIds?:string[]}|string;
  const id=photo.target==='itemId' ? (typeof value==='object'?value.itemIds?.[photo.index??0]:undefined) : typeof value==='string'?value:value.id;
  if(!id)throw new Error('Article du fichier introuvable. L’opération reste enregistrée.');
  return id;
}

export const financialPaths = new Set(['/purchases','/sales','/sales/bulk','/supplier-receipts','/stock/donate','/stock/open','/consignments','/consignments/payments','/sales/payment','/sales/cancel','/consignments/returns/prepare']);
export const isFinancialPath=(path:string)=>financialPaths.has(path)||/^\/purchases\/[^/]+\/edit$/.test(path);

