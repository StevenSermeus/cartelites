import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCursorPages } from '../src/lib/cursorPages';
test('export exhausts all pages including empty intermediate provider page', async () => {
  const cursors: (string | null)[] = [];
  const result = await collectCursorPages(async (cursor) => {
    cursors.push(cursor);
    return cursor === null
      ? { page: [1], continueCursor: 'a', isDone: false }
      : cursor === 'a'
        ? { page: [], continueCursor: 'b', isDone: false }
        : { page: [2, 3], continueCursor: '', isDone: true };
  });
  assert.deepEqual(result, [1, 2, 3]);
  assert.deepEqual(cursors, [null, 'a', 'b']);
});
test('malformed repeated cursor prevents a partial success export', async () => {
  await assert.rejects(
    collectCursorPages(async () => ({ page: [1], continueCursor: 'a', isDone: false })),
    /export annulé/,
  );
});
test('failure in later page rejects the entire export', async () => {
  await assert.rejects(
    collectCursorPages(async (cursor) => {
      if (cursor) throw new Error('network lost');
      return { page: [1], continueCursor: 'next', isDone: false };
    }),
    /network lost/,
  );
});
