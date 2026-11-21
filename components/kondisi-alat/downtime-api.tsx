"use client";

import { useState, type FormEvent } from "react";
import { TimerOff, Wrench } from "lucide-react";
import { apiSend, type ApiError } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import {
  DOWNTIME_SOURCE_LABEL, DOWNTIME_TYPE_LABEL, PREDICTION_ALERT_LABEL, PREDICTION_ALERT_TONE, PREDICTION_BASIS_LABEL, fmtWaktu,
  type BeDowntimeEvent, type BeDowntimePrediction, type BeMaintenanceRecommendation,
} from "@/lib/api/contract";
import { Badge, Card, Icon, Modal, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";

const EVENTS = "/downtime-events";
const RECOMMENDATION = "/maintenance/recommendation";
/** Catat downtime digerbang permission downtime.record di server: operator dan superadmin. */
const canRecord = (role: string) => role === "operator" || role === "superadmin";
const statusOf = (e: Error | null) => (e as ApiError | null)?.status;
const duration = (start: string, end: string) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms <= 0) return "-";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`;
};
const days = (n: number | null) => (n === null ? "-" : `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })} hari`);

interface LinesRes { dedications: { line_id: string }[] }

/**
 * Downtime mode API: kejadian, prediksi, dan rekomendasi maintenance semuanya
 * dari Backend. Riwayat downtime di server memang mulai kosong (tidak ada seed
 * yang kredibel), jadi keadaan kosong di sini jujur, bukan data hilang.
 */
export function DowntimeApi({ role, machines }: { role: string; machines: { id: string; status?: string }[] }) {
  const eventsRes = useResource<BeDowntimeEvent[]>(EVENTS);
  const linesRes = useResource<LinesRes>("/master/lines");
  const [formOpen, setFormOpen] = useState(false);
  const [resource, setResource] = useState("");
  const [durationHours, setDurationHours] = useState(4);
  const [intervalDraft, setIntervalDraft] = useState("");
  const [interval, setInterval] = useState("");

  const events = eventsRes.data ?? [];
  const lineIds = (linesRes.data?.dedications ?? []).map(d => d.line_id);
  const resourceOptions = [...new Set([...lineIds, ...machines.map(m => m.id), ...events.map(e => e.resource_id)])];
  const picked = resource || resourceOptions[0] || "";
  const predPath = picked ? `/downtime-events/prediction?resource_id=${encodeURIComponent(picked)}${interval ? `&interval_days=${encodeURIComponent(interval)}` : ""}` : null;
  const recPath = picked ? `${RECOMMENDATION}?resource_id=${encodeURIComponent(picked)}&duration_hours=${durationHours}` : null;
  const predRes = useResource<BeDowntimePrediction>(predPath);
  const recRes = useResource<BeMaintenanceRecommendation>(recPath);
  const pred = predRes.data;
  const rec = statusOf(recRes.error) === 404 ? null : recRes.data;
  const write = canRecord(role);

  return (
    <>
      <Card className="downtime-card">
        <SectionTitle title="Downtime" subtitle="Kejadian downtime dari server. Riwayat memang mulai kosong karena belum pernah dicatat, dan tumbuh dari catatan operator atau IoT."
          action={write ? <button className="button primary" onClick={() => setFormOpen(true)}><Icon icon={TimerOff} size={16} />Catat downtime</button> : undefined} />
        {eventsRes.error && <p className="crit-text" role="alert">Gagal memuat downtime: {eventsRes.error.message}</p>}
        {!eventsRes.data && !eventsRes.error && <p className="muted" role="status">Memuat downtime…</p>}
        {eventsRes.data && (events.length ? (
          <div className="table-wrap"><table className="schedule-table">
            <thead><tr><th>Alat</th><th>Tipe</th><th>Mulai</th><th>Selesai</th><th className="numeric">Lama</th><th>Sumber</th></tr></thead>
            <tbody>{events.map(e => <tr key={e.event_id}>
              <td><strong className="mono">{e.resource_id}</strong><span className="table-sub">{e.event_id}</span></td>
              <td data-label="Tipe"><Badge tone={e.type === "breakdown" ? "crit" : e.type === "cleaning" ? "neutral" : "warn"}>{DOWNTIME_TYPE_LABEL[e.type] ?? e.type}</Badge></td>
              <td data-label="Mulai">{fmtWaktu(e.start)}</td>
              <td data-label="Selesai">{fmtWaktu(e.end)}</td>
              <td data-label="Lama" className="numeric">{duration(e.start, e.end)}</td>
              <td data-label="Sumber">{DOWNTIME_SOURCE_LABEL[e.source] ?? e.source}</td>
            </tr>)}</tbody>
          </table></div>
        ) : <p className="muted">Belum ada kejadian downtime tercatat di server.{write ? " Pakai tombol Catat downtime untuk mencatat kejadian pertama." : ""}</p>)}
        {!write && <p className="small muted">Mencatat downtime hanya untuk Operator dan Superadmin, sesuai permission downtime.record di server. Role lain membaca riwayat dan prediksi di halaman ini.</p>}
      </Card>

      <Card>
        <SectionTitle title="Prediksi downtime dan rekomendasi maintenance" subtitle="Prediksi dihitung server dari interval antar waktu mulai kejadian. Rekomendasi mencari celah kosong pada jadwal tersimpan yang berakhir sebelum prediksi downtime berikutnya." />
        <form className="schedule-form" onSubmit={e => { e.preventDefault(); setInterval(intervalDraft.trim()); }} noValidate>
          <div className="schedule-form-row">
            <label><span className="field-label">Alat</span><Select label="Alat untuk prediksi" value={picked} onChange={setResource} options={resourceOptions.map(id => ({ value: id, label: id }))} placeholder="Pilih alat" /></label>
            <label><span className="field-label">Durasi maintenance (jam)</span><Select label="Durasi maintenance" value={String(durationHours)} onChange={v => setDurationHours(Number(v))} options={[2, 4, 6, 8].map(h => ({ value: String(h), label: `${h} jam` }))} /></label>
            <label><span className="field-label">Interval konfigurasi (hari, opsional)</span><input type="number" min={1} step="any" value={intervalDraft} onChange={e => setIntervalDraft(e.target.value)} placeholder="Kosongkan bila memakai riwayat" /></label>
          </div>
          <div className="dialog-actions">
            <button type="submit" className="button secondary">Hitung prediksi</button>
          </div>
        </form>
        {!picked && <p className="muted">Pilih alat untuk melihat prediksi dan rekomendasi.</p>}
        {picked && predRes.error && <p className="crit-text" role="alert">Gagal memuat prediksi: {predRes.error.message}</p>}
        {picked && !pred && !predRes.error && <p className="muted" role="status">Memuat prediksi…</p>}
        {pred && <div>
          <div className="schedule-stats">
            <Card><span className="small muted">Status prediksi {pred.resource_id}</span><strong><Badge tone={PREDICTION_ALERT_TONE[pred.alert] ?? "neutral"}>{PREDICTION_ALERT_LABEL[pred.alert] ?? pred.alert}</Badge></strong><span className="small muted">{pred.predicted_next ? `Perkiraan berikutnya ${fmtWaktu(pred.predicted_next)}` : "Belum ada perkiraan tanggal"}</span></Card>
            <Card><span className="small muted">Sisa waktu</span><strong>{days(pred.days_remaining)}</strong><span className="small muted">{pred.days_remaining !== null && pred.days_remaining < 0 ? "Sudah lewat dari perkiraan" : "Menuju perkiraan downtime"}</span></Card>
            <Card><span className="small muted">Dasar hitung</span><strong>{pred.events_count}</strong><span className="small muted">kejadian tercatat, rata-rata interval {pred.avg_interval_days !== null ? days(pred.avg_interval_days) : "-"}</span></Card>
          </div>
          <p className="small muted">Basis prediksi: {PREDICTION_BASIS_LABEL[pred.basis] ?? pred.basis}.{pred.last_event_at ? ` Kejadian terakhir mulai ${fmtWaktu(pred.last_event_at)}.` : ""} {pred.basis === "insufficient_data" ? "Prediksi baru bisa dihitung setelah ada minimal tiga kejadian, atau bila interval konfigurasi diisi." : ""}</p>
        </div>}
        {picked && recRes.error && statusOf(recRes.error) !== 404 && <p className="crit-text" role="alert">Gagal memuat rekomendasi: {recRes.error.message}</p>}
        {picked && !recRes.error && !rec && <p className="muted" role="status">Memuat rekomendasi…</p>}
        {picked && recRes.error && statusOf(recRes.error) === 404 && <p className="muted"><Icon icon={Wrench} size={15} /> Belum ada rekomendasi maintenance untuk {picked}: server belum punya jadwal tersimpan atau prediksi downtime untuk alat ini.</p>}
        {rec && <div className="callout ok">
          <Icon icon={Wrench} size={20} />
          <div><strong>Waktu maintenance yang disarankan untuk {rec.resource_id}: {fmtWaktu(rec.recommended_start)} sampai {fmtWaktu(rec.recommended_end)} ({rec.duration_hours} jam)</strong>
          <p>{rec.reason}</p></div>
        </div>}
      </Card>

      {formOpen && <DowntimeForm machines={machines} lineIds={lineIds} role={role} onClose={() => setFormOpen(false)} />}
    </>
  );
}

function DowntimeForm({ machines, lineIds, role, onClose }: { machines: { id: string; status?: string }[]; lineIds: string[]; role: string; onClose: () => void }) {
  const options = [...new Set([...machines.map(m => m.id), ...lineIds])];
  const [resource, setResource] = useState(options[0] ?? "");
  const [type, setType] = useState("breakdown");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!resource) return setError("Pilih alat yang berhenti.");
    if (!start || !end) return setError("Isi jam mulai dan selesai.");
    if (end <= start) return setError("Jam selesai harus setelah jam mulai.");
    setSaving(true); setError(null);
    try {
      await apiSend("POST", EVENTS, { resource_id: resource, start: `${start}:00+07:00`, end: `${end}:00+07:00`, type, source: "user_input" }, role);
      invalidateResources([EVENTS, RECOMMENDATION, "/dashboard/executive"]);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSaving(false); }
  }

  return (
    <Modal title="Catat downtime" onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Alat</span><Select label="Alat yang berhenti" value={resource} onChange={setResource} options={options.map(id => ({ value: id, label: id }))} placeholder="Pilih alat" /></label>
          <label><span className="field-label">Tipe</span><Select label="Tipe downtime" value={type} onChange={setType} options={Object.entries(DOWNTIME_TYPE_LABEL).map(([value, label]) => ({ value, label }))} /></label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Mulai (WIB)</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label><span className="field-label">Selesai (WIB)</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <p className="small muted">Kejadian tersimpan di server sebagai catatan pengguna dan langsung ikut dihitung pada prediksi. Waktu selesai wajib sesudah waktu mulai.</p>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan downtime"}</button>
        </div>
      </form>
    </Modal>
  );
}
