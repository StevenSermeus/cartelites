import assert from 'node:assert/strict';
import test from 'node:test';
import { convexTest } from 'convex-test';
import schema from '../functions/schema';
import { internal } from '../functions/_generated/api';

const modules = {
  './functions/auth.ts': () => import('../functions/auth'),
  './functions/_generated/server.js': () => import('../functions/_generated/server.js'),
};

test('signatory profile persists independently for each account and keeps old accounts compatible', async () => {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => Promise.all(['a', 'b'].map((name) => ctx.db.insert('accounts', {
    email: `${name}@example.com`, passwordHash: 'test-hash', createdAt: 1,
  }))));
  const empty = { firstName: '', lastName: '', capacity: '' };
  assert.deepEqual(await t.query(internal.auth.signatoryProfile, { id: a }), empty);
  await t.mutation(internal.auth.setSignatoryProfile, { id: a, firstName: ' Alice ', lastName: ' Martin ', capacity: ' Administratrice ' });
  assert.deepEqual(await t.query(internal.auth.signatoryProfile, { id: a }), { firstName: 'Alice', lastName: 'Martin', capacity: 'Administratrice' });
  assert.deepEqual(await t.query(internal.auth.signatoryProfile, { id: b }), empty);
  await t.mutation(internal.auth.setSignatoryProfile, { id: b, firstName: 'Jean', lastName: 'Dupont', capacity: 'Mandataire' });
  assert.equal((await t.query(internal.auth.signatoryProfile, { id: a })).firstName, 'Alice');
});

test('invalid signatory changes do not overwrite a saved profile', async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) => ctx.db.insert('accounts', { email: 'a@example.com', passwordHash: 'test', createdAt: 1 }));
  const profile = { firstName: 'Alice', lastName: 'Martin', capacity: 'Administratrice' };
  await t.mutation(internal.auth.setSignatoryProfile, { id, ...profile });
  for (const capacity of ['', '   ', 'x'.repeat(101), 'Admin\nAutre']) {
    await assert.rejects(t.mutation(internal.auth.setSignatoryProfile, { id, ...profile, capacity }));
  }
  assert.deepEqual(await t.query(internal.auth.signatoryProfile, { id }), profile);
});
