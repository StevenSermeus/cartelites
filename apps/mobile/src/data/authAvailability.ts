type StatusResponse={ok:boolean;json:()=>Promise<unknown>};
/** Registration fails closed, independently from the existing-account login action. */
export async function loadAuthAvailability(fetchStatus:()=>Promise<StatusResponse>):Promise<boolean> {
 const response=await fetchStatus();
 if(!response.ok)throw new Error('La disponibilité des inscriptions ne peut pas être vérifiée. La connexion reste possible.');
 const data=await response.json();
 if(!data||typeof data!=='object'||!('signupEnabled' in data)||typeof data.signupEnabled!=='boolean')throw new Error('Réponse de disponibilité des inscriptions invalide. La connexion reste possible.');
 return data.signupEnabled;
}
