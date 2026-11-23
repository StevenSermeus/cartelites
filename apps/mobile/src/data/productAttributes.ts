export type AttributeRow={id:string;name:string;value:string};
export const attributeRows=(record:Record<string,string>={})=>Object.entries(record).map(([name,value],index)=>({id:`saved:${index}`,name,value}));
export function attributesRecord(rows:AttributeRow[]):Record<string,string> {
 const entries=rows.filter(row=>row.name.trim()||row.value).map(row=>[row.name.trim(),row.value] as const);
 if(entries.length>20)throw new Error('20 propriétés au maximum par section.');
 const keys=new Set<string>();
 for(const [name,value] of entries){
  if(!name||name.length>60||value.length>500)throw new Error('Chaque propriété demande un nom de 1 à 60 caractères et une valeur de 500 caractères au maximum.');
  if(keys.has(name))throw new Error(`La propriété « ${name} » est présente plusieurs fois.`);
  keys.add(name);
 }
 return Object.fromEntries(entries);
}
const metadataFields=['tcg','name','description','series','identifier','language','condition','gradingCompany','gradingGrade','gradingCertificate','askingPriceCents','hiddenFromCatalogue','variant','serialNumber','privateNotes','publicAttributes','privateAttributes'] as const;
/** Only advance photo revisions if every field this editor writes is unchanged on the server. */
export function unchangedMetadata(previous:object,next:object):boolean {
 const normalized=(value:object)=>metadataFields.map(key=>{
  const raw=(value as Record<string,unknown>)[key];
  return raw&&typeof raw==='object'?Object.fromEntries(Object.entries(raw).sort(([a],[b])=>a.localeCompare(b))):raw??'';
 });
 return JSON.stringify(normalized(previous))===JSON.stringify(normalized(next));
}
