import {resolve,relative,extname} from 'node:path';
import { writeFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { publicShopConfig, shopConfig } from '../../../shop.config.ts';
mkdirSync(new URL('../src/generated', import.meta.url), {recursive:true});
writeFileSync(new URL('../src/generated/publicShopConfig.ts', import.meta.url), `// Generated public allowlisted configuration. Never add server secrets here.\nexport const publicShopConfig = ${JSON.stringify(publicShopConfig,null,2)} as const;\n`);

if (!['open','closed'].includes(shopConfig.registrationPolicy)) throw new Error('Invalid registration policy');
writeFileSync(new URL('../src/generated/serverShopConfig.ts', import.meta.url), `// Generated server-only configuration. Never serve this object publicly.\nexport const serverShopConfig: {registrationPolicy: 'open' | 'closed'} = ${JSON.stringify({registrationPolicy:shopConfig.registrationPolicy})};\n`);

// Embed only explicitly configured local public logo assets, so API-only/mobile deployments
// do not depend on the web host or expose arbitrary filesystem paths.
const repo=realpathSync(new URL('../../../',import.meta.url));
const assets:Record<string,{contentType:string;base64:string}>={};
for(const logo of [publicShopConfig.branding.logo,publicShopConfig.branding.logoDark]) {
  if(/^https?:\/\//.test(logo)) continue;
  if(!logo.startsWith('/branding/')) throw new Error('Local logos must be under /branding/');
  const path=realpathSync(resolve(repo,'.'+logo));
  if(relative(resolve(repo,'branding'),path).startsWith('..')) throw new Error('Logo escapes branding directory');
  const type:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
  const contentType=type[extname(path).toLowerCase()];if(!contentType) throw new Error('Unsupported public logo format');
  assets[logo]={contentType,base64:readFileSync(path).toString('base64')};
}
writeFileSync(new URL('../src/generated/publicAssets.ts',import.meta.url),`// Generated allowlisted public assets.\nexport const publicAssets: Record<string,{contentType:string;base64:string}> = ${JSON.stringify(assets)};\n`);

// Shared type contract copied into the standalone API compilation boundary.
writeFileSync(new URL('../src/generated/marketPrices.ts',import.meta.url), '// Generated from packages/domain/src/marketPrices.ts. Do not edit.\n'+readFileSync(new URL('../../../packages/domain/src/marketPrices.ts',import.meta.url),'utf8'));
