import test from 'node:test';
import assert from 'node:assert/strict';
import * as planning from '../lib/api/planning.ts';

function mockFetch(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ path: new URL(url).pathname.replace('/api/v1', '') + new URL(url).search, ...init });
    const next = responses.shift();
    assert.ok(next, 'unexpected network call');
    return Response.json(next.body ?? next, { status: next.httpStatus ?? 200 });
  });
  return calls;
}

test('prediction run sends explicit production date then reads both exact filtered lists', async t => {
  const calls = mockFetch(t, [{}, { count: 0, items: [] }, { count: 0, items: [] }]);
  const result = await planning.runPlanningPrediction({ date: '2026-11-01', batch_id: 'BATCH-1' }, 'planner', ['plan.decide']);
  assert.deepEqual(JSON.parse(calls[0].body), { production_date: '2026-11-01', batch_id: 'BATCH-1' });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, '/production/predictions/run');
  assert.deepEqual(calls.slice(1).map(x => x.path), ['/production/predictions?date=2026-11-01&batch_id=BATCH-1', '/production/recommendations?date=2026-11-01&batch_id=BATCH-1']);
  assert.deepEqual(result.recommendations.items, []);
});

test('decision uses PATCH status only and verifies exact target in list readback', async t => {
  const row = { id: 7, production_date: '2026-11-01', batch_id: 'B1', status: 'accepted' };
  const calls = mockFetch(t, [{}, { count: 1, items: [row] }]);
  const result = await planning.decideRecommendation(7, 'accepted', { date: '2026-11-01', batch_id: 'B1' }, 'planner', ['plan.decide']);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].path, '/production/recommendations/7');
  assert.deepEqual(JSON.parse(calls[0].body), { status: 'accepted' });
  assert.equal(calls[1].path, '/production/recommendations?date=2026-11-01&batch_id=B1');
  assert.deepEqual(result.items, [row]);
});

test('readback mismatch never reports a decision as verified', async t => {
  mockFetch(t, [{}, { count: 1, items: [{ id: 7, status: 'draft' }] }]);
  await assert.rejects(planning.decideRecommendation(7, 'accepted', { date: '2026-11-01' }, 'planner', ['plan.decide']), /belum terverifikasi/);
});

test('permissions come from session capabilities, not the role label', async t => {
  const calls = mockFetch(t, []);
  await assert.rejects(planning.runPlanningPrediction({ date: '2026-11-01' }, 'superadmin', []), /Izin/);
  await assert.rejects(planning.decideRecommendation(1, 'accepted', {}, 'planner', ['schedule.generate']), /Izin/);
  assert.equal(calls.length, 0);
});

test('missing date and invalid status are blocked before any write', async t => {
  const calls = mockFetch(t, []);
  await assert.rejects(planning.runPlanningPrediction({}, 'planner', ['plan.decide']), /tanggal/i);
  await assert.rejects(planning.decideRecommendation(1, 'approved', {}, 'planner', ['plan.decide']), /Status/);
  assert.equal(calls.length, 0);
});

test('mutation HTTP errors and readback failures remain visible', async t => {
  mockFetch(t, [{ httpStatus: 403, body: { error: { message: 'Forbidden' } } }]);
  await assert.rejects(planning.runPlanningPrediction({ date: '2026-11-01' }, 'planner', ['plan.decide']), /Forbidden/);
});

test('readback failure after prediction write is distinguished from a rejected write', async t => {
  mockFetch(t, [{}, { httpStatus: 500, body: { error: { message: 'read failed' } } }, { count: 0, items: [] }]);
  await assert.rejects(planning.runPlanningPrediction({ date: '2026-11-01' }, 'planner', ['plan.decide']), /Prediksi dikirim, tetapi hasil belum terverifikasi/);
});

test('all documented decision states round-trip without changing any planning quantities', async t => {
  for (const status of ['draft', 'accepted', 'rejected', 'applied']) {
    const calls = mockFetch(t, [{}, { count: 1, items: [{ id: 5, status, expected_gain: null, reason_facts: {} }] }]);
    const result = await planning.decideRecommendation(5, status, { date: '2026-11-01' }, 'planner', ['plan.decide']);
    assert.deepEqual(JSON.parse(calls[0].body), { status });
    assert.equal(result.items[0].expected_gain, null);
    t.mock.restoreAll();
  }
});

test('schedule.generate can run predictions, but cannot decide recommendations', async t => {
  const calls = mockFetch(t, [{}, { count: 0, items: [] }, { count: 0, items: [] }]);
  assert.equal(planning.canRunPrediction(['schedule.generate']), true);
  assert.equal(planning.canDecideRecommendation(['schedule.generate']), false);
  await planning.runPlanningPrediction({ date: '2026-11-01' }, 'production', ['schedule.generate']);
  assert.deepEqual(JSON.parse(calls[0].body), { production_date: '2026-11-01' });
});

test('missing exact target after PATCH cannot be mistaken for verified success', async t => {
  mockFetch(t, [{}, { count: 1, items: [{ id: 6, status: 'accepted' }] }]);
  await assert.rejects(planning.decideRecommendation(5, 'accepted', {}, 'planner', ['plan.decide']), /belum terverifikasi/);
});

test('invalid IDs and malformed dates do not reach the network', async t => {
  const calls = mockFetch(t, []);
  await assert.rejects(planning.decideRecommendation(-1, 'draft', {}, 'planner', ['plan.decide']), /ID/);
  await assert.rejects(planning.runPlanningPrediction({ date: '2026-02-31' }, 'planner', ['plan.decide']), /tanggal/i);
  await assert.rejects(planning.runPlanningPrediction({ date: '01/11/2026' }, 'planner', ['plan.decide']), /tanggal/i);
  assert.equal(calls.length, 0);
});

test('production queries use date for reads and preserve optional identifiers', () => {
  assert.equal(planning.planningPath('predictions', { date: '2026-11-01', batch_id: 'BATCH/1' }), '/production/predictions?date=2026-11-01&batch_id=BATCH%2F1');
  assert.equal(planning.planningPath('recommendations', {}), '/production/recommendations');
  assert.equal(planning.plansPath({ week: '1', from: '2026-11-01', to: '' }), '/production/plans?week=1&from=2026-11-01');
});
