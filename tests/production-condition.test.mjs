import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productionCondition } from '../lib/production-condition.ts';

const date = '2026-11-01';
const row = (overrides = {}) => ({ production_date: date, batch_id: 'B1', batch_status: 'Terjadwal', fulfill_status: null, risk_reason: null, shortage_l: null, ...overrides });
const status = (rows, today = date) => productionCondition(rows, date, today);

test('tanggal tanpa batch tidak disamakan dengan status yang belum dikenali', () => {
  assert.equal(status([]).kind, 'empty');
  assert.equal(status([row({ batch_status: 'custom-new-state' })]).kind, 'unknown');
  assert.equal(status([row({ production_date: '2026-11-02' })]).kind, 'unknown');
});

test('prediksi terpenuhi tidak berarti produksi sudah selesai', () => {
  const result = status([row({ fulfill_status: 'terpenuhi', shortage_l: 0 })]);
  assert.equal(result.kind, 'scheduled');
  assert.equal(result.shortageL, 0);
  assert.equal(status([row({ batch_status: 'Selesai' })]).kind, 'complete');
  assert.match(status([row({ batch_status: 'Selesai' })]).reasons.join(' '), /Realisasi volume.*belum dapat dikonfirmasi/);
});

test('kondisi terburuk dari beberapa batch menjadi indikator tanggal', () => {
  const done = row({ batch_status: 'Selesai', fulfill_status: 'terpenuhi' });
  const risk = row({ batch_id: 'B2', fulfill_status: 'berisiko', risk_reason: 'Kapasitas filling penuh' });
  const blocked = row({ batch_id: 'B3', batch_status: 'Terblokir' });
  assert.equal(status([done, risk]).kind, 'risk');
  assert.equal(status([done, risk, blocked]).kind, 'action');
  assert.equal(status([row({ fulfill_status: 'tidak_terpenuhi' })]).kind, 'action');
  assert.ok(status([risk]).reasons.includes('Kapasitas filling penuh'));
});

test('tanggal lewat dengan batch aktif perlu tindakan, batch selesai tetap selesai', () => {
  assert.equal(status([row({ fulfill_status: 'berisiko' })], '2026-11-02').kind, 'action');
  assert.equal(status([row()], '2026-11-02').kind, 'action');
  assert.equal(status([row()], '2026-10-31').kind, 'scheduled');
  assert.equal(status([row({ batch_status: 'Selesai' })], '2026-11-02').kind, 'complete');
});

test('kekurangan prediksi tidak digandakan oleh baris PO dalam batch yang sama', () => {
  const a = row({ fulfill_status: 'berisiko', shortage_l: 8000 });
  const result = status([a, { ...a, line_no: 2 }, row({ batch_id: 'B2', shortage_l: 2000 })]);
  assert.equal(result.shortageL, 10000);
  assert.equal(result.shortagePartial, false);
  assert.equal(status([a, row({ batch_id: 'B2' })]).shortagePartial, true);
  assert.equal(status([row()]).shortageL, null);
});

test('kekurangan positif memicu risiko walau flag prediksi kosong; nilai tidak valid tidak dianggap nol', () => {
  assert.equal(status([row({ shortage_l: 8000 })]).kind, 'risk');
  for (const shortage_l of [null, undefined, -1, NaN, Infinity]) {
    assert.equal(status([row({ shortage_l })]).shortageL, null);
  }
});

test('BE yang menyatakan data tidak cukup tidak ditampilkan aman atau selesai', () => {
  assert.equal(status([row({ batch_status: 'Selesai', fulfill_status: 'data_tidak_cukup' })]).kind, 'unknown');
  assert.equal(status([row({ fulfill_status: 'data_tidak_cukup' })]).kind, 'unknown');
  assert.equal(status([row({ fulfill_status: 'new_backend_value' })]).kind, 'unknown');
});
