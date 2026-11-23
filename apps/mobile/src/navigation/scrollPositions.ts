/** Each mounted native scene owns its offset; hidden events cannot reset another scene. */
export class ScrollPositions {
  private offsets=new Map<string,number>();
  read(key:string){return this.offsets.get(key)??0;}
  record(key:string,offset:number,active=true){if(active&&Number.isFinite(offset)&&offset>=0)this.offsets.set(key,offset);}
  clear(){this.offsets.clear();}
}

export class ScrollRestoration {
  private key:string;
  private pending=true;
  private offset:number;
  constructor(private positions:ScrollPositions,key:string){this.key=key;this.offset=positions.read(key);}
  activate(key:string){this.key=key;this.offset=this.positions.read(key);this.pending=true;}
  target(){return this.pending?this.offset:undefined;}
  restored(){this.pending=false;}
  record(offset:number,active:boolean){this.positions.record(this.key,offset,active&&!this.pending);}
}

export function sceneScrollKey(page:string,step:number,purchaseId:string|null,saleId:string|null) {
  if(page==='purchase')return `purchase:${step}`;
  if(page==='purchaseDetail')return `purchaseDetail:${purchaseId??''}`;
  if(page==='saleDetail')return `saleDetail:${saleId??''}`;
  return page;
}
