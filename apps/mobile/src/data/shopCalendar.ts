import {shopTimezone} from '../theme/shopFormatting';

function parts(value:number,timezone:string) {
  const fields=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value);
  return Object.fromEntries(fields.filter(field=>field.type!=='literal').map(field=>[field.type,Number(field.value)]));
}
export function shopDay(value=Date.now(),timezone=shopTimezone()):string {
  const p=parts(value,timezone);
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
/** Interpret a selected calendar day in the shop, independently of the phone's timezone. */
export function shopDayTimestamp(day:string,hour=12,minute=0,second=0,millisecond=0,timezone=shopTimezone()):number|undefined {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const [year,month,date]=day.split('-').map(Number);
  const target=Date.UTC(year,month-1,date,hour,minute,second,millisecond);
  if(new Date(target).toISOString().slice(0,10)!==day)return;
  let result=target;
  for(let attempt=0;attempt<5;attempt++) {
    const p=parts(result,timezone);
    const observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second,millisecond);
    if(observed===target)return result;
    result+=target-observed;
  }
  // A nonexistent wall-clock time (DST gap or a skipped calendar day) is never silently shifted.
  return;
}
export function shopDayAtTime(day:string,timeSource=Date.now()):number {
  const p=parts(timeSource,shopTimezone());
  const result=shopDayTimestamp(day,p.hour,p.minute,p.second,new Date(timeSource).getMilliseconds());
  if(result===undefined)throw new Error('Cette date ou cette heure n’existe pas dans le fuseau horaire de la boutique.');
  return result;
}
