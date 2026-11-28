"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, CircleCheck, CircleAlert, CircleHelp } from "lucide-react";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { ProductionDaily, ProductionSession } from "@/lib/api/production";
import { canRunPrediction, planningPath, runPlanningPrediction, type FulfillmentPrediction, type PlanningList, type ProductionRecommendation } from "@/lib/api/planning";
import { batchTargetVolume, predictionExplanation, latestPredictions, predictionLabels, predictionSummary, predictionTime, predictedShortage, recommendationLabels, relatedRecommendations } from "@/lib/operational-prediction";
import { canSee, type RoleId } from "@/lib/roles";
import { usePlanningSelection } from "@/components/rencana/planning-state";
import { recommendationOrigin, recommendationLink } from "@/lib/recommendation-origin";
import { PredictionInputs } from "./prediction-inputs";
import styles from "./production-prediction.module.css";

const tones = { terpenuhi: "ok", berisiko: "warn", tidak_terpenuhi: "crit", data_tidak_cukup: "neutral" } as const;

export function ProductionDayApi({ date, role, display = "detailed" }: { date: string; role: RoleId; display?: "detailed" | "status" }) {
  const filter = { date };
  const predictions = useResource<PlanningList<FulfillmentPrediction>>(planningPath("predictions", filter));
  const recommendations = useResource<PlanningList<ProductionRecommendation>>(planningPath("recommendations", filter));
  const daily = useResource<ProductionDaily>(planningPath("daily", filter));
  const session = useResource<ProductionSession>("/session");
  const selection = usePlanningSelection();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = !session.loading && !session.error && session.data?.role === role && canRunPrediction(session.data.permissions);
  const predictionProblem = predictions.error?.message || (predictions.data && !Array.isArray(predictions.data.items) ? "Format hasil prediksi dari server belum dapat dibaca." : null);
  const recommendationProblem = recommendations.error || (recommendations.data && !Array.isArray(recommendations.data.items));
  const dailyRows = Array.isArray(daily.data?.batches) ? daily.data.batches : [];
  const rows = latestPredictions(Array.isArray(predictions.data?.items) ? predictions.data.items : [], date);
  const batchListReady = !daily.error && !daily.loading && daily.data?.production_date === date && Array.isArray(daily.data.batches);
  const summary = predictionSummary(rows, batchListReady ? dailyRows.map(batch => batch.batch_id) : null);
  const noBatches = summary.total === 0 && !summary.mismatch && rows.length === 0;
  const unassessed = [...new Map(dailyRows.map(row => [row.batch_id,row])).values()].filter(batch => !rows.some(row => row.batch_id === batch.batch_id));
  const canRecommend = canSee(role, "/rencana/upgrade");
  const reload = () => { setMessage(null); setError(null); void predictions.reload(); void recommendations.reload(); void daily.reload(); void session.reload(); };
  async function run() {
    if (!allowed || lock.current || !session.data) return;
    lock.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      const result = await runPlanningPrediction(filter, role, session.data.permissions);
      invalidateResources([planningPath("predictions", filter), planningPath("recommendations", filter), planningPath("daily", filter)]);
      setMessage(latestPredictions(result.predictions.items, date).length ? "Hasil perhitungan terbaru sudah diterima. Tinjau status dan rekomendasi di bawah." : "Permintaan perhitungan selesai, tetapi server belum mengirim hasil prediksi untuk tanggal ini.");
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Card className={display === "status" ? styles.statusView : ""}>
    <SectionTitle title="Prediksi pemenuhan volume produksi" subtitle={`Prediksi untuk ${new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}. Status menunjukkan perkiraan pemenuhan target; hasil produksi aktual dilihat di Riwayat Produksi.`}
      action={<div className={styles.actions}>
        <button className="button secondary" disabled={busy} onClick={reload}><Icon icon={RefreshCw} size={16} />Perbarui tampilan</button>
        {allowed && <button className="button primary" disabled={busy || noBatches} onClick={() => void run()}>{busy ? "Menghitung prediksi…" : rows.length ? "Hitung ulang prediksi" : "Hitung prediksi"}</button>}
      </div>} />
    <section className={styles.scope} aria-label="Cakupan perhitungan">
      <strong>Prediksi saat ini menilai kecukupan volume susu per batch.</strong>
      <p>Kebutuhan batch dibandingkan dengan acuan stok awal + pasokan rencana. Kapasitas waktu, speed alat, dan pembagian stok antarbatch belum diperhitungkan oleh perhitungan ini.</p>
    </section>
    <p className={`small muted ${styles.help}`}>Perbarui tampilan mengambil hasil yang sudah tersimpan.{allowed ? " Hitung prediksi mengevaluasi data produksi dan menyiapkan rekomendasi, tanpa menjalankan produksi atau mengubah alat." : " Perhitungan prediksi memerlukan izin dari pengelola sistem."}</p>
    {(daily.error || (daily.data && !batchListReady && !daily.loading)) && <p className="small crit-text" role="alert">Daftar batch gagal dimuat. Cakupan seluruh batch dan nama batch belum dapat dipastikan.</p>}
    {error && <p className="crit-text" role="alert">{error}</p>}
    {message && <p className="ok-text" role="status">{message}</p>}
    {session.error && <p className="crit-text" role="alert">Izin prediksi gagal dimuat. Muat ulang untuk mencoba lagi.</p>}
    {predictionProblem ? <div role="alert"><p className="crit-text">Gagal memuat prediksi: {predictionProblem}</p><button className="text-link" onClick={reload}>Coba lagi</button></div>
    : predictions.loading || !predictions.data ? <p className="muted" role="status">Memuat prediksi produksi…</p>
    : !rows.length ? <div role="status"><p className="muted">{noBatches ? "Belum ada batch produksi pada tanggal ini." : "Belum ada hasil prediksi untuk tanggal ini."}</p><p className="small muted">{noBatches ? "Tambahkan batch melalui Penjadwalan, lalu hitung prediksinya." : allowed ? "Pilih Hitung prediksi untuk mengevaluasi data produksi yang tersedia." : "Minta Planner menghitung prediksi setelah data produksi tersedia."}</p></div>
    : <>
      <div className={styles.coverage}>
        <p>{summary.mismatch ? `${summary.assessed} batch memiliki hasil prediksi. Daftar batch dan hasil prediksi belum sinkron; perbarui tampilan.` : summary.total === null ? `${summary.assessed} batch memiliki hasil prediksi. Jumlah seluruh batch belum tersedia.` : `${summary.assessed} dari ${summary.total} batch memiliki hasil prediksi.`}</p>
        {summary.missing !== null && summary.missing > 0 && <p className="small muted">{summary.missing} batch belum memiliki hasil prediksi. Cakupan prediksi tanggal ini belum lengkap.</p>}
        {summary.daily > 0 && <p className="small muted">Ada prediksi untuk seluruh hari yang ditampilkan terpisah dan tidak dihitung sebagai batch.</p>}
      </div>
      {(summary.assessed > 0 || (summary.total ?? 0) > 0) && <dl className={styles.summary} aria-label="Jumlah batch menurut hasil prediksi">{Object.entries(predictionLabels).map(([status, label]) => <div key={status}><dt>{label}</dt><dd>{summary.counts[status]} <span>batch</span></dd></div>)}</dl>}
      <ul className={styles.predictions}>{rows.map((row, index) => {
        const candidates = recommendationProblem || recommendations.loading ? [] : relatedRecommendations(row, Array.isArray(recommendations.data?.items) ? recommendations.data.items : []);
        const needsAction = row.fulfill_status === "berisiko" || row.fulfill_status === "tidak_terpenuhi" || (row.shortage_l ?? 0) > 0;
        const batch = dailyRows.find(batch => batch.batch_id === row.batch_id);
        const target = batchListReady ? batchTargetVolume(dailyRows, row.batch_id) : null;
        return <li key={row.id}>
          <header><h3>{display === "status" && <span className={styles.statusIcon} data-tone={tones[row.fulfill_status] || "neutral"}><Icon icon={row.fulfill_status === "terpenuhi" ? CircleCheck : row.fulfill_status === "data_tidak_cukup" ? CircleHelp : CircleAlert} size={22}/></span>} {row.batch_id ? `Batch ${batch?.batch_code || row.batch_id}` : row.batch_id === null ? "Prediksi seluruh hari" : "Cakupan prediksi tidak disertakan"}</h3><Badge tone={tones[row.fulfill_status] ?? "neutral"}>{predictionLabels[row.fulfill_status] ?? "Belum dapat dinilai"}</Badge></header>
          <p>{predictionExplanation(row)}</p>
          {row.fulfill_status === "terpenuhi" && (row.shortage_l ?? 0) > 0 && <p className="crit-text" role="alert">Status terpenuhi dan perkiraan kekurangan dari server tidak konsisten. Tinjau kembali hasil ini.</p>}
          {row.fulfill_status === "data_tidak_cukup" && <p className="small muted">Data belum cukup untuk menyatakan target akan terpenuhi atau tidak. Lengkapi data batch dan alat pada tanggal terpilih, lalu hitung ulang prediksi.</p>}
          <dl className={styles.facts}><div><dt>{row.batch_id ? "Target batch (liter)" : "Target hari terpilih (liter)"}</dt><dd>{target === null ? "Target belum tersedia pada data batch" : `${new Intl.NumberFormat("id-ID").format(target)} L`}</dd></div><div><dt>Perkiraan kekurangan (liter)</dt><dd>{predictedShortage(row.shortage_l)}</dd></div><div><dt>Lini/alat rujukan dari server</dt><dd>{row.bottleneck_asset_id || "Tidak disebutkan dalam hasil prediksi"}</dd></div></dl>
          <p className="small muted">Perhitungan terakhir: {predictionTime(row.calculated_at)}</p>
          <details className={styles.calculationDetails} open={display === "detailed" && index === 0}>
            <summary>Lihat perbandingan volume dan data sumber</summary>
            <PredictionInputs facts={row.input_facts} />
          </details>
          {needsAction && <div className={styles.recommendation}>
            <strong>{candidates.length === 1 ? "Rekomendasi pilihan server" : candidates.length ? `${candidates.length} rekomendasi terkait` : "Tindak lanjut prediksi"}</strong>
            {candidates.map(candidate => <div key={candidate.id} className={styles.solution}><Badge tone={recommendationOrigin(candidate).tone}>{recommendationOrigin(candidate).label}</Badge><span>{recommendationLabels[candidate.recommendation_type] || candidate.recommendation_type}</span></div>)}
            {(recommendationProblem || recommendations.loading || !candidates.length) && <p>{recommendationProblem ? "Rekomendasi gagal dimuat. Pilih Perbarui tampilan." : recommendations.loading ? "Memuat rekomendasi…" : "Belum ada rekomendasi aktif yang terhubung ke hasil prediksi ini."}</p>}
            {canRecommend ? <Link className={`button ${display === "status" ? "primary" : "secondary"}`} href={recommendationLink(date,row.batch_id,row.id)} onClick={() => { selection.chooseDate(date); selection.chooseBatch(row.batch_id || ""); }} aria-label={`${candidates.length ? "Tinjau" : "Periksa"} rekomendasi untuk ${row.batch_id ? `batch ${batch?.batch_code || row.batch_id}` : "seluruh hari"}`}>{candidates.length ? "Tinjau rekomendasi" : "Periksa rekomendasi"}<Icon icon={ArrowRight} size={16} /></Link>
            : <p className="small muted">Minta Planner meninjau rekomendasi untuk batch ini.</p>}
          </div>}
        </li>;
      })}</ul>
    </>}
    {display === "status" && batchListReady && !predictionProblem && !predictions.loading && predictions.data && unassessed.length > 0 && <ul className={`${styles.predictions} ${styles.unassessed}`}>{unassessed.map(batch => <li key={batch.batch_id}><header><h3><Icon icon={CircleHelp} size={22}/>Batch {batch.batch_code || batch.batch_id}</h3><Badge tone="neutral">Belum dihitung</Badge></header><p className="small muted">Belum ada hasil prediksi yang terkait batch ini pada tanggal terpilih.</p></li>)}</ul>}
  </Card>;
}
