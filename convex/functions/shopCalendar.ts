import {calendarDay} from '../../packages/domain/src/calendarDay';
import {publicShopConfig} from '../../apps/api/src/generated/publicShopConfig';
/** Business-day comparisons use the configured shop, never the server's local timezone. */
export const shopDay=(value:number)=>calendarDay(value,publicShopConfig.timezone);
