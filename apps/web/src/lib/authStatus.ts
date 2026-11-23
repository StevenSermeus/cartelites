export type AuthStatus = {authenticated:boolean;signupEnabled:boolean;accountId?:string};
/** Only a valid explicit signed-out response can invalidate a verified identity. */
export function parseAuthStatus(value:unknown):AuthStatus {
  if(!value||typeof value!=='object')throw new Error('Réponse de session invalide. Réessayez.');
  const row=value as Record<string,unknown>;
  if(typeof row.authenticated!=='boolean'||typeof row.signupEnabled!=='boolean'||row.authenticated&&(typeof row.accountId!=='string'||!row.accountId.trim()))
    throw new Error('Réponse de session invalide. Réessayez.');
  return {authenticated:row.authenticated,signupEnabled:row.signupEnabled,...(row.authenticated?{accountId:row.accountId as string}:{})};
}
