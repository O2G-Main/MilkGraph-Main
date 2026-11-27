"use client";

import { useResource } from "@/lib/api/resource";
import type { ProductionDaily } from "@/lib/api/production";
import { productionCondition, unavailableCondition } from "@/lib/production-condition";
import { dateInWib } from "@/lib/production-date";

export function useDayCondition(date: string, fetchOnMount = true) {
  const resource = useResource<ProductionDaily>(`/production/daily?date=${date}`, { fetchOnMount });
  const condition = resource.error ? unavailableCondition("error", resource.error.message)
    : resource.loading || !resource.data ? unavailableCondition("loading", "Status produksi sedang dimuat.")
    : !Array.isArray(resource.data.batches) || resource.data.production_date !== date
      ? unavailableCondition("unknown", "Ringkasan BE belum lengkap atau tanggalnya tidak sesuai.")
      : productionCondition(resource.data.batches, date, dateInWib());
  return { ...resource, condition };
}
