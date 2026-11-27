import type { ProductionLine } from "./api/production.ts";
import type { FulfillmentPrediction, ProductionRecommendation } from "./api/planning.ts";

/** Preserve latest backend assessment per batch; do not rank solutions with unspecified gain units. */
export function latestPredictions(rows: FulfillmentPrediction[], date: string): FulfillmentPrediction[] {
  const latest = new Map<string | null, FulfillmentPrediction>();
  for (const row of rows.filter(row => row.production_date === date)) {
    const previous = latest.get(row.batch_id);
    const time = Date.parse(row.calculated_at) || 0;
    const previousTime = previous ? Date.parse(previous.calculated_at) || 0 : -1;
    if (!previous || time > previousTime || (time === previousTime && row.id > previous.id)) latest.set(row.batch_id, row);
  }
  return [...latest.values()];
}
export function relatedRecommendations(prediction: FulfillmentPrediction, rows: ProductionRecommendation[]) {
  return rows.filter(row => row.production_date === prediction.production_date && row.batch_id === prediction.batch_id
    && row.prediction_id === prediction.id && row.status !== "rejected");
}
export const recommendationLabels: Record<string, string> = {
  upgrade_kapasitas: "Upgrade kapasitas", naikkan_speed: "Naikkan speed", pindahkan_alat: "Pindahkan alat", geser_jadwal: "Geser jadwal",
};

export const predictionLabels: Record<string, string> = {
  terpenuhi: "Diprediksi terpenuhi", berisiko: "Berisiko tidak terpenuhi",
  tidak_terpenuhi: "Diprediksi tidak terpenuhi", data_tidak_cukup: "Belum dapat dinilai",
};
/** Whole-day assessments are not counted as batches. Unknown statuses stay unassessed. */
export function predictionSummary(rows: FulfillmentPrediction[], batchIds: string[] | null) {
  const batchRows = [...new Map(rows.filter(row => row.batch_id).map(row => [row.batch_id!, row])).values()];
  const counts: Record<string, number> = { terpenuhi: 0, berisiko: 0, tidak_terpenuhi: 0, data_tidak_cukup: 0 };
  for (const row of batchRows) counts[Object.hasOwn(counts, row.fulfill_status) ? row.fulfill_status : "data_tidak_cukup"]++;
  const knownIds = batchIds === null ? null : new Set(batchIds);
  const predictedIds = new Set(batchRows.map(row => row.batch_id!));
  return {
    counts, assessed: batchRows.length, total: knownIds?.size ?? null,
    missing: knownIds ? [...knownIds].filter(id => !predictedIds.has(id)).length : null,
    mismatch: knownIds ? [...predictedIds].some(id => !knownIds.has(id)) : false,
    daily: rows.filter(row => row.batch_id === null).length,
  };
}
export function predictionTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Waktu perhitungan tidak disertakan";
  return `${new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} WIB`;
}
export function predictedShortage(value: number | null | undefined): string {
  if (value == null) return "Tidak disertakan pada hasil ini";
  if (!Number.isFinite(value) || value < 0) return "Nilai dari server perlu diperiksa";
  return `${new Intl.NumberFormat("id-ID").format(value)} L`;
}

export function batchTargetVolume(rows: ProductionLine[], batchId: string | null): number | null {
  const selected = rows.filter(row => batchId === null || row.batch_id === batchId);
  const unique = [...new Map(selected.map(row => [JSON.stringify([row.production_date, row.batch_id, row.line_no, row.production_order_id, row.finished_sku_id]), row])).values()];
  if (!unique.length || unique.some(row => row.target_volume_l == null || !Number.isFinite(row.target_volume_l) || row.target_volume_l < 0)) return null;
  return unique.reduce((sum, row) => sum + row.target_volume_l!, 0);
}

export function predictionInputs(facts: Record<string, unknown> | null) {
  return [
    ["batch_demand_l", "Kebutuhan susu dalam perhitungan"],
    ["opening_stock_l", "Stok awal acuan"],
    ["planned_supply_l", "Pasokan yang direncanakan"],
  ].map(([key, label]) => {
    const value = facts?.[key];
    return { key, label, value: typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 10 }).format(value)} L` : "Tidak disertakan pada hasil ini" };
  });
}
