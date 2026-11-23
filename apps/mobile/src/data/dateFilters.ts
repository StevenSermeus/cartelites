import {shopDayTimestamp} from './shopCalendar';
export function dateFilters(fromText: string, toText: string) {
  function parse(text: string, end: boolean) {
    return shopDayTimestamp(text,end?23:0,end?59:0,end?59:0,end?999:0);
  }
  const from = parse(fromText, false),
    to = parse(toText, true);
  const error =
    (fromText && from === undefined) || (toText && to === undefined)
      ? "Saisissez une date valide au format AAAA-MM-JJ."
      : from !== undefined && to !== undefined && from > to
        ? "La date de début doit précéder la date de fin."
        : "";
  return { from: error ? undefined : from, to: error ? undefined : to, error };
}
