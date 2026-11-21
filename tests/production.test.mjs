import { test } from "node:test";
import assert from "node:assert/strict";
import { belowStandard, checkSchedule } from "../lib/production.ts";

const rates = { F1: 100 };
const rules = { changeover: { "A>B": 30 } };
const item = (id, sku, start, end, packs = 1000) => ({ id, line: "F1", sku, packs, start, end });

test("order wajar tidak punya catatan dan kapasitas = laju x durasi", () => {
  const r = checkSchedule([item("1", "A", "14:00", "15:00")], rates, rules);
  assert.equal(r["1"].capacity, 6000);
  assert.deepEqual(r["1"].issues, []);
});

test("jeda changeover di bawah standar ditandai kritis", () => {
  const r = checkSchedule([item("1", "A", "14:00", "15:00"), item("2", "B", "15:10", "16:00")], rates, rules);
  assert.equal(r["2"].issues[0].tone, "crit");
  assert.match(r["2"].issues[0].text, /cuma 10 menit, standarnya 30 menit/);
});

test("order yang tumpang tindih di lini yang sama dianggap bentrok", () => {
  const r = checkSchedule([item("1", "A", "14:00", "15:00"), item("2", "A", "14:30", "16:00")], rates, rules);
  assert.ok(r["1"].issues.some(x => x.text.startsWith("Bentrok")));
});

test("target di atas kapasitas diberi peringatan", () => {
  const r = checkSchedule([item("1", "A", "14:00", "14:10", 5000)], rates, rules);
  assert.equal(r["1"].issues[0].tone, "warn");
});

test("aturan tidak boleh di bawah standar", () => {
  assert.equal(belowStandard(25, 30), true);
  assert.equal(belowStandard(30, 30), false);
  assert.equal(belowStandard(Number.NaN, 30), true);
});
