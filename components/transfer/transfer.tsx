"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, ArrowRightLeft, Radio, X } from "lucide-react";
import { assignedAssets, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { scenario } from "@/lib/data";
import { ASSETS } from "@/lib/assets";
import { applyQueue, clock, toMin } from "@/lib/receiving";
import { mayHandle } from "@/lib/operation";
import { saveTransfer, useFlows } from "@/lib/flows";
import { API_MODE } from "@/lib/api/client";
import { useNovemberTanks } from "@/lib/api/scenario-nov";
import { TankVolumeApiCard } from "./tank-volume-api";
import { NeracaHarianApiCard } from "./neraca-harian-api";
import { diffTone, levelAfter, type FlowRow } from "@/lib/volume";
import { asepticTanks, midTanks } from "@/mock/ops";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle, Toggle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const pct = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });
/** Tangki yang volumenya dilacak: raw milk tank, tangki tengah, dan tangki aseptik. */
export const TANKS = [
  ...scenario.assets.filter(a => a.kind === "Buffer").map(a => ({ id: a.id, level: a.fill, capacity: a.capacity })),
  ...midTanks.map(t => ({ id: t.id, level: t.level, capacity: t.capacity })),
  ...asepticTanks.map(t => ({ id: t.id, level: t.level, capacity: t.capacity })),
];
const PROCESS = ASSETS.filter(a => ["Susu mentah", "Penyimpanan", "Mixing", "Sterilisasi", "Tangki aseptik", "Filling"].includes(a.stage));

export function Transfer({ alat }: { alat?: string }) {
  const demo = useDemo();
  const [source, setSource] = useState<"semua" | "manual" | "iot">("semua");
  const [open, setOpen] = useState(false);
  const assigned = assignedAssets(demo);
  const canRt = can(demo.role, "transfer.record");
  const canProc = can(demo.role, "process.transfer");
  const { flows: all, iot, loading, error } = useFlows(demo);
  // Pengguna dengan penugasan alat hanya melihat transfer yang menyentuh alatnya.
  const mine = all.filter(f => !assigned || mayHandle(assigned, f.from) || mayHandle(assigned, f.to));
  const flows = mine.filter(f => (!alat || f.from === alat || f.to === alat) && (source === "semua" || f.source === source));
  const fresh = flows.filter(f => !f.counted);
  const out = flows.reduce((s, f) => s + f.out, 0), inn = flows.reduce((s, f) => s + f.in, 0);
  const flagged = flows.filter(f => diffTone(f.diffPct) !== "ok");
  const tanks = TANKS.filter(t => (alat ? t.id === alat : all.some(f => f.from === t.id || f.to === t.id) || t.id.startsWith("RMT")) && (!assigned || mayHandle(assigned, t.id) || t.id.startsWith("RMT")));
  // Mode API: kartu volume memakai snapshot 28 tangki skenario November
  // dari server (konteks stok historis), bukan daftar tangki skenario lokal.
  const { tanks: novTanks } = useNovemberTanks();
  const apiTanks = (novTanks ?? []).filter(t => !alat || t.id === alat);
  const after = all.filter(f => !f.counted);

  return (
    <div className="page-enter">
      <PageHeading title="Transfer & Volume" subtitle="Perpindahan susu antar tangki dan alat. Satu catatan langsung terhubung ke alat asal dan tujuan, volume tangki ikut diperbarui, dan selisih keluar dibanding diterima jadi mass balance.">
        {(canRt || canProc) && <button className="button primary" onClick={() => setOpen(true)}><Icon icon={ArrowRightLeft} size={16} />Catat transfer</button>}
      </PageHeading>
      {loading && <p className="muted" role="status">Memuat riwayat transfer…</p>}
      {error && <p className="crit-text" role="alert">Gagal memuat transfer: {error.message}</p>}
      <div className="page-tabs flow-filters">
        <Toggle label="Sumber data" value={source} onChange={setSource} options={[{ value: "semua", label: `Semua (${mine.length})` }, { value: "manual", label: `Manual (${mine.filter(f => f.source === "manual").length})` }, { value: "iot", label: `IoT (${mine.filter(f => f.source === "iot").length})` }]} />
        {alat && <Link className="filter-chip" href="/transfer" aria-label={`Hapus filter alat ${alat}`}>Alat {alat}<Icon icon={X} size={14} /></Link>}
      </div>
      <div className="schedule-stats planner-kpis">
        <Card><span className="small muted">Transfer tercatat</span><strong>{flows.length}</strong><span className="small muted">{fresh.length} setelah snapshot 1 Nov 06.00</span></Card>
        <Card><span className="small muted">Keluar dari alat asal</span><strong>{number(out)} <small>L</small></strong><span className="small muted">Diterima {number(inn)} L</span></Card>
        <Card><span className="small muted">Selisih total</span><strong className={`${diffTone(out ? (out - inn) / out * 100 : 0)}-text`}>{number(out - inn)} <small>L</small></strong><span className="small muted">{out ? `${pct((out - inn) / out * 100)}% dari volume keluar` : "Belum ada transfer"}</span></Card>
        <Card><span className="small muted">Di luar toleransi</span><strong className={flagged.length ? "warn-text" : "ok-text"}>{flagged.length}</strong><span className="small muted">Selisih di atas 0,5% [asumsi]</span></Card>
      </div>
      {API_MODE ? <TankVolumeApiCard tanks={apiTanks} alat={alat} /> : <>
      <Card className="rules-card">
        <SectionTitle title="Volume tangki terkini" subtitle="Level snapshot 14.42 ditambah yang diterima dan dikurangi yang keluar dari transfer setelahnya." />
        <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>Tangki</th><th className="numeric">Snapshot</th><th className="numeric">Masuk</th><th className="numeric">Keluar</th><th className="numeric">Volume terkini</th><th className="numeric">Terisi</th><th><span className="sr-only">Riwayat</span></th></tr></thead>
          <tbody>{tanks.map(t => {
            const inT = after.filter(f => f.to === t.id).reduce((s, f) => s + f.in, 0), outT = after.filter(f => f.from === t.id).reduce((s, f) => s + f.out, 0);
            const now = levelAfter(t.id, t.level, all);
            const fill = Math.round(now / t.capacity * 100);
            return <tr key={t.id}>
              <td><strong className="mono">{t.id}</strong></td>
              <td data-label="Snapshot" className="numeric">{number(t.level)} L</td>
              <td data-label="Masuk" className="numeric">{inT ? `+${number(inT)} L` : "-"}</td>
              <td data-label="Keluar" className="numeric">{outT ? `-${number(outT)} L` : "-"}</td>
              <td data-label="Volume terkini" className="numeric"><strong>{number(now)} L</strong></td>
              <td data-label="Terisi" className={`numeric ${fill >= 95 || now < 0 ? "crit-text" : fill >= 85 ? "warn-text" : ""}`}>{fill}%</td>
              <td className="table-action">{alat !== t.id && <Link className="text-link" href={`/transfer?alat=${t.id}`}>Riwayat<ArrowRight size={14} aria-hidden /></Link>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </Card>
      </>}
      {API_MODE && <NeracaHarianApiCard />}
      <Card>
        <SectionTitle title={alat ? `Riwayat transfer ${alat}` : "Riwayat transfer"} subtitle="Selisih = volume keluar dari alat asal dikurangi volume diterima alat tujuan." />
        <div className="table-wrap"><table className="schedule-table flow-table">
          <thead><tr><th>Transfer</th><th>Dari ke</th><th className="numeric">Keluar</th><th className="numeric">Diterima</th><th className="numeric">Selisih</th><th>Waktu</th><th>Sumber</th></tr></thead>
          <tbody>
            {flows.map(f => <FlowLine key={f.id} f={f} />)}
            {!flows.length && <tr><td colSpan={7} className="muted">Belum ada transfer{alat ? ` untuk ${alat}` : ""}.</td></tr>}
          </tbody>
        </table></div>
      </Card>
      {can(demo.role, "integration.manage") && <Card className="rules-card">
        <SectionTitle title="Integrasi IoT Greenfields" subtitle="Flowmeter dan sensor level bisa mengirim transfer otomatis. Data IoT tampil dengan sumber IoT, perangkat, dan waktu pengukuran." />
        {API_MODE
          ? <p className="small"><span className="mono">POST /api/v1/trace/transfers</span> dengan <span className="mono">{"{ batch_id, from_ref, to_ref, volume_out_l, volume_in_l, source: \"IoT\", recorded_at }"}</span>. Selisih dihitung server. Daftar per batch: <span className="mono">GET /api/v1/trace/transfers?batch_id=</span>.</p>
          : <p className="small"><span className="mono">POST /api/v1/transfers</span> dengan <span className="mono">{"{ from, to, out, in, start, end, measuredAt, device, batch? }"}</span>, satu objek atau array sampai 100 data. Header <span className="mono">Authorization: Bearer &lt;IOT_INGEST_KEY&gt;</span>. Daftar: <span className="mono">GET /api/v1/transfers?alat=AT-2</span>.</p>}
        <p className="small muted">{API_MODE ? `${all.filter(f => f.source === "iot").length} transfer IoT tercatat di server.` : iot.length ? `${iot.length} data IoT diterima, terakhir dari ${iot[0].device} pukul ${clock(iot[0].receivedAt)}.` : "Belum ada data IoT yang masuk."}</p>
      </Card>}
      {open && <FlowForm canRt={canRt} canProc={canProc} assigned={assigned} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Satu baris riwayat transfer: dua alat, volume keluar dan diterima, selisih, waktu, dan sumber. */
export function FlowLine({ f }: { f: FlowRow }) {
  const tone = diffTone(f.diffPct);
  return <tr>
    <td className="schedule-time">{f.id}<span className="table-sub">{f.kind === "rt" ? "RT ke tangki" : "Antar alat"}{f.batch ? ` · ${f.batch}` : ""}</span></td>
    <td data-label="Dari ke"><strong className="mono">{f.from}</strong> <span className="muted">ke</span> <strong className="mono">{f.to}</strong>{f.note && <span className="table-sub">{f.note}</span>}</td>
    <td data-label="Keluar" className="numeric">{number(f.out)} L</td>
    <td data-label="Diterima" className="numeric">{number(f.in)} L</td>
    <td data-label="Selisih" className="numeric"><Badge tone={tone}>{number(f.diff)} L</Badge><span className="table-sub">{pct(f.diffPct)}%</span></td>
    <td data-label="Waktu" className="schedule-time">{clock(f.start)}-{clock(f.end)}<span className="table-sub">Diukur {clock(f.measuredAt)}{f.counted ? ", sudah di snapshot" : ""}</span></td>
    <td data-label="Sumber">{f.source === "iot" ? <Badge tone="ok"><Radio size={12} aria-hidden />IoT</Badge> : <Badge>Manual</Badge>}<span className="table-sub">{f.source === "iot" ? f.device : f.by ?? "-"}</span></td>
  </tr>;
}

function FlowForm({ canRt, canProc, assigned, onClose }: { canRt: boolean; canProc: boolean; assigned: string[] | undefined; onClose: () => void }) {
  const demo = useDemo();
  const rts = canRt ? applyQueue(scenario.tankers, demo.receiving, demo.limits.holdingMin).filter(r => r.stage === "Unloading" || r.stage === "Selesai bongkar") : [];
  const procs = canProc ? PROCESS : [];
  const fromOptions = [...rts.map(r => ({ value: r.id, label: r.id, hint: `${r.farm}, timbang ${number(r.volume)} L`, group: "Road tanker" })), ...procs.map(a => ({ value: a.id, label: a.id, hint: a.status, group: a.group }))];
  const toOptions = PROCESS.map(a => ({ value: a.id, label: a.id, hint: a.status, group: a.group }));
  const first = rts[0];
  const [from, setFrom] = useState(first?.id ?? (procs.some(a => a.id === "UHT-2") ? "UHT-2" : procs[0]?.id ?? ""));
  const [to, setTo] = useState(first ? "RMT-3" : "AT-2");
  const [out, setOut] = useState(first?.volume ?? 0);
  const [inn, setIn] = useState(first?.volume ?? 0);
  const [start, setStart] = useState(first?.unloadStart ?? "14:45");
  const [end, setEnd] = useState(first?.unloadEnd ?? "15:15");
  const [measuredAt, setMeasuredAt] = useState(first?.unloadEnd ?? "15:15");
  const [batch, setBatch] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const diff = out - inn, diffPct = out ? diff / out * 100 : 0;
  const choose = (v: string) => { setFrom(v); setError(null); const r = rts.find(x => x.id === v); if (r) { setOut(r.volume); setIn(r.volume); } };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!from || !to) return setError("Pilih alat asal dan tujuan.");
    if (from === to) return setError("Alat asal dan tujuan harus berbeda.");
    if (!(out > 0)) return setError("Isi volume keluar lebih dari 0 L.");
    if (!(inn >= 0)) return setError("Volume diterima tidak boleh negatif.");
    if (toMin(end) <= toMin(start)) return setError("Jam selesai harus setelah jam mulai.");
    if (!from.startsWith("RT-") && assigned && !mayHandle(assigned, from) && !mayHandle(assigned, to)) return setError("Salah satu alat harus alat yang ditugaskan kepadamu.");
    if (API_MODE && !batch.trim()) return setError("Isi batch, server menautkan transfer ke batch.");
    setSaving(true);
    try {
      await saveTransfer({ from, to, out, in: inn, start, end, measuredAt, batch: batch.trim() || undefined, note: note.trim() || undefined }, demo.role);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat transfer.");
      setSaving(false);
    }
  }

  return (
    <Modal title="Catat transfer" onClose={onClose} className="lab-entry-modal">
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Dari alat</span><Select label="Alat asal" value={from} onChange={choose} options={fromOptions} searchable /></label>
          <label><span className="field-label">Ke alat</span><Select label="Alat tujuan" value={to} onChange={v => { setTo(v); setError(null); }} options={toOptions} searchable /></label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Volume keluar (L)</span><input type="number" inputMode="numeric" min={1} step={10} value={out || ""} onChange={e => { setOut(Number(e.target.value)); setError(null); }} /></label>
          <label><span className="field-label">Volume diterima (L)</span><input type="number" inputMode="numeric" min={0} step={10} value={inn || ""} onChange={e => { setIn(Number(e.target.value)); setError(null); }} /></label>
        </div>
        <p className={`small ${diffTone(diffPct)}-text`}>{API_MODE ? "Perkiraan selisih" : "Selisih"} {number(diff)} L ({pct(diffPct)}%). {diffTone(diffPct) === "ok" ? "Dalam toleransi." : "Di luar toleransi 0,5%, tulis penyebabnya di catatan."}</p>
        <div className="schedule-form-row">
          <label><span className="field-label">Mulai</span><TimeField label="Jam mulai transfer" value={start} onChange={setStart} minuteStep={5} /></label>
          <label><span className="field-label">Selesai</span><TimeField label="Jam selesai transfer" value={end} onChange={v => { setEnd(v); setMeasuredAt(v); setError(null); }} minuteStep={5} /></label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Waktu pengukuran</span><TimeField label="Waktu pengukuran" value={measuredAt} onChange={setMeasuredAt} minuteStep={5} /></label>
          <label><span className="field-label">{API_MODE ? "Batch" : "Batch (opsional)"}</span><input value={batch} onChange={e => setBatch(e.target.value)} maxLength={30} placeholder="Contoh: MXB-1014-02" /></label>
        </div>
        <label><span className="field-label">Catatan (opsional)</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={200} placeholder="Contoh: sisa 60 L tertahan di pipa, flush sebelum CIP" /></label>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Catat transfer"}</button>
        </div>
      </form>
    </Modal>
  );
}
