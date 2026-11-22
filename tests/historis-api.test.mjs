import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stokText, literText } from "../lib/api/neraca.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("neraca: stok null tampil sebagai tidak terukur, bukan 0", () => {
  assert.equal(stokText(null), "tidak terukur");
  assert.equal(stokText(210000), "210.000 L");
  assert.equal(literText(1500.5), "1.500,5 L");
});

test("import CSV: label data dipilih dan diteruskan sebagai label_data pada pratinjau dan commit", () => {
  const card = read("components/import-csv-card.tsx");
  assert.match(card, /label_data=\$\{labelData\}/);
  assert.match(card, /value: "simulasi"/);
  assert.match(card, /value: "historis"/);
  assert.match(card, /useState<ImportDataLabel>\("simulasi"\)/);
});

test("penjadwalan: teks label basi pada form PO manual sudah diperbaiki", () => {
  const penjadwalan = read("components/penjadwalan/penjadwalan-api.tsx");
  assert.doesNotMatch(penjadwalan, /PO tersimpan dengan label data simulasi\./);
  assert.match(penjadwalan, /label data yang dipilih pada kartu impor/);
});

test("pasokan: status kirim dibaca sebagai satu record, bukan daftar", () => {
  const pasokan = read("components/pasokan/pasokan.tsx");
  assert.doesNotMatch(pasokan, /DemandSend\[\]/);
  assert.doesNotMatch(pasokan, /demandSendsRes\.data\?\.find/);
  assert.match(pasokan, /useResource<DemandSend>\(API_MODE \? "\/supply\/demand-sends" : null\)/);
  assert.match(pasokan, /demandSendsRes\.data\?\.sent/);
});

test("neraca harian: seksi baru membaca /balance/daily dengan parameter date dan aturan tampil kontrak", () => {
  const seksi = read("components/transfer/neraca-harian-api.tsx");
  assert.match(seksi, /"\/balance\/daily"/);
  assert.match(seksi, /`\/balance\/daily\?date=\$\{tanggal\}`/);
  assert.match(seksi, /Reject \(susut terukur\)/);
  assert.match(seksi, /Sampling \(susut terukur\)/);
  assert.match(seksi, /Bukan susut/);
  assert.match(seksi, /stokText\(hari\.stok_awal_l\)/);
  assert.match(seksi, /stokText\(hari\.stok_akhir_l\)/);
  const transfer = read("components/transfer/transfer.tsx");
  assert.match(transfer, /<NeracaHarianApiCard \/>/);
});

test("riwayat produksi: group historis masuk pemilih output dan ditelusuri lewat /trace/history/backward", () => {
  const riwayat = read("components/riwayat/riwayat-produksi.tsx");
  assert.match(riwayat, /"\/trace\/history"/);
  assert.match(riwayat, /`\/trace\/history\/backward\?groupId=\$\{encodeURIComponent\(histGroup\.group_id\)\}`/);
  assert.match(riwayat, /outputs=\{allOutputs\}/);
  const detail = read("components/riwayat/historis-detail.tsx");
  assert.match(detail, /Komposisi campuran lot/);
  assert.match(detail, /detail\.lots/);
  assert.match(detail, /detail\.steps/);
});
