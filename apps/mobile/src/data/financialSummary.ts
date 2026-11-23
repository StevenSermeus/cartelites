/** Submitted money only. Sale line prices already include their quantities. */
export function financialSummary(path:string,body:Record<string,any>) {
  const known=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  const sum=(values:unknown[])=>values.every(known)&&known(values.reduce<number>((total,value)=>total+Number(value),0))?values.reduce<number>((total,value)=>total+Number(value),0):undefined;
  let total: number|undefined, units:number|undefined;
  let label='Montant';
  if(known(body.amountCents))total=body.amountCents;
  else if(known(body.salePriceCents))total=body.salePriceCents;
  if(known(body.quantity))units=body.quantity;
  if(path==='/sales/payment')total=sum([body.cashCents,body.transferCents]);
  if(path==='/consignments/returns/prepare'&&Array.isArray(body.itemIds))units=body.itemIds.length;
  if(Array.isArray(body.items)) {
    units=sum(body.items.map(row=>row.quantity??1));
    const field=path==='/purchases'?'purchasePriceCents':path==='/consignments'?'askingPriceCents':path==='/sales/bulk'?'salePriceCents':null;
    if(field)total=sum(body.items.map(row=>row[field]));
    if(path==='/consignments')label='Prix convenus';
  }
  if(path==='/supplier-receipts'&&Array.isArray(body.lines)) {
    units=sum(body.lines.map(row=>row.quantity));
    total=sum(body.lines.map(row=>known(row.quantity)&&known(row.unitCostCents)?row.quantity*row.unitCostCents:undefined));
    label='Coût total';
  }
  return {total,units,label};
}
