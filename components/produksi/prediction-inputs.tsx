"use client";

import { predictionInputs } from "@/lib/operational-prediction";
import styles from "./production-prediction.module.css";

export function PredictionInputs({ facts }: { facts: Record<string, unknown> | null }) {
  const fields = predictionInputs(facts);
  const hasInputs = fields.some(field => field.value !== "Tidak disertakan pada hasil ini");
  const count = facts?.opening_inventory_rows;
  return <section className={styles.inputFacts} aria-label="Data dasar prediksi">
    <h4>Data yang digunakan pada prediksi terakhir</h4>
    {hasInputs ? <dl className={styles.facts}>{fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl> : <p className="small muted">Rincian kebutuhan susu, stok awal, dan pasokan yang dipakai belum disertakan pada hasil ini.</p>}
    {typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && <p className="small muted">Perhitungan menyertakan {new Intl.NumberFormat("id-ID").format(count)} catatan stok.</p>}
    {hasInputs && <p className="small muted">Stok dan pasokan di atas adalah nilai acuan saat perhitungan dibuat. Nilai tersebut tidak menunjukkan saldo saat ini atau alokasi khusus untuk batch ini.</p>}
  </section>;
}
