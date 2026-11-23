export function documentVersion(version:unknown):string {
  return typeof version==='number'&&Number.isSafeInteger(version)&&version>0?`Version ${version}`:'Version non renseignée';
}
