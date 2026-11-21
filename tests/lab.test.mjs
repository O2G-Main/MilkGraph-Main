import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_QUALITY, applySpecs, deriveFgStatus, deriveStatus, mergeLab, newIntakeSample } from "../lib/lab.ts";

const p = (ok) => ({ name: "X", value: "-", limit: "-", ok });

test("status sampel mengikuti parameter", () => {
  assert.equal(deriveStatus([p(true), p(false)], false), "positif");
  assert.equal(deriveStatus([p(true), p(null)], true), "uji-ulang");
  assert.equal(deriveStatus([p(true), p(null)], false), "dalam-uji");
  assert.equal(deriveStatus([p(true), p(true)], false), "hasil-siap");
});

test("hasil dari Lab menimpa hasil LIMS, sampel yang sudah lulus tetap lulus", () => {
  const base = [
    { id: "A", kind: "penerimaan", subject: "RT-1", detail: "", sampled: "", status: "dalam-uji", params: [p(null)], source: "" },
    { id: "B", kind: "penerimaan", subject: "RT-2", detail: "", sampled: "", status: "lulus", params: [p(true)], source: "" },
  ];
  const merged = mergeLab(base, { samples: [], entries: { A: { params: [p(true)], retest: false, by: "Lab", at: "15.00" }, B: { params: [p(false)], retest: false, by: "Lab", at: "15.00" } } });
  assert.equal(merged[0].status, "hasil-siap");
  assert.equal(merged[1].status, "lulus");
});

test("sampel baru untuk RT yang tiba dimulai dengan semua parameter berjalan", () => {
  const s = newIntakeSample("LAB-9100", "RT-31", "KUD Ngantang", "15.10", 4.2);
  assert.equal(s.status, "dalam-uji");
  assert.equal(s.params[0].value, "4,2 °C");
  assert.ok(mergeLab([], { samples: [s], entries: {} }).length === 1);
});

test("lot barang jadi lulus bila semua parameter dalam batas", () => {
  assert.equal(deriveFgStatus([p(true), p(true)]), "lulus");
  assert.equal(deriveFgStatus([p(true), p(null)]), "dalam-uji");
  assert.equal(deriveFgStatus([p(true), p(false)]), "positif");
  const fg = { id: "F", kind: "qc-fg", subject: "FG-1", detail: "", sampled: "", status: "dalam-uji", params: [p(null)], source: "" };
  assert.equal(mergeLab([fg], { samples: [], entries: { F: { params: [p(true)], retest: false, by: "QA", at: "15.00" } } })[0].status, "lulus");
});

test("ketentuan mutu mengganti batas parameter sampel RT", () => {
  const rt = newIntakeSample("LAB-1", "RT-1", "", "15.00", 4);
  const [out] = applySpecs([rt], { ...DEFAULT_QUALITY, tempMax: 4, fatMin: 3.2 });
  assert.equal(out.params.find(x => x.name === "Suhu tiba").limit, "≤ 4,0 °C");
  assert.equal(out.params.find(x => x.name === "Lemak").limit, "≥ 3,2%");
  assert.equal(out.params.find(x => x.name === "TPC").limit, "≤ 1.000.000 CFU/ml");
});
