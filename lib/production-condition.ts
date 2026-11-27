import type { ProductionBatchRow } from "./api/production.ts";

export type DayConditionKind = "complete" | "scheduled" | "risk" | "action" | "empty" | "unknown" | "loading" | "error";
export type DayCondition = {
  kind: DayConditionKind; label: string; reasons: string[];
  shortageL: number | null; shortagePartial: boolean;
};
export const conditionLabels: Record<DayConditionKind, string> = {
  complete: "Selesai", scheduled: "Terjadwal", risk: "Berisiko", action: "Perlu tindakan",
  empty: "Tanpa jadwal", unknown: "Belum dinilai", loading: "Memuat status", error: "Status gagal dimuat",
};
export const unavailableCondition = (kind: DayConditionKind, reason: string): DayCondition => ({
  kind, label: conditionLabels[kind], reasons: [reason], shortageL: null, shortagePartial: false,
});
const normalized = (value: string) => value.trim().toLowerCase().replace(/[ -]+/g, "_");
const done = new Set(["selesai", "completed", "complete", "done"]);
const active = new Set(["terjadwal", "planned", "scheduled", "berjalan", "dalam_proses", "in_progress", "running", "diproses"]);
const fulfillment = new Set(["terpenuhi", "berisiko", "tidak_terpenuhi", "data_tidak_cukup"]);
const blocked = new Set(["blocked", "terblokir", "terhambat", "terlambat", "late", "failed", "gagal"]);

/** Daily-view fulfillment is a prediction, never measured filling or a transfer record. */
export function productionCondition(rows: ProductionBatchRow[], date: string, today: string): DayCondition {
  if (!rows.length) return unavailableCondition("empty", "Belum ada batch produksi pada tanggal ini.");
  if (rows.some(row => row.production_date !== date)) return unavailableCondition("unknown", "Tanggal data BE tidak sesuai tanggal kalender.");
  const statuses = rows.map(row => normalized(row.batch_status || ""));
  // One batch prediction can be repeated across multiple PO/line rows in the daily view.
  const shortages = new Map<string, number | null>();
  for (const row of rows) {
    const value = row.shortage_l;
    const amount = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const previous = shortages.get(row.batch_id);
    shortages.set(row.batch_id, amount === null ? previous ?? null : Math.max(previous ?? 0, amount));
  }
  const known = [...shortages.values()].filter((value): value is number => value !== null);
  const shortageL = known.length ? known.reduce((sum, value) => sum + value, 0) : null;
  const reasons = [...new Set(rows.map(row => row.risk_reason?.trim()).filter((reason): reason is string => !!reason))];
  let kind: DayConditionKind;
  if (statuses.some(status => blocked.has(status)) || rows.some(row => row.fulfill_status === "tidak_terpenuhi")) {
    kind = "action";
    reasons.unshift("BE mencatat kendala batch atau prediksi target tidak terpenuhi.");
  } else if (date < today && statuses.some(status => active.has(status))) {
    kind = "action";
    reasons.unshift("Tanggal produksi telah lewat; masih ada batch yang belum berstatus selesai.");
  } else if (rows.some(row => row.fulfill_status === "berisiko") || (shortageL ?? 0) > 0) {
    kind = "risk";
    reasons.unshift("Ada risiko pemenuhan atau perkiraan kekurangan dari BE.");
  } else if (rows.some(row => row.fulfill_status === "data_tidak_cukup" || (!!row.fulfill_status && !fulfillment.has(row.fulfill_status))) || statuses.some(status => !done.has(status) && !active.has(status))) {
    kind = "unknown";
    reasons.unshift("Data penilaian belum cukup atau status batch belum dikenali.");
  } else if (statuses.every(status => done.has(status))) {
    kind = "complete";
    reasons.unshift("Seluruh batch berstatus selesai di BE. Realisasi volume dan pemenuhan target belum dapat dikonfirmasi melalui ringkasan ini.");
  } else {
    kind = "scheduled";
    reasons.unshift("Ada batch terjadwal atau berjalan; belum seluruhnya selesai.");
  }
  if (rows.some(row => !row.fulfill_status)) reasons.push("Prediksi pemenuhan belum tersedia untuk sebagian atau seluruh batch.");
  return { kind, label: conditionLabels[kind], reasons, shortageL, shortagePartial: known.length < shortages.size };
}
