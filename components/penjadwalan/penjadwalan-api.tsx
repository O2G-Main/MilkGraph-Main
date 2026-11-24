"use client";

import { useState, type FormEvent } from "react";
import { CalendarPlus, Play, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { apiSend, type ApiError } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import {
  FULFILMENT_LABEL, FULFILMENT_TONE, PO_IMPORT_TEMPLATE, TRIGGER_REASONS, fmtWaktu, pctText, sourceText, toHHMM,
  type BeImportPoRow, type BePo, type BeSchedule, type BeScheduleNarrate,
} from "@/lib/api/contract";
import { ImportCsvCard } from "@/components/import-csv-card";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
const POS = "/pos";
const LATEST = "/schedules/latest";
/** Generate dan triggers digerbang permission plan.decide di server: planner dan superadmin. */
const canPlan = (role: string) => role === "planner" || role === "superadmin";
/** Import CSV PO digerbang plan.decide ATAU import.csv di server: planner, supervisor, manager, superadmin. Supervisor dan Manager lolos lewat import.csv saja, tanpa memegang plan.decide. */
const canImportPo = (role: string) => ["planner", "supervisor", "manager", "superadmin"].includes(role);
const statusOf = (e: Error | null) => (e as ApiError | null)?.status;

interface SkuRow { finished_sku_id: string; sku_name: string }

/**
 * Penjadwalan mode API: PO, jadwal, fulfilment, dan warnings semuanya dari Backend.
 * Modelnya PO dalam liter dengan due_datetime, bukan order per lini per shift dalam pak.
 */
export function PenjadwalanApi({ role }: { role: string }) {
  const posRes = useResource<BePo[]>(POS);
  const schRes = useResource<BeSchedule>(LATEST);
  const skuRes = useResource<SkuRow[]>("/master/finished-skus");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [narasi, setNarasi] = useState<BeScheduleNarrate | null>(null);
  const write = canPlan(role);

  const pos = posRes.data ?? [];
  const noSchedule = statusOf(schRes.error) === 404;
  const schedule = noSchedule ? null : schRes.data;
  const totalLiter = pos.reduce((s, p) => s + p.lines.reduce((x, l) => x + l.qty_liter, 0), 0);
  const risk = schedule?.fulfilment.filter(f => f.status === "AT_RISK" || f.status === "LATE").length ?? 0;
  const byFm = new Map<string, NonNullable<typeof schedule>["runs"]>();
  for (const r of schedule?.runs ?? []) byFm.set(r.fm_id, [...(byFm.get(r.fm_id) ?? []), r]);

  async function act(kind: string, run: () => Promise<string>) {
    setBusy(kind); setError(null); setNotice(null);
    try { setNotice(await run()); invalidateResources([POS, LATEST, "/schedules", "/dashboard/executive"]); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  const generate = () => act("generate", async () => {
    const res = await apiSend<{ result: BeSchedule }>("POST", "/schedules/generate", { triggered_by: "manual" }, role);
    return `Jadwal versi ${res.result.version} tergenerate (${res.result.schedule_id}).`;
  });
  const narrate = () => act("narrate", async () => {
    const res = await apiSend<BeScheduleNarrate>("POST", "/schedules/narrate", {}, role);
    setNarasi(res);
    return "Narasi jadwal diterima dari layanan AI.";
  });

  if (!posRes.data && !schedule && !noSchedule) {
    return <div className="page-enter">
      <PageHeading title="Penjadwalan" subtitle="Target produksi dari PO dan jadwal hasil generate Backend." />
      {posRes.error || (schRes.error && !noSchedule)
        ? <p className="crit-text" role="alert">Gagal memuat penjadwalan: {(posRes.error ?? schRes.error)?.message}</p>
        : <p className="muted" role="status">Memuat PO dan jadwal…</p>}
    </div>;
  }

  return (
    <div className="page-enter">
      <PageHeading title="Penjadwalan" subtitle="Target produksi berupa PO dalam liter. Jadwal, status pencapaian, dan peringatan dihitung Backend, bukan di halaman ini.">
        {write && <button className="button primary" onClick={() => setAdding(true)}><Icon icon={CalendarPlus} size={16} />Tambah PO</button>}
      </PageHeading>
      {error && <p className="crit-text" role="alert">{error}</p>}
      {notice && <p className="small muted" role="status">{notice}</p>}
      <div className="schedule-stats" data-tour="sched-kpis">
        <Card><span className="small muted">PO aktif</span><strong>{pos.length}</strong><span className="small muted">Total {number(totalLiter)} L</span></Card>
        <Card><span className="small muted">Jadwal aktif</span><strong>{schedule ? `Versi ${schedule.version}` : "Belum ada"}</strong><span className="small muted">{schedule ? `${schedule.schedule_id}, dipicu ${schedule.triggered_by}` : "Generate untuk membuat jadwal pertama"}</span></Card>
        <Card><span className="small muted">PO berisiko atau terlambat</span><strong className={risk ? "warn-text" : "ok-text"}>{schedule ? risk : "-"}</strong><span className="small muted">{schedule ? "Dari status fulfilment Backend" : "Belum ada jadwal"}</span></Card>
      </div>

      <Card>
        <SectionTitle title="Target produksi (PO)" subtitle="Daftar PO dari Backend. Label data tiap PO ditampilkan apa adanya dari server." />
        <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>PO</th><th>Isi PO</th><th className="numeric">Total</th><th>Batas waktu</th><th>Label data</th></tr></thead>
          <tbody>
            {pos.map(p => <tr key={p.po_id}>
              <td><strong className="mono">{p.po_id}</strong><span className="table-sub">Prioritas {p.priority}</span></td>
              <td>{p.lines.map(l => <span key={l.sku} className="table-sub">{l.sku}: {number(l.qty_liter)} L</span>)}</td>
              <td className="numeric">{number(p.lines.reduce((s, l) => s + l.qty_liter, 0))} L</td>
              <td>{fmtWaktu(p.due_datetime)}</td>
              <td>{p.label_data ? <Badge tone="warn">{p.label_data}</Badge> : <span className="small muted">-</span>}</td>
            </tr>)}
            {!pos.length && <tr><td colSpan={5} className="muted">Belum ada PO di server.</td></tr>}
          </tbody>
        </table></div>
      </Card>

      <ImportCsvCard<BeImportPoRow>
        title="Import CSV PO"
        subtitle="Satu baris CSV adalah satu baris SKU; baris dengan po_id sama digabung menjadi satu PO. Pratinjau dulu, baris yang gagal dilewati saat impor."
        templateCsv={PO_IMPORT_TEMPLATE}
        templateName="template-po.csv"
        importPath="/pos/import"
        role={role}
        canImport={canImportPo(role)}
        gateNote="Import PO untuk Planner, Manager, dan Supervisor lewat permission plan.decide atau import.csv di server, dengan Superadmin sebagai cadangan. Role lain cukup membaca daftar PO di atas."
        invalidate={[POS, LATEST, "/schedules", "/dashboard/executive"]}
        rowKey={r => r.po_id}
        columns={[
          { header: "PO", cell: r => <strong className="mono">{r.po_id}</strong> },
          { header: "Prioritas", numeric: true, cell: r => r.priority },
          { header: "Batas waktu", cell: r => fmtWaktu(r.due_datetime) },
          { header: "Baris SKU", numeric: true, cell: r => r.jumlah_baris },
          { header: "Total", numeric: true, cell: r => `${number(r.total_liter)} L` },
        ]}
      />

      <Card data-tour="sched-table">
        <SectionTitle title="Jadwal produksi" subtitle={schedule ? `Jendela ${fmtWaktu(schedule.window.start)} sampai ${fmtWaktu(schedule.window.end)}, digenerate ${fmtWaktu(schedule.generated_at)}.` : "Belum ada jadwal tergenerate."}
          action={write ? <button className="button primary" disabled={busy !== null} onClick={generate}><Icon icon={Play} size={15} />{busy === "generate" ? "Menggenerate…" : "Generate jadwal"}</button> : undefined} />
        {!schedule && <p className="muted">{noSchedule ? "Server belum punya jadwal. " : ""}{write ? "Pakai tombol Generate jadwal untuk membuat versi pertama dari daftar PO." : "Jadwal dibuat oleh Planner atau Superadmin."}</p>}
        {schedule && [...byFm.entries()].map(([fm, runs]) => (
          <div key={fm}>
            <h3 className="small"><strong>{fm}</strong></h3>
            <div className="table-wrap"><table className="schedule-table">
              <thead><tr><th>Run</th><th>PO / Produk</th><th>Tangki sumber</th><th>Jam</th><th className="numeric">Volume</th><th className="numeric">Changeover sesudahnya</th></tr></thead>
              <tbody>{runs.map(r => <tr key={r.run_id}>
                <td><strong className="mono">{r.run_id}</strong></td>
                <td>{r.sku}<span className="table-sub">{r.po_id}</span></td>
                <td>{r.tank_source}</td>
                <td className="schedule-time">{toHHMM(r.start)}-{toHHMM(r.end)}</td>
                <td className="numeric">{number(r.qty_liter)} L</td>
                <td className="numeric">{r.changeover_after_min ? `${r.changeover_after_min} mnt` : "-"}</td>
              </tr>)}</tbody>
            </table></div>
          </div>
        ))}
        {schedule && <div className="dialog-actions">
          <button className="button secondary" disabled={busy !== null} onClick={narrate}><Icon icon={Sparkles} size={15} />{busy === "narrate" ? "Meminta narasi…" : "Narasi jadwal dari AI"}</button>
        </div>}
        {narasi && <div>
          <p>{narasi.penjelasan}</p>
          <p className="small muted">{sourceText(narasi.sumber) ? `Sumber: ${sourceText(narasi.sumber)}. ` : ""}{narasi.label_data ? <>Label data: <Badge tone="warn">{narasi.label_data}</Badge></> : null}</p>
        </div>}
      </Card>

      {schedule && <Card>
        <SectionTitle title="Status pencapaian PO" subtitle="Status, persen terpenuhi, dan rencana selesai dari Backend." />
        <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>PO</th><th>Status</th><th className="numeric">Terpenuhi</th><th>Rencana selesai</th><th>Akar masalah</th></tr></thead>
          <tbody>{schedule.fulfilment.map(f => <tr key={f.po_id}>
            <td><strong className="mono">{f.po_id}</strong></td>
            <td><Badge tone={FULFILMENT_TONE[f.status] ?? "neutral"}>{FULFILMENT_LABEL[f.status] ?? f.status}</Badge></td>
            <td className="numeric">{pctText(f.fulfilled_pct)}</td>
            <td>{fmtWaktu(f.planned_completion)}</td>
            <td>{f.root_causes?.length ? f.root_causes.join(", ") : <span className="small muted">Tidak ada</span>}</td>
          </tr>)}
          {!schedule.fulfilment.length && <tr><td colSpan={5} className="muted">Tidak ada data fulfilment pada jadwal ini.</td></tr>}
          </tbody>
        </table></div>
      </Card>}

      {!!schedule?.warnings.length && <Card>
        <SectionTitle title="Peringatan jadwal" subtitle="Dihitung Backend dari batas holding time dan stok tangki." />
        <ul className="attention-list">{schedule.warnings.map((w, i) => <li key={i} className="attention-item warn">
          <span className="attention-icon"><Icon icon={TriangleAlert} size={18} /></span>
          <span className="attention-copy"><strong>{w.type === "HOLDING_TIME" ? "Holding time" : w.type === "TANK_STOCK_SHORT" ? "Stok tangki kurang" : w.type}: {w.resource_id}</strong>
          <span>{w.type === "HOLDING_TIME"
            ? `Proyeksi ${w.projected_h ?? "-"} jam, batas ${w.limit_h ?? "-"} jam.`
            : `Butuh ${w.needed_l !== undefined ? `${number(w.needed_l)} L` : "-"}, tersedia ${w.available_l !== undefined ? `${number(w.available_l)} L` : "-"}.`}</span></span>
        </li>)}</ul>
      </Card>}

      {write && <TriggerCard role={role} busy={busy} onAct={act} />}
      {!write && <p className="small muted">Generate jadwal dan pencatatan pemicu hanya untuk Planner dan Superadmin, sesuai permission plan.decide di server. Role lain membaca hasilnya di halaman ini.</p>}
      {adding && <PoForm skus={skuRes.data ?? []} role={role} onClose={() => setAdding(false)} />}
    </div>
  );
}

function TriggerCard({ role, busy, onAct }: { role: string; busy: string | null; onAct: (kind: string, run: () => Promise<string>) => Promise<void> }) {
  const [reason, setReason] = useState(TRIGGER_REASONS[0].code);
  const [refId, setRefId] = useState("");
  const [detail, setDetail] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!refId.trim()) return setLocalError("Isi referensi pemicu, misalnya RT-26 atau F10.");
    void onAct("trigger", async () => {
      const res = await apiSend<{ result: BeSchedule }>("POST", "/schedules/triggers", { reason_code: reason, ref_id: refId.trim(), detail: detail.trim() }, role);
      return `Pemicu tercatat, jadwal versi ${res.result.version} tergenerate.`;
    });
  }

  return (
    <Card>
      <SectionTitle title="Catat pemicu, generate ulang" subtitle="Pemicu tersimpan di server dan jadwal versi baru langsung digenerate dari sana." />
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Jenis pemicu</span><Select label="Jenis pemicu" value={reason} onChange={setReason} options={TRIGGER_REASONS.map(r => ({ value: r.code, label: r.label }))} /></label>
          <label><span className="field-label">Referensi</span><input value={refId} onChange={e => { setRefId(e.target.value); setLocalError(null); }} placeholder="Contoh: RT-26" maxLength={40} /></label>
        </div>
        <label><span className="field-label">Keterangan</span><input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Contoh: RT tiba 35 menit dari target" maxLength={200} /></label>
        {localError && <p className="small crit-text" role="alert">{localError}</p>}
        <div className="dialog-actions">
          <button type="submit" className="button primary" disabled={busy !== null}><Icon icon={RefreshCw} size={15} />{busy === "trigger" ? "Memproses…" : "Catat dan generate ulang"}</button>
        </div>
      </form>
    </Card>
  );
}

function PoForm({ skus, role, onClose }: { skus: SkuRow[]; role: string; onClose: () => void }) {
  const [priority, setPriority] = useState(1);
  const [due, setDue] = useState("");
  const [lines, setLines] = useState<{ sku: string; qty: string }[]>([{ sku: skus[0]?.finished_sku_id ?? "", qty: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const options = skus.map(s => ({ value: s.finished_sku_id, label: s.sku_name ? `${s.finished_sku_id} (${s.sku_name})` : s.finished_sku_id }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = lines.map(l => ({ sku: l.sku, qty_liter: Number(l.qty) })).filter(l => l.sku && l.qty_liter > 0);
    if (!parsed.length) return setError("Isi minimal satu baris SKU dengan volume lebih dari 0 L.");
    if (!due) return setError("Isi batas waktu PO.");
    setSaving(true); setError(null);
    try {
      await apiSend("POST", POS, { priority, lines: parsed, due_datetime: `${due}:00+07:00` }, role);
      invalidateResources([POS, LATEST, "/dashboard/executive"]);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setSaving(false); }
  }

  return (
    <Modal title="Tambah PO" onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Prioritas</span><input type="number" min={1} step={1} value={priority} onChange={e => setPriority(Number(e.target.value))} /></label>
        </div>
        <label><span className="field-label">Batas waktu (WIB)</span><input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label>
        {lines.map((l, i) => (
          <div className="schedule-form-row" key={i}>
            <label><span className="field-label">SKU</span><Select label={`SKU baris ${i + 1}`} value={l.sku} onChange={v => setLines(ls => ls.map((x, j) => j === i ? { ...x, sku: v } : x))} options={options} placeholder="Pilih SKU" /></label>
            <label><span className="field-label">Volume (L)</span><input type="number" min={1} step={100} value={l.qty} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} placeholder="Contoh: 12000" /></label>
          </div>
        ))}
        <button type="button" className="button secondary" onClick={() => setLines(ls => [...ls, { sku: skus[0]?.finished_sku_id ?? "", qty: "" }])}>Tambah baris SKU</button>
        <p className="small muted">SKU harus ada di master finished SKU server, kalau tidak PO ditolak 422. PO dari form ini tersimpan dengan label data simulasi (bawaan server); PO hasil impor CSV mengikuti label data yang dipilih pada kartu impor.</p>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan PO"}</button>
        </div>
      </form>
    </Modal>
  );
}
