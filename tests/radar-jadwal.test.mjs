import { test } from "node:test";
import assert from "node:assert/strict";
import { scheduleQuality } from "../lib/api/radar-jadwal.ts";

const po = (id, due) => ({ po_id: id, priority: 1, due_datetime: due, label_data: "historis", lines: [{ sku_id: "X", qty_liter: 1000 }] });
const ful = (id, status, pct, selesai, causes) => ({ po_id: id, status, fulfilled_pct: pct, planned_completion: selesai, root_causes: causes });
const run = (id, mulai, selesai, co) => ({ run_id: id, po_id: "PO-1", sku: "X", fm_id: "FL-01", tank_source: "AT-01", start: mulai, end: selesai, qty_liter: 1000, changeover_after_min: co });
const schedule = (fulfilment, runs) => ({ schedule_id: "SCH-1", version: 1, generated_at: "2026-11-01T06:00:00+07:00", triggered_by: "uji", window: { start: "2026-11-01T06:00:00+07:00", end: "2026-11-02T06:00:00+07:00" }, fulfilment, runs, warnings: [] });
const exec = pcts => ({ milk_received_l: { total: 0, by_farm: [] }, machine_utilization: pcts.map((pct, i) => ({ fm_id: `FL-0${i + 1}`, used_hours: 1, downtime_hours: 0, pct })), daily_schedule: null, po_summary: null });

test("radar jadwal: tanpa jadwal hasilnya null", () => {
  assert.equal(scheduleQuality(null, [], null), null);
});

test("radar jadwal: pola live 22 Nov, semua PO berisiko karena bahan baku", () => {
  const q = scheduleQuality(
    schedule(
      [ful("PO-1", "AT_RISK", 1, "2026-11-02T05:00:00+07:00", ["RAW_MATERIAL_SHORT"]), ful("PO-2", "AT_RISK", 1, "2026-11-02T04:00:00+07:00", ["RAW_MATERIAL_SHORT"])],
      [run("R1", "2026-11-01T06:00:00+07:00", "2026-11-01T16:00:00+07:00", 60)],
    ),
    [po("PO-1", "2026-11-03T00:00:00+07:00"), po("PO-2", "2026-11-03T00:00:00+07:00")],
    exec([70, 72]),
  );
  const byKey = Object.fromEntries(q.axes.map(a => [a.key, a.value]));
  assert.equal(byKey.pemenuhan, 100);
  assert.equal(byKey.ketepatan, 100);
  assert.equal(byKey.kesiapan, 0);
  assert.equal(byKey.utilisasi, 71);
  assert.equal(byKey.efisiensi, 90); // 60 menit ganti format dari 600 menit run
  assert.equal(q.poRisk, 2);
  assert.equal(q.weakest.key, "kesiapan");
  assert.match(q.insight, /kekurangan bahan baku/);
});

test("radar jadwal: PO yang tidak ada di daftar PO dikeluarkan dari ketepatan", () => {
  const q = scheduleQuality(
    schedule([ful("PO-1", "ON_TRACK", 0.5, "2026-11-04T00:00:00+07:00", []), ful("PO-X", "ON_TRACK", 0.5, "2026-11-01T00:00:00+07:00", [])], []),
    [po("PO-1", "2026-11-03T00:00:00+07:00")],
    null,
  );
  const byKey = Object.fromEntries(q.axes.map(a => [a.key, a.value]));
  assert.equal(byKey.ketepatan, 0); // hanya PO-1 yang bisa dibandingkan, dan dia terlambat
  assert.equal(byKey.pemenuhan, 50);
  assert.equal(byKey.utilisasi, null); // tanpa dashboard eksekutif, utilisasi kosong bukan 0
  assert.equal(q.average, (50 + 0 + 100) / 3); // kesiapan 100 karena tidak ada akar masalah
});
