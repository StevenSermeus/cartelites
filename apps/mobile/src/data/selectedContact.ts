export type ContactIdentity={_id:string;name:string};
export type ContactLookup<T>={status:'ready';contact:T}|{status:'error';message:string};
/** Resolve only the selected identity; failed or obsolete reads never select a different contact. */
export async function lookupSelectedContact<T extends ContactIdentity>(id:string,read:(id:string)=>Promise<T|null>,isCurrent:()=>boolean,publish:(result:ContactLookup<T>)=>void) {
  try{const contact=await read(id);if(!isCurrent())return;
    if(!contact||contact._id!==id)publish({status:'error',message:'Le contact sélectionné est introuvable. Réessayez ou choisissez explicitement un autre contact.'});
    else publish({status:'ready',contact});
  }catch(reason){if(isCurrent())publish({status:'error',message:`Impossible de charger le contact sélectionné. ${reason instanceof Error?reason.message:'Vérifiez la connexion.'}`});}
}
