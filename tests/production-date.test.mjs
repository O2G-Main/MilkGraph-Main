import { test } from "node:test";
import assert from "node:assert/strict";
import { completedOnProductionDate, dateInWib, overlapsProductionDate } from "../lib/production-date.ts";

test("tanggal Produksi berganti pada tengah malam WIB", () => {
  assert.equal(dateInWib(new Date("2026-11-27T16:59:59Z")), "2026-11-27");
  assert.equal(dateInWib(new Date("2026-11-27T17:00:00Z")), "2026-11-28");
});

test("run lintas tengah malam tampil pada kedua tanggal, batas akhir hari eksklusif", () => {
  const overlaps = date => overlapsProductionDate("2026-11-27T23:30:00+07:00", "2026-11-28T00:30:00+07:00", date);
  assert.equal(overlaps("2026-11-27"), true);
  assert.equal(overlaps("2026-11-28"), true);
  assert.equal(overlaps("2026-11-29"), false);
  assert.equal(overlapsProductionDate("2026-11-27T23:30:00", "2026-11-28T00:00:00", "2026-11-28"), false);
  assert.equal(overlapsProductionDate("invalid", "2026-11-28T00:00:00", "2026-11-28"), false);
});

test("hasil dikelompokkan tanggal selesai WIB, termasuk waktu lokal dari server", () => {
  assert.equal(completedOnProductionDate("2026-11-27T17:00:00Z", "2026-11-28"), true);
  assert.equal(completedOnProductionDate("2026-11-27 23:59:59", "2026-11-27"), true);
  assert.equal(completedOnProductionDate("2026-11-28T00:00:00+07:00", "2026-11-27"), false);
});
