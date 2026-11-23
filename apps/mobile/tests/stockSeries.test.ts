import test from 'node:test';
import assert from 'node:assert/strict';
import {subscribeStockSeries} from '../src/data/stockSeriesSubscription';

test('series subscription drops successes and errors after account or instance changes', async () => {
  let active = true;
  let value!: (labels: string[]) => void;
  let error!: (reason: Error) => void;
  let disposed = false;
  const results: unknown[] = [];
  const stop = subscribeStockSeries(async () => ({assertActive() { if (!active) throw new Error('stale'); }}),
    (onValue, onError) => { value = onValue; error = onError; return () => {disposed = true;}; },
    (labels, failure) => results.push({labels, failure}));
  await Promise.resolve();
  value(['Écarlate et Violet']);
  active = false;
  value(['Old account']); error(new Error('Old error'));
  assert.deepEqual(results, [{labels: ['Écarlate et Violet'], failure: ''}]);
  stop(); assert.equal(disposed, true);
});

test('changing game or closing editor before account lookup prevents a late subscription', async () => {
  let resolve!: (scope: {assertActive: () => void}) => void;
  let subscriptions = 0;
  const stop = subscribeStockSeries(() => new Promise(done => {resolve = done;}),
    () => {subscriptions++; return () => {};}, () => assert.fail('late result'));
  stop(); resolve({assertActive() {}}); await Promise.resolve();
  assert.equal(subscriptions, 0);
});

test('current errors clear stale options and disposed callbacks cannot repopulate them', async () => {
  let value!: (labels: string[]) => void;
  let error!: (reason: Error) => void;
  const results: unknown[] = [];
  const stop = subscribeStockSeries(async () => ({assertActive() {}}),
    (onValue, onError) => {value = onValue; error = onError; return () => {};},
    (labels, failure) => results.push({labels, failure}));
  await Promise.resolve();
  value(['Origins']); error(new Error('Offline')); stop(); value(['Late']);
  assert.deepEqual(results, [{labels: ['Origins'], failure: ''}, {labels: [], failure: 'Offline'}]);
});
