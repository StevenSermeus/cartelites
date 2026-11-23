let active: {currency: string; timezone: string} | null = null;
export function setShopFormatting(value: {currency: string; timezone: string} | null) { active = value; }
export function shopCurrency() { return active?.currency ?? 'EUR'; }
export function shopTimezone() { return active?.timezone ?? 'Europe/Brussels'; }
export function formatShopMoney(amount: number) {
  return new Intl.NumberFormat('fr-BE', {style: 'currency', currency: shopCurrency()}).format(amount);
}
export function formatShopDate(value: number, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('fr-BE', {...options, timeZone: shopTimezone()}).format(new Date(value));
}
