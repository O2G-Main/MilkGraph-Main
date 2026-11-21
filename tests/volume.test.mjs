import { test } from "node:test";
import assert from "node:assert/strict";
import { assetsOfStep, diffTone, flowsFor, levelAfter, makeRow, validateIngest } from "../lib/volume.ts";

const row = (over) => makeRow({ id: "T", kind: "proses", from: "A-1", to: "B-1", out: 10000, in: 9900, start: "14:00", end: "14:30", measuredAt: "14:30", source: "manual", counted: false, ...over });

test("satu transfer menghitung selisih keluar dan diterima", () => {
  const r = row({});
  assert.equal(r.diff, 100);
  assert.equal(r.diffPct, 1);
  assert.equal(diffTone(r.diffPct), "warn");
  assert.equal(diffTone(0.3), "ok");
  assert.equal(diffTone(-3), "crit");
});

test("volume terkini mengurangi alat asal dan menambah alat tujuan; transfer lama tidak dihitung ulang", () => {
  const flows = [row({}), row({ id: "L", counted: true })];
  assert.equal(levelAfter("A-1", 30000, flows), 20000);
  assert.equal(levelAfter("B-1", 1000, flows), 10900);
});

test("transfer di jalur batch dicocokkan lewat alat atau batch", () => {
  assert.deepEqual(assetsOfStep("TH-1, SP-1"), ["TH-1", "SP-1"]);
  assert.deepEqual(assetsOfStep("ST-3 + premix stroberi"), ["ST-3"]);
  const flows = [row({ from: "UHT-2", to: "AT-2" }), row({ id: "X", from: "ST-1", to: "MX-2", batch: "MXB-1012-02" })];
  assert.equal(flowsFor(flows, ["AT-2"]).length, 1);
  assert.equal(flowsFor(flows, ["F9"], ["MXB-1012-02"]).length, 1);
});

test("validasi data IoT", () => {
  const ok = validateIngest({ from: "UHT-2", to: "AT-2", out: 7000, in: 6960, start: "14:00", end: "14:40", measuredAt: "14:40", device: "FM-UHT2-01" });
  assert.equal(ok.ok, true);
  assert.equal(validateIngest({ from: "UHT-2", to: "UHT-2", out: 1, in: 1, start: "14:00", end: "14:40", measuredAt: "14:40", device: "x" }).field, "to");
  assert.equal(validateIngest({ from: "UHT-2", to: "AT-2", out: -1, in: 1, start: "14:00", end: "14:40", measuredAt: "14:40", device: "x" }).field, "out");
  assert.equal(validateIngest({ from: "UHT-2", to: "AT-2", out: 1, in: 1, start: "2pm", end: "14:40", measuredAt: "14:40", device: "x" }).field, "start");
  assert.equal(validateIngest({ from: "UHT-2", to: "AT-2", out: 1, in: 1, start: "14:00", end: "14:40", measuredAt: "14:40" }).field, "device");
});
