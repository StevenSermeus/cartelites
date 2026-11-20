import assert from 'node:assert/strict';
import test from 'node:test';
import { sendBrevoEmail, EmailDeliveryError } from '../src/email/brevo.js';
const config = { apiKey: 'test-secret', fromEmail: 'documents@example.com', fromName: 'Boutique' };
const message = { to: 'client@example.com', subject: 'Document signé', html: '<p>Document</p>' };
test('Brevo accepts the transactional payload and exact PDF bytes without exposing a public storage URL', async () => {
  const pdf = Buffer.from('%PDF-1.4\nexample');
  const result = await sendBrevoEmail(
    config,
    { ...message, attachments: [{ filename: 'document.pdf', content: pdf }] },
    async (url, init) => {
      assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
      assert.equal(new Headers(init?.headers).get('api-key'), config.apiKey);
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.sender, { email: config.fromEmail, name: 'Boutique' });
      assert.deepEqual(body.to, [{ email: message.to }]);
      assert.equal(body.htmlContent, message.html);
      assert.deepEqual(Buffer.from(body.attachment[0].content, 'base64'), pdf);
      assert.equal(body.attachment[0].url, undefined);
      return Response.json({ messageId: 'brevo-1' }, { status: 201 });
    },
  );
  assert.deepEqual(result, { messageId: 'brevo-1' });
});
test('missing configuration never calls Brevo', async () => {
  let called = false;
  await assert.rejects(
    sendBrevoEmail({ ...config, apiKey: '' }, message, async () => {
      called = true;
      return new Response();
    }),
    /EMAIL_DELIVERY_UNAVAILABLE/,
  );
  assert.equal(called, false);
});
test('quota/auth failures and uncertain network errors are explicit and do not leak response data', async () => {
  for (const status of [401, 429, 500]) {
    await assert.rejects(
      sendBrevoEmail(
        config,
        message,
        async () => new Response('private-email-and-key', { status }),
      ),
      (error) =>
        error instanceof EmailDeliveryError &&
        error.status === status &&
        !error.message.includes('private'),
    );
  }
  await assert.rejects(
    sendBrevoEmail(config, message, async () => {
      throw new Error('secret');
    }),
    (error) =>
      error instanceof EmailDeliveryError &&
      !error.message.includes('secret') &&
      error.status === undefined,
  );
  await assert.rejects(
    sendBrevoEmail(config, message, async () => Response.json({})),
    EmailDeliveryError,
  );
});
