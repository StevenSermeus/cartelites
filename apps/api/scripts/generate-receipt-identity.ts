import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
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

// Keep the standalone API build in sync with the shared, platform-neutral PDF renderers.
mkdirSync(new URL('../src/receipts', import.meta.url), { recursive: true });
for (const file of ['signature', 'purchaseReceipt', 'consignmentReceipt', 'consignmentDocument']) {
  const source = readFileSync(
    new URL(`../../../packages/domain/src/${file}.ts`, import.meta.url),
    'utf8',
  );
  writeFileSync(
    new URL(`../src/receipts/${file}.ts`, import.meta.url),
    source.replace(/from (['"])\.\/([^'"]+)\1/g, "from './$2.js'"),
  );
}
