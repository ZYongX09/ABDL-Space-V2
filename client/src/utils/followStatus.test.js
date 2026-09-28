import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFollowStatuses, normalizeFollowIds } from './followStatus.js';

test('normalizeFollowIds keeps unique positive safe integers', () => {
  assert.deepEqual(normalizeFollowIds([1, '2', 1, '2abc', 0, -1, 9007199254740992]), [1, 2]);
});

test('fetchFollowStatuses chunks ids at 99 and merges all responses', async () => {
  const batches = [];
  const result = await fetchFollowStatuses(
    Array.from({ length: 205 }, (_, i) => i + 1),
    async ids => {
      batches.push(ids);
      return Object.fromEntries(ids.map(id => [id, { following: id % 2 === 0 }]));
    },
  );

  assert.deepEqual(batches.map(ids => ids.length), [99, 99, 7]);
  assert.equal(Object.keys(result).length, 205);
  assert.equal(result['200'].following, true);
});

test('fetchFollowStatuses rejects incomplete batches instead of misreporting missing ids', async () => {
  await assert.rejects(
    fetchFollowStatuses([1, 2], async () => ({ 1: { following: true } })),
    /响应不完整/,
  );
});

test('fetchFollowStatuses propagates batch errors without per-id fallback', async () => {
  let calls = 0;
  await assert.rejects(
    fetchFollowStatuses([1, 2, 3], async () => {
      calls++;
      throw new Error('unauthorized');
    }),
    /unauthorized/,
  );
  assert.equal(calls, 1);
});
