import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveDate, productionWeek, weeklyTargets, uniqueSchedule, scheduledVolume } from '../lib/scheduling.ts';

test('minggu produksi dimulai Minggu dan melewati pergantian bulan/tahun', () => {
  assert.deepEqual(productionWeek('2026-01-01'), ['2025-12-28','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03']);
  assert.equal(productionWeek('2026-11-01')[0], '2026-11-01');
  assert.equal(moveDate('2026-11-27', 7), '2026-12-04');
});

test('satu usulan yang terhubung beberapa batch tidak dihitung berulang', () => {
  const plan = { proposal_id:'WPP-1', target_volume_l:20000, batch_id:'B1' };
  const other = { proposal_id:'WPP-2', target_volume_l:4000, batch_id:null };
  const result = weeklyTargets([plan, {...plan,batch_id:'B2'}, {...plan,batch_id:null},other]);
  assert.equal(result.target,24000);
  assert.equal(result.unlinked,4000);
  assert.equal(result.proposals.length,2);
  assert.equal(weeklyTargets([{...other,target_volume_l:null}]).target,null);
});

test('baris batch dibedakan per lini/tanggal dan duplikat tidak menggandakan volume', () => {
  const row = {production_date:'2026-11-01',batch_id:'B1',line_no:1,production_order_id:'PO1',finished_sku_id:'SKU',target_volume_l:12000,sequence_no:1};
  const second = {...row,line_no:2,target_volume_l:8000};
  assert.equal(uniqueSchedule([row,row,second]).length,2);
  assert.equal(scheduledVolume([row,row,second]),20000);
  assert.equal(scheduledVolume([row,{...second,target_volume_l:null}]),null);
});
