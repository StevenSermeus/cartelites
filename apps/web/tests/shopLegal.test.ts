import test from 'node:test';
import assert from 'node:assert/strict';
import { legal, legalInformationReady } from '../src/lib/shopLegal';
import { shopConfig } from '../../../shop.config';

test('legal page uses configured operator and retains incomplete-disclosure notice', () => {
  assert.equal(legal, shopConfig.legal);
  const completed = Object.fromEntries(
    Object.entries(legal).map(([key, value]) => [
      key,
      typeof value === 'boolean' ? true : 'Operator-provided information',
    ]),
  ) as typeof legal;
  assert.equal(legalInformationReady(completed), true);
  assert.equal(legalInformationReady({ ...completed, reviewed: false }), false);
  assert.equal(legalInformationReady({ ...completed, privacyEmail: '' }), false);
});
