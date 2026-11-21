import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalCreateBody, arrivalFromApi, arrivalUpdateBody, chatNotice, flowFromApi, sourceText, toHHMM, transferBody } from "../lib/api/contract.ts";

const be = { id: "ARR-026", farm_id: "FARM-01", farm_name: "KUD Ngantang", rt_id: "RT-26", volume_l: 11400, depart_at: "03:10", target_arrival: "04:45", estimated_arrival: "05:20", actual_arrival: null, status: "Dalam Perjalanan", late_minutes: 35 };

test("rt-arrivals: record server dipetakan tanpa menghitung keterlambatan sendiri", () => {
  const a = arrivalFromApi(be);
  assert.equal(a.id, "RT-26");
  assert.equal(a.apiId, "ARR-026");
  assert.equal(a.status, "perjalanan");
  assert.equal(a.late, 35);
  assert.equal(a.actual, undefined);
  assert.equal(arrivalCreateBody(a).status, "Dalam Perjalanan");
  assert.equal("late_minutes" in arrivalCreateBody(a), false);
});

test("rt-arrivals: PUT mengosongkan actual_arrival dengan string kosong bila belum tiba", () => {
  assert.deepEqual(arrivalUpdateBody({ eta: "05:30", status: "perjalanan", actual: "05:31" }), { estimated_arrival: "05:30", status: "Dalam Perjalanan", actual_arrival: "" });
  assert.equal(arrivalUpdateBody({ eta: "05:30", status: "tiba", actual: "05:31" }).actual_arrival, "05:31");
});

test("jam dari server diterima dalam beberapa format", () => {
  assert.equal(toHHMM("05:20"), "05:20");
  assert.equal(toHHMM("05:20:00"), "05:20");
  assert.equal(toHHMM("2026-10-14T08:15:00+07:00"), "08:15");
  assert.equal(toHHMM(null), "");
});

test("trace/transfers: selisih memakai selisih_l server", () => {
  const f = flowFromApi({ id: "TRF-001", batch_id: "MXB-1014-02", from_ref: "UHT-2", to_ref: "AT-2", volume_out_l: 10000, volume_in_l: 9900, selisih_l: 100, source: "IoT", recorded_at: "2026-10-14T15:15:00+07:00" });
  assert.equal(f.diff, 100);
  assert.equal(f.diffPct, 1);
  assert.equal(f.source, "iot");
  assert.equal(f.measuredAt, "15:15");
  assert.equal(f.counted, false);
  const body = transferBody({ batch: "MXB-1014-02", from: "UHT-2", to: "AT-2", out: 10000, in: 9900, measuredAt: "15:15" }, "2026-10-14");
  assert.equal(body.source, "Manual");
  assert.equal(body.recorded_at, "2026-10-14T15:15:00+07:00");
  assert.equal("selisih_l" in body, false);
});

test("chat: sumber diringkas dan error layanan dijelaskan", () => {
  assert.equal(sourceText(["LAB-8812", { label: "Genealogi FG-1013-07" }]), "LAB-8812, Genealogi FG-1013-07");
  assert.match(chatNotice(503), /belum diaktifkan/);
  assert.match(chatNotice(502), /tidak terjangkau/);
});
