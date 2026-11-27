import { apiGet, apiSend } from "./client.ts";

export type PlanningList<T> = { count: number; items: T[] };
export type PlanningFilter = { date?: string; batch_id?: string };
export type PlanFilter = { week?: string; from?: string; to?: string };
export type RecommendationStatus = "draft" | "accepted" | "rejected" | "applied";
export type RecommendationType = "upgrade_kapasitas" | "naikkan_speed" | "pindahkan_alat" | "geser_jadwal";
export type WeeklyPlan = {
  proposal_id: string; week: number; week_start_sunday: string;
  finished_sku_id: string; product_name: string | null; pack_size_ml: number | null;
  market: string | null; target_packs: number | null; target_volume_l: number | null;
  batch_id: string | null; batch_code: string | null; production_date: string | null;
};
export type FulfillmentPrediction = {
  id: number; production_date: string; batch_id: string | null;
  fulfill_status: "terpenuhi" | "berisiko" | "tidak_terpenuhi" | "data_tidak_cukup";
  shortage_l: number | null; bottleneck_asset_id: string | null; risk_reason: string | null;
  input_facts: Record<string, unknown> | null; calculated_at: string;
};
export type ProductionRecommendation = {
  id: number; production_date: string; batch_id: string | null; prediction_id: number | null;
  recommendation_type: RecommendationType; target_asset_id: string | null;
  expected_gain: number | null; reason_facts: Record<string, unknown> | null;
  status: RecommendationStatus;
};

function query(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return path + (search.size ? `?${search}` : "");
}
export function planningPath(resource: "daily" | "schedule" | "predictions" | "recommendations", filter: PlanningFilter): string {
  return query(`/production/${resource}`, resource === "daily" ? { date: filter.date } : filter);
}
export function plansPath(filter: PlanFilter): string { return query("/production/plans", filter); }

export const recommendationStatuses: RecommendationStatus[] = ["draft", "accepted", "rejected", "applied"];
export function canRunPrediction(permissions: string[]): boolean {
  return permissions.includes("plan.decide");
}
export function canDecideRecommendation(permissions: string[]): boolean { return permissions.includes("plan.decide"); }

export async function runPlanningPrediction(filter: PlanningFilter, role: string, permissions: string[]) {
  if (!canRunPrediction(permissions)) throw new Error("Izin menjalankan prediksi tidak tersedia.");
  if (!filter.date || !/^\d{4}-\d{2}-\d{2}$/.test(filter.date)) throw new Error("Pilih tanggal produksi terlebih dahulu.");
  const parsedDate = new Date(`${filter.date}T00:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== filter.date) throw new Error("Tanggal produksi tidak valid.");
  await apiSend("POST", "/production/predictions/run", {
    production_date: filter.date, ...(filter.batch_id ? { batch_id: filter.batch_id } : {}),
  }, role);
  try {
    const [predictions, recommendations] = await Promise.all([
      apiGet<PlanningList<FulfillmentPrediction>>(planningPath("predictions", filter), role),
      apiGet<PlanningList<ProductionRecommendation>>(planningPath("recommendations", filter), role),
    ]);
    return { predictions, recommendations };
  } catch (error) {
    throw new Error(`Prediksi dikirim, tetapi hasil belum terverifikasi. Muat ulang sebelum mencoba lagi. ${error instanceof Error ? error.message : ""}`);
  }
}

export async function decideRecommendation(id: number, status: RecommendationStatus, filter: PlanningFilter, role: string, permissions: string[]) {
  if (!canDecideRecommendation(permissions)) throw new Error("Izin keputusan rekomendasi tidak tersedia.");
  if (!recommendationStatuses.includes(status)) throw new Error("Status rekomendasi tidak valid.");
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("ID rekomendasi tidak valid.");
  await apiSend("PATCH", `/production/recommendations/${id}`, { status }, role);
  try {
    const list = await apiGet<PlanningList<ProductionRecommendation>>(planningPath("recommendations", filter), role);
    if (!list.items.some(row => row.id === id && row.status === status)) throw new Error("Status belum terverifikasi pada daftar rekomendasi.");
    return list;
  } catch (error) {
    throw new Error(`Keputusan dikirim, tetapi status belum terverifikasi. Muat ulang sebelum mencoba lagi. ${error instanceof Error ? error.message : ""}`);
  }
}
