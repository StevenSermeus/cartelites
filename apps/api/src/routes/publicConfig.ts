import {OpenAPIHono} from '@hono/zod-openapi';
import {publicAssets} from '../generated/publicAssets.js';
import {publicShopConfig} from '../generated/publicShopConfig.js';
export function publicConfigRoutes(){
 const app=new OpenAPIHono();
 app.get('/branding/*',c=>{
  const asset=publicAssets[c.req.path];if(!asset)return c.notFound();
  c.header('Content-Type',asset.contentType);c.header('X-Content-Type-Options','nosniff');c.header('Cache-Control','public, max-age=3600');
  return c.body(new Uint8Array(Buffer.from(asset.base64,'base64')));
 });
 app.get('/api/public/shop-config',c=>c.json(publicShopConfig));
 app.get('/api/v1/public/shop-config',c=>c.json(publicShopConfig));
 return app;
}
