import { test } from "node:test";
import assert from "node:assert/strict";
import { ageAt, applyQueue, checkTransfer, tankRoom } from "../lib/receiving.ts";

const tanker = { id: "RT-1", farm: "Farm A", volume: 10000, stage: "Released", wait: 10, age: "9j 20m", temperature: 4, tone: "crit", source: "WB-1" };
const empty = { arrivals: [], records: {}, transfers: [] };

test("umur susu melewati tengah malam dihitung dari kemarin", () => {
  assert.equal(ageAt("22:00", "02:30"), 270);
  assert.equal(ageAt("05:00", "14:42"), 582);
});

test("antrean memakai umur skenario dan menandai RT dekat batas holding", () => {
  const [row] = applyQueue([tanker], empty, 630);
  assert.equal(row.ageMin, 560);
  assert.equal(row.tone, "crit");
});

test("catatan bongkar mengubah tahap dan menghentikan umur susu", () => {
  const state = { ...empty, records: { "RT-1": { unloadStart: "15:00", unloadEnd: "15:30" } } };
  const [row] = applyQueue([tanker], state, 630);
  assert.equal(row.stage, "Selesai bongkar");
  assert.equal(row.ageMin, 560 + 48);
});

test("RT yang dicatat tiba masuk antrean di tahap Sampling", () => {
  const state = { ...empty, arrivals: [{ id: "RT-9", farm: "Farm B", volume: 9000, depart: "13:00", eta: "15:00", milkStart: "07:00", status: "tiba", note: "" }], records: { "RT-9": { arrivedAt: "15:05" } } };
  const rows = applyQueue([], state, 630);
  assert.equal(rows[0].stage, "Sampling");
  assert.equal(rows[0].ageMin, 485);
});

test("transfer baru mengurangi ruang tangki, transfer lama tidak", () => {
  const room = tankRoom([{ id: "RMT-1", fill: 40000, capacity: 60000 }], [
    { id: "a", rt: "RT-1", tank: "RMT-1", volume: 5000, start: "13:00", end: "13:30", counted: true },
    { id: "b", rt: "RT-2", tank: "RMT-1", volume: 8000, start: "15:00", end: "15:30", counted: false },
  ]);
  assert.equal(room["RMT-1"].free, 12000);
});

test("transfer melebihi ruang tangki kritis, selisih timbang diberi peringatan", () => {
  assert.equal(checkTransfer(13000, 13000, 12000)[0].tone, "crit");
  assert.equal(checkTransfer(9800, 10000, 20000)[0].tone, "warn");
  assert.deepEqual(checkTransfer(10020, 10000, 20000), []);
});
