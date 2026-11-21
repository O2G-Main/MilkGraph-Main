import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_IDS, can, canSee, hiddenFor, roleLabel, setAccess, setMenus, setRoles } from "../lib/roles.ts";

test("role baru terdaftar dan bisa diubah namanya, peran bawaan tetap ada", () => {
  setRoles([{ id: "gudang", label: "Admin Gudang", focus: "Stok barang jadi" }, { id: "planner", label: "Planner Produksi", focus: "" }]);
  assert.ok(ROLE_IDS.includes("gudang"));
  assert.equal(roleLabel("gudang"), "Admin Gudang");
  assert.equal(roleLabel("planner"), "Planner Produksi");
  setRoles([]);
  assert.ok(!ROLE_IDS.includes("gudang"));
  assert.equal(roleLabel("planner"), "Planner PPIC");
});

test("menu yang diatur Superadmin menimpa pengaturan awal", () => {
  assert.equal(canSee("planner", "/pengguna"), false);
  setMenus({ planner: [] });
  assert.equal(canSee("planner", "/pengguna"), true);
  setMenus({ gudang: ["/rencana"] });
  assert.equal(canSee("gudang", "/rencana"), false);
  assert.deepEqual(hiddenFor("superadmin"), []);
  setMenus({});
});

test("izin role baru hanya dari matriks hak akses; Superadmin selalu boleh", () => {
  assert.equal(can("gudang", "qc.record"), false);
  setAccess({ "qc.record": ["superadmin", "qa", "gudang"] });
  assert.equal(can("gudang", "qc.record"), true);
  assert.equal(can("superadmin", "qc.record"), true);
  setAccess({});
});
