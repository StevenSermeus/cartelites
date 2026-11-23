import test from 'node:test';
import assert from 'node:assert/strict';
import {publicConfigRoutes} from '../src/routes/publicConfig.js';
test('public config is explicitly allowlisted and configured local logo can load on API-only instance',async()=>{
 const app=publicConfigRoutes();const response=await app.request('/api/v1/public/shop-config');const config=await response.json();
 assert.deepEqual(Object.keys(config).sort(),['branding','currency','timezone','version']);
 assert.equal(config.version,1);assert.equal(config.legal,undefined);assert.equal(config.registrationPolicy,undefined);
 const logo=await app.request(config.branding.logo);assert.equal(logo.status,200);assert.equal(logo.headers.get('content-type'),'image/png');
 assert.ok((await logo.arrayBuffer()).byteLength>100);assert.equal((await app.request('/branding/legal.ts')).status,404);
});
