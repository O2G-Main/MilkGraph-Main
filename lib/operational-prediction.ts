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
