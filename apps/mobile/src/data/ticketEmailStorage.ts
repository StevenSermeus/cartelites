import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import {TicketEmailLedger,type TicketEmailAttempt} from './ticketEmailAttempt';
export const ticketEmailLedger=new TicketEmailLedger();
const paths=new Map<string,string>(),loads=new Map<string,Promise<void>>(),writes=new Map<string,Promise<void>>();
const listeners=new Set<()=>void>();
export function subscribeTicketEmails(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function ticketEmailsChanged(){for(const listener of listeners)listener();}
export async function loadTicketEmails(owner:string) {
 let promise=loads.get(owner);if(promise)return promise;
 promise=(async()=>{
  const hash=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,owner),directory=`${FileSystem.documentDirectory}ticket-email-attempts/${hash}/`,path=directory+'attempts.json';
  await FileSystem.makeDirectoryAsync(directory,{intermediates:true});paths.set(owner,path);
  if((await FileSystem.getInfoAsync(path)).exists){const payload=JSON.parse(await FileSystem.readAsStringAsync(path));if(payload.version!==1||!Array.isArray(payload.attempts)||payload.attempts.some((row:TicketEmailAttempt)=>!row||typeof row.id!=='string'||typeof row.ticketId!=='string'||typeof row.recipient!=='string'||!['unknown','failed','accepted','stale'].includes(row.status)))throw new Error('Lecture de l’historique local impossible. Les tentatives existantes sont conservées.');ticketEmailLedger.restore(owner,payload.attempts);}
 })();loads.set(owner,promise);
 try{await promise;}catch(error){loads.delete(owner);throw error;}
}
export async function persistTicketEmails(owner:string) {
 await loadTicketEmails(owner);
 const write=(writes.get(owner)??Promise.resolve()).catch(()=>undefined).then(()=>FileSystem.writeAsStringAsync(paths.get(owner)!,JSON.stringify({version:1,attempts:ticketEmailLedger.all(owner)})));
 writes.set(owner,write);await write;ticketEmailsChanged();
}
