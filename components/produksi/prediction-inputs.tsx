"use client";

import { predictionInputs, volumeComparison } from "@/lib/operational-prediction";
import styles from "./production-prediction.module.css";

const liters = (value: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 10 }).format(value)} L`;

export function PredictionInputs({ facts }: { facts: Record<string, unknown> | null }) {
  const fields = predictionInputs(facts);
  const hasInputs = fields.some(field => field.value !== "Tidak disertakan pada hasil ini");
  const chart = volumeComparison(facts);
  const count = facts?.opening_inventory_rows;
  return <section className={styles.inputFacts} aria-label="Data dasar prediksi">
    <h4>Perbandingan volume pada prediksi terakhir</h4>
    {chart ? <figure className={styles.volumeChart} aria-label="Perbandingan acuan volume dan kebutuhan batch dalam liter">
      <div className={styles.barHeading}><span>Acuan stok + pasokan</span><strong>{liters(chart.reference)}</strong></div>
      <div className={styles.volumeTrack} aria-hidden="true"><span className={styles.stockSegment} style={{ width: `${chart.stockWidth}%` }} /><span className={styles.supplySegment} style={{ width: `${chart.supplyWidth}%` }} /></div>
      <div className={styles.barHeading}><span>Kebutuhan dalam perhitungan</span><strong>{liters(chart.demand)}</strong></div>
      <div className={styles.volumeTrack} aria-hidden="true"><span className={styles.demandSegment} style={{ width: `${chart.demandWidth}%` }} /></div>
      {chart.demand > 0 && chart.demandWidth < 1 && <p className="small muted">Kebutuhan kurang dari 1% skala grafik. Angka liter tetap ditampilkan di atas.</p>}
      {chart.demand === 0 && <p className="small muted">Kebutuhan pada perhitungan bernilai 0 L. Periksa target batch sebelum menafsirkan hasil kecukupan.</p>}
      <figcaption className={styles.volumeLegend}><span><i className={styles.stockSegment} aria-hidden="true" />Stok awal acuan: {liters(chart.stock)}</span><span><i className={styles.supplySegment} aria-hidden="true" />Pasokan rencana: {liters(chart.supply)}</span></figcaption>
    </figure> : hasInputs ? <>
      <dl className={styles.facts}>{fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      <p className="small muted">Grafik belum dapat dibuat karena data pembanding atau snapshot stok belum lengkap.</p>
    </> : <p className="small muted">Rincian kebutuhan susu, stok awal, dan pasokan yang dipakai belum disertakan pada hasil ini.</p>}
    {typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && <p className="small muted">Acuan perhitungan mencakup {new Intl.NumberFormat("id-ID").format(count)} catatan stok.</p>}
    {hasInputs && <p className="small muted">Acuan stok berasal dari catatan hingga tanggal prediksi. Stok dan pasokan dipakai untuk membandingkan setiap batch secara terpisah. Nilai ini bukan saldo saat ini dan belum dikurangi alokasi batch lain.</p>}
  </section>;
}
