import { publicShopConfig } from '../../../shop.config';
export const shopCurrency = publicShopConfig.currency;
export const shopTimezone = publicShopConfig.timezone;
export const currencySymbol =
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: shopCurrency })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value ?? shopCurrency;
export const formatMoney = (cents: number) =>
  new Intl.NumberFormat('fr-BE', {
    style: 'currency',
    currency: shopCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const formatDate = (value: number | Date) =>
  new Intl.DateTimeFormat('fr-BE', { timeZone: shopTimezone }).format(value);
export function shopDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: shopTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Civil-date inputs represent noon in the shop zone, independent of operator location. */
export function shopDateTimestamp(
  value: string,
  timezone = shopTimezone,
  hour = 12,
  minute = 0,
  second = 0,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date invalide.');
  const [year, month, day] = value.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(utc).toISOString().slice(0, 10) !== value) throw new Error('Date invalide.');
  let candidate = utc;
  for (let n = 0; n < 3; n++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate);
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const represented = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    const difference = utc - represented;
    candidate += difference;
    if (!difference) break;
  }
  return candidate;
}
