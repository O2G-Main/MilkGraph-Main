import { test } from "node:test";
import assert from "node:assert/strict";
import { attainment, checkProcessTransfer, downtimeMinutes, isLate, mayHandle, runState } from "../lib/operation.ts";

test("status order mengikuti catatan mulai dan selesai", () => {
  assert.equal(runState(undefined), "belum");
  assert.equal(runState({ start: "14:00" }), "jalan");
  assert.equal(runState({ start: "14:00", end: "16:00" }), "selesai");
});

test("order terlambat bila jam mulai sudah lewat tapi belum dicatat", () => {
  assert.equal(isLate("14:00", undefined, "14:42"), true);
  assert.equal(isLate("15:10", undefined, "14:42"), false);
  assert.equal(isLate("14:00", { start: "14:05" }, "14:42"), false);
});

test("pencapaian dan lama downtime", () => {
  assert.equal(attainment(11_400, 12_000), 95);
  assert.equal(downtimeMinutes({ id: "a", asset: "F1", cause: "CIP", start: "14:00", note: "" }, "14:42"), 42);
  assert.equal(downtimeMinutes({ id: "a", asset: "F1", cause: "CIP", start: "14:00", end: "14:20", note: "" }, "14:42"), 20);
});

test("transfer proses ditolak bila asal sama dengan tujuan atau jam terbalik", () => {
  assert.match(checkProcessTransfer({ from: "AT-2", to: "AT-2", volume: 10, start: "14:00", end: "14:30" }), /berbeda/);
  assert.match(checkProcessTransfer({ from: "UHT-2", to: "AT-2", volume: 10, start: "14:30", end: "14:00" }), /setelah/);
  assert.equal(checkProcessTransfer({ from: "UHT-2", to: "AT-2", volume: 6990, start: "13:00", end: "14:00" }), null);
});

test("operator hanya menangani alat yang ditugaskan", () => {
  assert.equal(mayHandle(["F1", "F2"], "F2"), true);
  assert.equal(mayHandle(["F1", "F2"], "F5"), false);
  assert.equal(mayHandle(undefined, "F5"), true);
});
