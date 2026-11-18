import { writeFileSync } from 'node:fs';
import { brand } from '../../../branding/brand.ts';
import { legal } from '../../../branding/legal.ts';
import { receiptLogoData } from '../../../branding/receiptLogoData.ts';

const { companyName, legalForm, address, country, registration, vatNumber, email, website } = legal;
const identity = {
  brand: { name: brand.name, colors: brand.colors },
  legal: { companyName, legalForm, address, country, registration, vatNumber, email, website },
  logo: receiptLogoData,
};
writeFileSync(
  new URL('../src/receiptIdentity.ts', import.meta.url),
  `// Generated from branding by scripts/generate-receipt-identity.ts.\nexport const receiptIdentity = ${JSON.stringify(identity)};\n`,
);
