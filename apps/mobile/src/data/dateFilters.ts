export function dateFilters(fromText: string, toText: string) {
  function parse(text: string, end: boolean) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
    const [year, month, day] = text.split("-").map(Number);
    const date = new Date(`${text}T${end ? "23:59:59.999" : "00:00:00"}`);
    return Number.isFinite(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
      ? date.getTime()
      : undefined;
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
