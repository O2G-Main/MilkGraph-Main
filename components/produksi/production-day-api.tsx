"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { ProductionDaily, ProductionSession } from "@/lib/api/production";
import { canRunPrediction, planningPath, runPlanningPrediction, type FulfillmentPrediction, type PlanningList, type ProductionRecommendation } from "@/lib/api/planning";
import { latestPredictions, recommendationLabels, relatedRecommendations } from "@/lib/operational-prediction";
import { canSee, type RoleId } from "@/lib/roles";
import { usePlanningSelection } from "@/components/rencana/planning-state";
import styles from "./production-prediction.module.css";

const labels = { terpenuhi: "Diprediksi terpenuhi", berisiko: "Berisiko", tidak_terpenuhi: "Diprediksi tidak terpenuhi", data_tidak_cukup: "Data tidak cukup" };
const tones = { terpenuhi: "ok", berisiko: "warn", tidak_terpenuhi: "crit", data_tidak_cukup: "neutral" } as const;

export function ProductionDayApi({ date, role }: { date: string; role: RoleId }) {
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
  const rows = latestPredictions(predictions.data?.items ?? [], date);
  const canRecommend = canSee(role, "/rencana/upgrade");
  const reload = () => { void predictions.reload(); void recommendations.reload(); void daily.reload(); void session.reload(); };
  async function run() {
    if (!allowed || lock.current || !session.data) return;
    lock.current = true; setBusy(true); setError(null); setMessage(null);
    try {
      await runPlanningPrediction(filter, role, session.data.permissions);
      invalidateResources([planningPath("predictions", filter), planningPath("recommendations", filter), planningPath("daily", filter)]);
      setMessage("Prediksi dan rekomendasi berhasil dihitung serta dibaca ulang dari server.");
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Card>
    <SectionTitle title="Prediksi pemenuhan produksi" subtitle="Perkiraan berdasarkan fakta yang tersedia. Hasil prediksi terpisah dari realisasi produksi."
      action={<div className={styles.actions}>
        <button className="button secondary" disabled={busy} onClick={reload}><Icon icon={RefreshCw} size={16} />Muat ulang</button>
        {allowed && <button className="button primary" disabled={busy} onClick={() => void run()}>{busy ? "Menghitung…" : "Jalankan prediksi"}</button>}
      </div>} />
    {error && <p className="crit-text" role="alert">{error}</p>}
    {message && <p className="ok-text" role="status">{message}</p>}
    {session.error && <p className="crit-text" role="alert">Izin prediksi gagal dimuat. Muat ulang untuk mencoba lagi.</p>}
    {predictions.error ? <div role="alert"><p className="crit-text">Gagal memuat prediksi: {predictions.error.message}</p><button className="text-link" onClick={reload}>Coba lagi</button></div>
    : predictions.loading || !predictions.data ? <p className="muted" role="status">Memuat prediksi produksi…</p>
    : !rows.length ? <p className="muted">Belum ada prediksi untuk tanggal ini.{allowed ? " Jalankan prediksi untuk mengevaluasi pemenuhan." : " Planner dapat menjalankan prediksi saat data produksi tersedia."}</p>
    : <>
      <dl className={styles.summary}>{Object.entries(labels).map(([status, label]) => <div key={status}><dt>{label}</dt><dd>{rows.filter(row => row.fulfill_status === status).length}</dd></div>)}</dl>
      <ul className={styles.predictions}>{rows.map(row => {
        const candidates = relatedRecommendations(row, recommendations.data?.items ?? []);
        const needsAction = row.fulfill_status === "berisiko" || row.fulfill_status === "tidak_terpenuhi" || (row.shortage_l ?? 0) > 0;
        const batch = daily.data?.batches?.find(batch => batch.batch_id === row.batch_id);
        return <li key={row.id}>
          <header><h3>{batch?.batch_code || row.batch_id || "Seluruh produksi harian"}</h3><Badge tone={tones[row.fulfill_status] ?? "neutral"}>{labels[row.fulfill_status] ?? "Status belum dikenali"}</Badge></header>
          <p>{row.risk_reason || "Alasan prediksi belum tersedia."}</p>
          <dl className={styles.facts}><div><dt>Kekurangan terprediksi</dt><dd>{row.shortage_l == null ? "Belum dihitung" : `${new Intl.NumberFormat("id-ID").format(row.shortage_l)} L`}</dd></div><div><dt>Alat pembatas</dt><dd>{row.bottleneck_asset_id || "Belum tersedia"}</dd></div></dl>
          <p className="small muted">Dihitung: {row.calculated_at ? new Date(row.calculated_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "Belum tersedia"} WIB</p>
          {needsAction && <div className={styles.recommendation}>
            <strong>Solusi untuk ditinjau</strong>
            <p>{recommendations.error ? "Rekomendasi gagal dimuat. Gunakan Muat ulang." : recommendations.loading ? "Memuat rekomendasi…" : candidates.length ? [...new Set(candidates.map(item => recommendationLabels[item.recommendation_type] || item.recommendation_type))].join(" · ") : "Belum ada rekomendasi terkait hasil prediksi ini."}</p>
            {canRecommend ? <Link className="button secondary" href="/rencana/upgrade" onClick={() => { selection.chooseDate(date); selection.chooseBatch(row.batch_id || ""); }}>Lihat rekomendasi<Icon icon={ArrowRight} size={16} /></Link>
            : <p className="small muted">Minta Planner meninjau rekomendasi untuk batch ini.</p>}
          </div>}
        </li>;
      })}</ul>
    </>}
  </Card>;
}
