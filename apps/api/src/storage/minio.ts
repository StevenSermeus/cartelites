import { createHash, createHmac } from 'node:crypto';
import { env } from '../env.js';

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const hmac = (key: string | Buffer, value: string) =>
  createHmac('sha256', key).update(value).digest();
function awsKey(date: string) {
  const dateKey = hmac(`AWS4${env.MINIO_SECRET_KEY}`, date);
  const regionKey = hmac(dateKey, env.MINIO_REGION);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}
function encodePath(path: string) {
  return path
    .split('/')
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

export async function requestMinio(
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  body?: Uint8Array,
  contentType?: string,
) {
  const url = new URL(env.MINIO_ENDPOINT);
  url.pathname = `/${encodePath(env.MINIO_BUCKET)}/${encodePath(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body ?? new Uint8Array());
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = `${method}\n${url.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${date}/${env.MINIO_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signature = createHmac('sha256', awsKey(date)).update(stringToSign).digest('hex');
  const response = await fetch(url, {
    method,
    headers: {
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.MINIO_ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    ...(body ? { body: Buffer.from(body) } : {}),
  });
  return response;
}
