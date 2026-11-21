import type { LabParam, LabResult } from "../mock/ops";

/** Hasil yang dimasukkan Lab per sampel. `retest`: Lab menandai satu parameter perlu diuji ulang. */
export interface LabEntry { params: LabParam[]; retest: boolean; by: string; at: string }
export interface LabState { entries: Record<string, LabEntry>; samples: LabResult[] }

/** Status sampel dari parameternya: ada yang gagal → out-of-spec; ditandai ulang → uji ulang; masih ada yang berjalan → dalam uji; semua lolos → menunggu rilis QA. */
export function deriveStatus(params: LabParam[], retest: boolean): LabResult["status"] {
  if (params.some(p => p.ok === false)) return "positif";
  if (retest) return "uji-ulang";
  if (params.some(p => p.ok === null)) return "dalam-uji";
  return "hasil-siap";
}

/** Lot barang jadi tidak menunggu rilis: semua parameter dalam batas berarti lulus QC. */
export function deriveFgStatus(params: LabParam[]): LabResult["status"] {
  if (params.some(p => p.ok === false)) return "positif";
  if (params.some(p => p.ok === null)) return "dalam-uji";
  return "lulus";
}

/** Sampel dari LIMS ditambah sampel baru dari Lab, dengan hasil yang sudah dimasukkan menimpa hasil LIMS. */
export function mergeLab(base: LabResult[], state: LabState): LabResult[] {
  return [...base, ...state.samples].map(r => {
    const e = state.entries[r.id];
    if (!e) return r;
    if (r.kind === "qc-fg") return { ...r, params: e.params, status: deriveFgStatus(e.params) };
    // Sampel RT yang sudah lulus dan dirilis sebelum snapshot tidak diubah statusnya.
    return { ...r, params: e.params, status: r.status === "lulus" ? r.status : deriveStatus(e.params, e.retest) };
  });
}

/** Ketentuan mutu susu segar yang diatur QA/QC; dipakai sebagai batas parameter di Tes Lab. */
export interface QualitySpec { tempMax: number; tpcMax: number; fatMin: number; proteinMin: number }
export const DEFAULT_QUALITY: QualitySpec = { tempMax: 4.5, tpcMax: 1_000_000, fatMin: 3.0, proteinMin: 2.8 };
const id = (n: number, digits = 1) => n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const specLimits = (q: QualitySpec): Record<string, string> => ({
  "Suhu tiba": `≤ ${id(q.tempMax)} °C`,
  TPC: `≤ ${q.tpcMax.toLocaleString("id-ID")} CFU/ml`,
  Lemak: `≥ ${id(q.fatMin)}%`,
  Protein: `≥ ${id(q.proteinMin)}%`,
});
/** Ganti teks batas parameter sampel RT dengan ketentuan mutu yang berlaku. */
export const applySpecs = (results: LabResult[], q: QualitySpec) => {
  const limits = specLimits(q);
  return results.map(r => (r.kind === "penerimaan" ? { ...r, params: r.params.map(p => (limits[p.name] ? { ...p, limit: limits[p.name] } : p)) } : r));
};

const intakeParams = (temp: string): LabParam[] => [
  { name: "Suhu tiba", value: temp, limit: "≤ 4,5 °C", ok: null },
  { name: "Alcohol test 72%", value: "Berjalan", limit: "Negatif", ok: null },
  { name: "Screening antibiotik beta-laktam", value: "Berjalan", limit: "Negatif", ok: null },
  { name: "TPC", value: "Berjalan", limit: "≤ 1.000.000 CFU/ml", ok: null },
  { name: "Lemak", value: "Berjalan", limit: "≥ 3,0%", ok: null },
  { name: "Protein", value: "Berjalan", limit: "≥ 2,8%", ok: null },
];
/** Sampel baru untuk RT yang baru tiba: semua parameter masih berjalan. */
export const newIntakeSample = (id: string, rt: string, detail: string, sampled: string, temperature: number): LabResult => ({
  id, kind: "penerimaan", subject: rt, detail, sampled, status: "dalam-uji",
  params: intakeParams(`${String(temperature).replace(".", ",")} °C`), source: "",
});

/** Batch tangki proses yang menunggu uji [simulasi]; ST-6 sama dengan catatan tangki "menunggu hasil uji lemak". */
export const BATCH_SAMPLES: LabResult[] = [
  { id: "LAB-9040", kind: "batch", subject: "ST-6", detail: "Batch STB-1014-06 · Full Cream terstandar · 36.900 L", sampled: "13.55", status: "dalam-uji", source: "", params: [
    { name: "Lemak", value: "Berjalan", limit: "3,2 - 3,4%", ok: null },
    { name: "Protein", value: "3,0%", limit: "≥ 2,8%", ok: true },
    { name: "Total solid", value: "Berjalan", limit: "≥ 11,5%", ok: null },
    { name: "pH", value: "6,72", limit: "6,6 - 6,8", ok: true },
  ] },
  { id: "LAB-9041", kind: "batch", subject: "MX-1", detail: "Batch MXB-1014-02 · Stroberi · 14.300 L", sampled: "14.20", status: "dalam-uji", source: "", params: [
    { name: "Brix", value: "Berjalan", limit: "11,0 - 12,0 °Bx", ok: null },
    { name: "Lemak", value: "1,6%", limit: "1,4 - 1,8%", ok: true },
    { name: "pH", value: "6,68", limit: "6,6 - 6,8", ok: true },
    { name: "Warna", value: "Sesuai standar", limit: "Sesuai standar", ok: true },
  ] },
];
