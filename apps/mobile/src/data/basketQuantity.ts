export function basketMaximum(origin:string|undefined,available:number|undefined):number {
  const maximum=origin==='supplier'?available??0:available===0?0:1;
  return Number.isSafeInteger(maximum)&&maximum>=0?maximum:0;
}
export function basketQuantity(selected:boolean,raw:string|undefined,maximum:number) {
  const quantity=selected?Number(raw??'1'):0;
  const valid=Number.isSafeInteger(quantity)&&quantity>=0;
  return {quantity:valid?quantity:null,label:valid&&quantity<=maximum?String(quantity):'?',canAdd:maximum>0&&(!valid||quantity<maximum),canRemove:selected};
}
export function nextBasketQuantity(selected:boolean,raw:string|undefined,maximum:number,delta:1|-1):number {
  const current=basketQuantity(selected,raw,maximum).quantity;
  // Explicit +/- recovers an invalid quantity typed in the review form without propagating NaN.
  return Math.max(0,Math.min(maximum,(current??0)+delta));
}
