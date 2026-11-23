/** Signed-S3 rehearsal fixture, never a production provider. Backup bytes are read-only. */
import {createServer,type IncomingMessage} from 'node:http';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,realpath,unlink} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const hash=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
const hmac=(key:string|Buffer,value:string)=>createHmac('sha256',key).update(value).digest();
function safePath(root:string,key:string){const path=resolve(root,key),rel=relative(root,path);if(!rel||rel==='..'||rel.startsWith('../')||key.includes('\0'))throw new Error('UNSAFE_KEY');return path;}
async function existing(root:string,path:string){try{const actual=await realpath(path);safePath(root,relative(root,actual));return await readFile(actual);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
function authenticated(req:IncomingMessage,body:Buffer,secret:string,accessKey:string){
 const date=String(req.headers['x-amz-date']??''),payload=String(req.headers['x-amz-content-sha256']??''),authorization=String(req.headers.authorization??'');
 if(!/^\d{8}T\d{6}Z$/.test(date)||payload!==hash(body))return false;
 const parsed=Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${date.slice(9,11)}:${date.slice(11,13)}:${date.slice(13,15)}Z`);if(!Number.isFinite(parsed)||Math.abs(Date.now()-parsed)>15*60*1000)return false;
 const scope=`${date.slice(0,8)}/auto/s3/aws4_request`,signed='host;x-amz-content-sha256;x-amz-date';
 const canonical=`${req.method}\n${req.url}\n\nhost:${req.headers.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n\n${signed}\n${payload}`;
 const key=hmac(hmac(hmac(hmac(`AWS4${secret}`,date.slice(0,8)),'auto'),'s3'),'aws4_request');
 const signature=createHmac('sha256',key).update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${hash(canonical)}`).digest('hex');
 const expected=`AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
 return Buffer.byteLength(expected)===Buffer.byteLength(authorization)&&timingSafeEqual(Buffer.from(expected),Buffer.from(authorization));
}
export async function serveObjectFixtures(backup:string,overlay:string){
 const base=await realpath(backup),writeRoot=resolve(overlay),bucket=process.env.R2_BUCKET,secret=process.env.R2_SECRET_ACCESS_KEY,accessKey=process.env.R2_ACCESS_KEY_ID;
 if(!bucket||!secret||!accessKey)throw new Error('Fixture credentials required');
 const temp=await realpath('/tmp');if(!writeRoot.startsWith('/tmp/')&&!writeRoot.startsWith(`${temp}/`))throw new Error('Overlay must be in /tmp');
 await mkdir(writeRoot,{recursive:true,mode:0o700});const root=await realpath(writeRoot);if(root===base||base.startsWith(`${root}/`)||root.startsWith(`${base}/`))throw new Error('Backup and overlay must be separate');
 const server=createServer(async(req,res)=>{try{
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>50*1024*1024){res.writeHead(413).end();return;}chunks.push(Buffer.from(chunk));}const body=Buffer.concat(chunks);
  if(!authenticated(req,body,secret,accessKey)){res.writeHead(403).end('Invalid fixture signature');return;}
  const path=decodeURIComponent(req.url??'');if(!path.startsWith(`/${bucket}/`)||path.includes('?')){res.writeHead(400).end();return;}
  const objectKey=path.slice(bucket.length+2),originalPath=safePath(base,objectKey),overlayPath=safePath(root,objectKey);
  const original=await existing(base,originalPath),written=await existing(root,overlayPath),bytes=original??written;
  if(req.method==='GET'){if(!bytes){res.writeHead(404).end();return;}const type=objectKey.endsWith('.pdf')?'application/pdf':objectKey.endsWith('.webp')?'image/webp':objectKey.endsWith('.png')?'image/png':/\.jpe?g$/.test(objectKey)?'image/jpeg':'application/octet-stream';res.writeHead(200,{'Content-Type':type,'Content-Length':bytes.length,ETag:`"${hash(bytes)}"`}).end(bytes);return;}
  if(req.method==='PUT'){
   if(bytes){if(hash(bytes)!==hash(body)){res.writeHead(409).end('Immutable fixture object');return;}res.writeHead(200).end();return;}
   await mkdir(dirname(overlayPath),{recursive:true,mode:0o700});const parent=await realpath(dirname(overlayPath));if(parent!==root)safePath(root,relative(root,parent));
   try{await writeFile(overlayPath,body,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const raced=await existing(root,overlayPath);if(!raced||hash(raced)!==hash(body)){res.writeHead(409).end();return;}}
   res.writeHead(200).end();return;
  }
  if(req.method==='DELETE'){if(original){res.writeHead(403).end('Original backup is read-only');return;}if(written)await unlink(overlayPath);res.writeHead(204).end();return;}
  res.writeHead(405).end();
 }catch{res.writeHead(400).end('Invalid fixture request');}});
 await new Promise<void>((ok,reject)=>{server.once('error',reject);server.listen(3490,'127.0.0.1',()=>ok());});
 console.log('Signed object fixture listening on http://127.0.0.1:3490; backup read-only, isolated temporary writes. This is not Cloudflare R2.');return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const [backup,overlay]=process.argv.slice(2);if(!backup||!overlay)throw new Error('Usage: serve-object-fixtures.ts read-only-backup /tmp/private-overlay');await serveObjectFixtures(backup,overlay);}
