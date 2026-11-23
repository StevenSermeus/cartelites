import { shopConfig } from '../../../../shop.config';

export const legal = shopConfig.legal;
export function legalInformationReady(value: typeof legal) {
  return (
    value.reviewed &&
    [
      value.updatedAt,
      value.country,
      value.companyName,
      value.legalForm,
      value.address,
      value.registration,
      value.vatNumber,
      value.email,
      value.phone,
      value.hostName,
      value.hostAddress,
      value.hostContact,
      value.privacyEmail,
      value.legalBases,
      value.retention,
      value.processors,
      value.transfers,
      value.cookieLifetime,
    ].every((field) => field.trim().length > 0)
  );
}
export const legalReady = legalInformationReady(legal);
