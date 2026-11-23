/** ISO calendar date in an explicit shop timezone, for date-granularity business rules.
 * This intentionally does not alter stored instants, expiry clocks, or archived document text.
 */
const formatters=new Map<string,Intl.DateTimeFormat>();
export function calendarDay(value:number,timeZone:string):string {
 if(!Number.isSafeInteger(value)||!Number.isFinite(new Date(value).getTime()))throw new RangeError('INVALID_DATE');
 let formatter=formatters.get(timeZone);
 if(!formatter){
  if(!timeZone)throw new RangeError('INVALID_TIME_ZONE');
  formatter=new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  if(formatters.size>=32)formatters.delete(formatters.keys().next().value!);
  formatters.set(timeZone,formatter);
 }
 const parts=formatter.formatToParts(value),part=(type:string)=>parts.find(value=>value.type===type)!.value;
 return `${part('year').padStart(4,'0')}-${part('month')}-${part('day')}`;
}
