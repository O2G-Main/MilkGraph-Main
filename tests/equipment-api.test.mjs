import test from 'node:test';
import assert from 'node:assert/strict';
import { apiGet, apiSend } from '../lib/api/client.ts';
import { filterEquipment, equipmentSpecs, toDowntimeMachines, canRecordStatus, createStatusRecorder } from '../lib/api/equipment.ts';

const asset = { asset_id: 'AT-01', asset_name: 'Aseptic Tank', asset_type: 'Tank', current_status: null };
const session = { role: 'operator', permissions: ['downtime.record'] };

test('filter preserves canonical IDs and missing status', () => {
  assert.deepEqual(filterEquipment([asset], 'at-01', 'Tank', 'missing'), [asset]);
  assert.deepEqual(filterEquipment([asset], 'AT-1', '', ''), []);
  assert.deepEqual(filterEquipment([asset], '', '', 'Running'), []);
  assert.equal(toDowntimeMachines([asset])[0].id, 'AT-01');
  assert.equal(toDowntimeMachines([asset])[0].status, undefined);
});

test('spec join is exact and retains N/A, X, and zero', () => {
  const specs = equipmentSpecs(asset.asset_id, [
    { asset_id: 'AT-1', capacity_l: '999' },
    { asset_id: 'AT-01', capacity_l: 'N/A', input_flow_lph: 'X', output_flow_lph: 0 },
  ]);
  assert.equal(specs.find(s => s.key === 'capacity_l').value, 'N/A');
  assert.equal(specs.find(s => s.key === 'input_flow_lph').value, 'X');
  assert.equal(specs.find(s => s.key === 'output_flow_lph').value, '0');
  assert.equal(equipmentSpecs('AT-1 ', [{ asset_id: 'AT-1', capacity_l: '9' }]), null);
});

test('permission requires matching backend role and explicit permission', () => {
  assert.equal(canRecordStatus(session, 'operator'), true);
  assert.equal(canRecordStatus(session, 'superadmin'), false);
  assert.equal(canRecordStatus({ role: 'operator', permissions: [] }, 'operator'), false);
  assert.equal(canRecordStatus(null, 'operator'), false);
});

function clientHarness({ readback = [asset], permissions = session, rejectPost = false } = {}) {
  const calls = [];
  const client = {
    get: async (path, role) => { calls.push(['GET', path, role]); return path === '/session' ? permissions : { items: readback }; },
    send: async (method, path, body, role) => { calls.push([method, path, body, role]); if (rejectPost) throw new Error('HTTP 422'); },
  };
  return { calls, client };
}

test('status writes encoded ID, explicit payload, and verifies exact readback', async () => {
  const row = { ...asset, asset_id: 'AT/01', current_status: 'Maintenance', current_status_reason: 'CIP' };
  const { calls, client } = clientHarness({ readback: [row] });
  const recorder = createStatusRecorder(client);
  assert.equal(await recorder.save('AT/01', ' Maintenance ', ' CIP ', 'operator'), row);
  assert.deepEqual(calls, [
    ['GET', '/session', 'operator'],
    ['POST', '/production/assets/AT%2F01/status', { status: 'Maintenance', status_reason: 'CIP', source: 'manual' }, 'operator'],
    ['GET', '/production/assets?include_pipes=true&search=AT%2F01', 'operator'],
  ]);
});

test('blank/control status and absent permission cannot POST', async () => {
  const { client, calls } = clientHarness({ permissions: { role: 'operator', permissions: [] } });
  const recorder = createStatusRecorder(client);
  await assert.rejects(recorder.save('AT-01', ' ', '', 'operator'), /status/i);
  await assert.rejects(recorder.save('AT-01', 'bad\nstatus', '', 'operator'), /status/i);
  await assert.rejects(recorder.save('AT-01', 'Running', '', 'operator'), /izin/i);
  assert.equal(calls.filter(c => c[0] === 'POST').length, 0);
});

test('failed readback cannot claim success or repost on retry', async () => {
  const { client, calls } = clientHarness({ readback: [{ ...asset, asset_id: 'AT-1', current_status: 'Running' }] });
  const recorder = createStatusRecorder(client);
  await assert.rejects(recorder.save('AT-01', 'Running', '', 'operator'), /verifikasi/i);
  assert.equal(recorder.pendingVerification, true);
  await assert.rejects(recorder.save('AT-01', 'Running', '', 'operator'), /verifikasi/i);
  assert.equal(calls.filter(c => c[0] === 'POST').length, 1);
});

test('concurrent submits do not duplicate writes', async () => {
  const { client, calls } = clientHarness({ readback: [{ ...asset, current_status: 'Running' }] });
  const recorder = createStatusRecorder(client);
  const first = recorder.save('AT-01', 'Running', '', 'operator');
  await assert.rejects(recorder.save('AT-01', 'Running', '', 'operator'), /berlangsung/i);
  await first;
  assert.equal(calls.filter(c => c[0] === 'POST').length, 1);
  assert.deepEqual(calls.find(c => c[0] === 'POST')[2], { status: 'Running', source: 'manual' });
});

test('shared client sends real HTTP request bodies and verifies after write', async (t) => {
  const calls = [];
  const row = { ...asset, current_status: 'Running' };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), ...init });
    return Response.json(String(url).endsWith('/session') ? session
      : init.method === 'POST' ? { ok: true } : { count: 1, items: [row] });
  });
  const recorder = createStatusRecorder({ get: apiGet, send: apiSend });
  await recorder.save('AT-01', 'Running', '', 'operator');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].method, 'POST');
  assert.ok(calls[1].url.endsWith('/api/v1/production/assets/AT-01/status'));
  assert.deepEqual(JSON.parse(calls[1].body), { status: 'Running', source: 'manual' });
  assert.equal(calls[1].headers['X-Demo-Role'], 'operator');
  assert.equal(calls[2].method, 'GET');
  assert.ok(calls[2].url.endsWith('/production/assets?include_pipes=true&search=AT-01'));
});

test('failed verification retries GET only and eventually verifies', async () => {
  let attempts = 0;
  let posts = 0;
  const recorder = createStatusRecorder({
    get: async path => path === '/session' ? session : ++attempts === 1 ? { items: [] } : { items: [{ ...asset, current_status: 'Running' }] },
    send: async () => { posts++; },
  });
  await assert.rejects(recorder.save('AT-01', 'Running', '', 'operator'), /verifikasi/i);
  const result = await recorder.save('AT-01', 'Running', '', 'operator');
  assert.equal(result.current_status, 'Running');
  assert.equal(posts, 1);
  assert.equal(recorder.pendingVerification, false);
});

test('HTTP failure is surfaced without readback', async () => {
  const { client, calls } = clientHarness({ rejectPost: true });
  await assert.rejects(createStatusRecorder(client).save('AT-01', 'Running', '', 'operator'), /422/);
  assert.equal(calls.filter(c => c[0] === 'GET').length, 1);
});
