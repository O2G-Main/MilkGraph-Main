import { test } from "node:test";
import assert from "node:assert/strict";
import { GLOBAL_STEPS, filterStepsWithAnchors, tourStepsFor } from "../lib/tour-steps.ts";

test("tour: langkah global selalu di depan, 4 langkah", () => {
  const steps = tourStepsFor("/penjadwalan", "role");
  assert.deepEqual(steps.slice(0, GLOBAL_STEPS.length), GLOBAL_STEPS);
  assert.equal(GLOBAL_STEPS.length, 4);
});

test("tour: Beranda Manager memakai langkah executive, role lain langkah role", () => {
  const exec = tourStepsFor("/", "executive");
  assert.ok(exec.some(s => s.anchor === "exec-radar"));
  assert.ok(exec.some(s => s.anchor === "exec-status"));
  const role = tourStepsFor("/", "role");
  assert.ok(!role.some(s => s.anchor === "exec-radar"));
  assert.ok(role.some(s => s.anchor === "kpis"));
  assert.ok(role.some(s => s.anchor === "attention"));
});

test("tour: halaman demo punya langkah khusus, halaman lain hanya global", () => {
  for (const p of ["/penjadwalan", "/transfer", "/riwayat-produksi", "/trace", "/simulasi"]) {
    assert.ok(tourStepsFor(p, "role").length > GLOBAL_STEPS.length, p);
  }
  assert.equal(tourStepsFor("/pengguna", "role").length, GLOBAL_STEPS.length);
});

test("tour: semua jangkar unik di dalam satu daftar halaman", () => {
  for (const p of ["/", "/penjadwalan", "/transfer", "/riwayat-produksi", "/simulasi"]) {
    for (const v of ["executive", "role"]) {
      const anchors = tourStepsFor(p, v).map(s => s.anchor);
      assert.equal(new Set(anchors).size, anchors.length, `${p} ${v}`);
    }
  }
});

test("tour: langkah tanpa jangkar di halaman dilewati, urutan tetap", () => {
  const steps = tourStepsFor("/penjadwalan", "role");
  const present = new Set(["nav", "topbar", "assistant", "tour-button", "sched-kpis", "sched-table", "import-csv"]);
  const got = filterStepsWithAnchors(steps, present);
  assert.deepEqual(got.map(s => s.anchor), ["nav", "topbar", "assistant", "tour-button", "sched-kpis", "sched-table", "import-csv"]);
  // sched-feasibility tidak ada di mode API, harus hilang tanpa menggeser urutan lain.
  assert.ok(!got.some(s => s.anchor === "sched-feasibility"));
});

test("tour: tidak ada langkah yang lolos bila tidak ada jangkar sama sekali", () => {
  assert.deepEqual(filterStepsWithAnchors(tourStepsFor("/transfer", "executive"), new Set()), []);
});
