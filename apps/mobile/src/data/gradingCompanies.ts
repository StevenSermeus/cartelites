export type GradingCompanyRecord={_id:string;name:string;revision:number;abbreviation?:string;website?:string;archivedAt?:number};
export type GradingCompanyDraft={name:string;abbreviation:string;website:string};
export const gradingDraft=(row?:GradingCompanyRecord):GradingCompanyDraft=>({name:row?.name??'',abbreviation:row?.abbreviation??'',website:row?.website??''});
export function gradingPayload(draft:GradingCompanyDraft,original?:GradingCompanyRecord,archived=original?.archivedAt!==undefined) {
  const name=draft.name.trim(),abbreviation=draft.abbreviation.trim(),website=draft.website.trim();
  if(!name||name.length>100||/[\x00-\x1f]/.test(name))throw new Error('Indiquez un nom de 1 à 100 caractères.');
  if(abbreviation.length>30)throw new Error('L’abréviation est limitée à 30 caractères.');
  if(website){let url:URL;try{url=new URL(website);}catch{throw new Error('Indiquez une adresse HTTPS valide.');}if(url.protocol!=='https:'||!url.hostname||/\s/.test(website))throw new Error('Indiquez une adresse HTTPS valide.');}
  if(original&&(!Number.isSafeInteger(original.revision)||original.revision<1))throw new Error('Version du répertoire inconnue. Rechargez la société.');
  return {name,abbreviation:abbreviation||undefined,website:website||undefined,...(original?{expectedRevision:original.revision,archived}:{})};
}
export function gradingFailure(reason:unknown) {
  const code=reason&&typeof reason==='object'&&'code' in reason?String(reason.code):'';
  const messages:Record<string,string>={REVISION_CONFLICT:'Cette société a été modifiée ailleurs. Votre saisie est conservée. Rechargez puis examinez la version actuelle.',GRADING_COMPANY_EXISTS:'Une société porte déjà ce nom. Actualisez le répertoire pour la sélectionner.',GRADING_COMPANY_NOT_FOUND:'Cette société n’est plus disponible. Actualisez le répertoire.',INVALID_GRADING_WEBSITE:'Indiquez une adresse HTTPS valide.',INVALID_GRADING_COMPANY:'Vérifiez le nom et les informations de la société.'};
  return messages[code]??(reason instanceof Error?reason.message:'Répertoire indisponible. Réessayez.');
}
