import type { Tone } from "../mock/types";

/**
 * Pencatatan volume dan selisih bahan (mass balance). Satu transfer menghubungkan dua alat:
 * volume keluar dari alat asal dan volume diterima di alat tujuan; selisihnya = keluar - diterima.
 * Sumber "manual" dicatat pengguna; "iot" masuk lewat POST /api/v1/transfers (IoT Greenfields).
 */
export type FlowSource = "manual" | "iot";
export interface FlowRow {
  id: string; kind: "rt" | "proses";
  from: string; to: string; out: number; in: number; diff: number; diffPct: number;
  start: string; end: string; measuredAt: string; source: FlowSource;
  device?: string; by?: string; batch?: string; note?: string;
  /** Sudah termasuk di level snapshot 14.42, jadi tidak mengubah volume terkini. */
  counted: boolean;
}

/** Data transfer dari IoT/sensor flowmeter, bentuk yang diterima API. */
export interface IotTransfer { id: string; from: string; to: string; out: number; in: number; start: string; end: string; measuredAt: string; device: string; batch?: string; receivedAt: string }

/** Toleransi selisih timbang/flowmeter [asumsi]: sampai 0,5% wajar, di atas 2% perlu diselidiki. */
export const diffTone = (pct: number): Tone => (Math.abs(pct) <= 0.5 ? "ok" : Math.abs(pct) <= 2 ? "warn" : "crit");

export const makeRow = (r: Omit<FlowRow, "diff" | "diffPct">): FlowRow => ({ ...r, diff: r.out - r.in, diffPct: r.out ? ((r.out - r.in) / r.out) * 100 : 0 });

/** Volume terkini sebuah alat: level snapshot + yang diterima - yang keluar dari transfer setelah snapshot. */
export function levelAfter(asset: string, base: number, flows: FlowRow[]) {
  return flows.filter(f => !f.counted).reduce((v, f) => v + (f.to === asset ? f.in : 0) - (f.from === asset ? f.out : 0), base);
}

/** Alat yang muncul di satu langkah rantai batch, mis. "TH-1, SP-1" atau "ST-3 + premix stroberi". */
export const assetsOfStep = (s: string) => s.split(/,|\+/).map(x => x.trim().split(" ")[0]).filter(x => /^[A-Z]+-?\d/.test(x));
/** Transfer yang menyentuh salah satu alat atau batch di rantai. */
export const flowsFor = (flows: FlowRow[], assets: string[], batches: string[] = []) =>
  flows.filter(f => assets.includes(f.from) || assets.includes(f.to) || (f.batch ? batches.includes(f.batch) : false));

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[A-Z]{1,4}-?[A-Z0-9]{1,6}$/;
/** Validasi data transfer dari IoT. Dipakai route API dan tes. */
export function validateIngest(body: unknown): { ok: true; value: Omit<IotTransfer, "id" | "receivedAt"> } | { ok: false; field: string; message: string } {
  if (!body || typeof body !== "object") return { ok: false, field: "body", message: "Isi permintaan harus objek JSON." };
  const b = body as Record<string, unknown>;
  for (const k of ["from", "to"] as const) if (typeof b[k] !== "string" || !ID.test(b[k] as string)) return { ok: false, field: k, message: `${k} harus kode alat, mis. UHT-2 atau AT-2.` };
  if (b.from === b.to) return { ok: false, field: "to", message: "Alat asal dan tujuan harus berbeda." };
  for (const k of ["out", "in"] as const) if (typeof b[k] !== "number" || !Number.isFinite(b[k]) || (b[k] as number) < 0) return { ok: false, field: k, message: `${k} harus angka liter yang tidak negatif.` };
  for (const k of ["start", "end", "measuredAt"] as const) if (typeof b[k] !== "string" || !TIME.test(b[k] as string)) return { ok: false, field: k, message: `${k} harus jam "HH:MM".` };
  if (typeof b.device !== "string" || !b.device.trim()) return { ok: false, field: "device", message: "device wajib diisi, mis. FM-UHT2-01." };
  if (b.batch !== undefined && typeof b.batch !== "string") return { ok: false, field: "batch", message: "batch harus teks." };
  return { ok: true, value: { from: b.from as string, to: b.to as string, out: b.out as number, in: b.in as number, start: b.start as string, end: b.end as string, measuredAt: b.measuredAt as string, device: (b.device as string).trim(), ...(b.batch ? { batch: b.batch as string } : {}) } };
}
