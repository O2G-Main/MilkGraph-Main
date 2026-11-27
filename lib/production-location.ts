export type ProductionTab = "kondisi" | "proses" | "prediksi";
export function productionTab(value: unknown): ProductionTab { return value === "proses" || value === "prediksi" ? value : "kondisi"; }
export function productionLocation(tab: ProductionTab, date?: string, batch?: string) {
  const params = new URLSearchParams({ tab });
  if (date) params.set("date",date);
  if (batch) params.set("batch",batch);
  return `/produksi?${params}`;
}
