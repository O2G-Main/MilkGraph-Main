"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarPlus, CircleCheck, Pencil, Play, Trash2 } from "lucide-react";
import { assignedAssets, recordRun, removeScheduleItem, saveScheduleItem, useDemo } from "@/lib/demo";
import { attainment, isLate, mayHandle, runState, type Run } from "@/lib/operation";
import { can } from "@/lib/roles";
import { SHIFT, checkSchedule, clockOf, toMinutes, type ScheduleItem } from "@/lib/production";
import { demandPlan, fillers } from "@/mock/ops";
import { Badge, Card, Icon, Modal, PageHeading, PageLink, SectionTitle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";
import { API_MODE } from "@/lib/api/client";
import { PenjadwalanApi } from "./penjadwalan-api";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
/** Laju lini dalam pak per menit, dari target kecepatan mesin filling [simulasi]. */
const RATES = Object.fromEntries(fillers.map(f => [f.id, f.target]));
const SKUS = demandPlan.map(d => d.sku);
const EMPTY: Omit<ScheduleItem, "id"> = { line: "F1", sku: SKUS[0], packs: 0, start: SHIFT.start, end: SHIFT.end };

export function Penjadwalan() {
  const demo = useDemo();
  const allowed = can(demo.role, "schedule.edit");
  const [editing, setEditing] = useState<(Omit<ScheduleItem, "id"> & { id?: string }) | null>(null);
  const [removing, setRemoving] = useState<ScheduleItem | null>(null);
  const mayRun = can(demo.role, "production.record");
  const assigned = assignedAssets(demo);
  // Pengguna dengan penugasan alat/lini hanya melihat order di lini itu.
  const mine = assigned;
  const [running, setRunning] = useState<{ item: ScheduleItem; action: "mulai" | "selesai" } | null>(null);
  // Mode API: PO dan jadwal dari Backend (model liter), bukan order lokal per lini per shift.
  if (API_MODE) return <PenjadwalanApi role={demo.role} />;
  const items = [...demo.schedule].filter(i => !mine || assigned.includes(i.line)).sort((a, b) => a.line.localeCompare(b.line, "id", { numeric: true }) || toMinutes(a.start) - toMinutes(b.start));
  const runs = demo.operation.runs;
  const done = items.filter(i => runState(runs[i.id]) === "selesai");
  const goodOut = done.reduce((s, i) => s + (runs[i.id]?.output ?? 0), 0);
  const doneTarget = done.reduce((s, i) => s + i.packs, 0);
  const checks = checkSchedule(items, RATES, demo.rules);
  const problems = items.filter(i => checks[i.id].issues.some(x => x.tone !== "neutral"));
  const total = items.reduce((s, i) => s + i.packs, 0);
  const capacity = items.reduce((s, i) => s + checks[i.id].capacity, 0);

  return (
    <div className="page-enter">
      <PageHeading title="Penjadwalan" subtitle={mine
        ? `Target dan realisasi produksi di lini yang ditugaskan (${assigned.filter(a => a.startsWith("F")).join(", ")}), Shift Siang ${clockOf(SHIFT.start)} - ${clockOf(SHIFT.end)}. Catat mulai, selesai, dan hasil tiap order.`
        : `Target dan jadwal produksi per lini filling untuk Shift Siang, ${clockOf(SHIFT.start)} - ${clockOf(SHIFT.end)}. Jeda antar-order dicek dengan standar di Aturan Produksi.`}>
        {allowed && <button className="button primary" onClick={() => setEditing({ ...EMPTY })}><Icon icon={CalendarPlus} size={16} />Tambah jadwal</button>}
      </PageHeading>
      <div className="schedule-stats" data-tour="sched-kpis">
        <Card><span className="small muted">Order di shift ini</span><strong>{items.length}</strong><span className="small muted">{new Set(items.map(i => i.line)).size} lini filling</span></Card>
        <Card><span className="small muted">Total target</span><strong>{number(total)} <small>pak</small></strong><span className="small muted">Kapasitas jam terjadwal {number(capacity)} pak</span></Card>
        {mine ? <Card><span className="small muted">Hasil baik order selesai</span><strong>{done.length ? `${attainment(goodOut, doneTarget)}%` : "-"}</strong><span className="small muted">{done.length} selesai, {items.filter(i => runState(runs[i.id]) === "jalan").length} jalan, {items.filter(i => runState(runs[i.id]) === "belum").length} belum mulai</span></Card> : <Card><span className="small muted">Perlu dicek</span><strong className={problems.some(i => checks[i.id].issues.some(x => x.tone === "crit")) ? "crit-text" : problems.length ? "warn-text" : "ok-text"}>{problems.length}</strong><span className="small muted">{problems.length ? "Order bentrok, kurang jeda, atau melebihi kapasitas" : "Semua order masuk akal"}</span></Card>}
      </div>
      <Card data-tour="sched-table">
        <SectionTitle title="Jadwal produksi" subtitle="Urut per lini dan jam mulai. Kapasitas dihitung dari laju target mesin dikali durasi [simulasi]." action={<PageLink className="text-link" data-tour="sched-feasibility" href="/rencana">Cek kelayakan rencana<Icon icon={ArrowRight} size={14} /></PageLink>} />
        <div className="table-wrap">
          <table className="schedule-table">
            <thead><tr><th>Lini</th><th>Produk</th><th>Jam</th><th className="numeric">Target</th><th className="numeric">Kapasitas</th><th>Status</th><th>Realisasi</th>{(allowed || mayRun) && <th><span className="sr-only">Aksi</span></th>}</tr></thead>
            <tbody>
              {items.map(i => {
                const c = checks[i.id];
                const worst = c.issues.find(x => x.tone === "crit") ?? c.issues.find(x => x.tone === "warn") ?? c.issues[0];
                return (
                  <tr key={i.id}>
                    <td data-label="Lini"><strong>{i.line}</strong></td>
                    <td data-label="Produk">{i.sku}</td>
                    <td data-label="Jam" className="schedule-time">{clockOf(i.start)}-{clockOf(i.end)}</td>
                    <td data-label="Target" className="numeric">{number(i.packs)} pak</td>
                    <td data-label="Kapasitas" className="numeric">{number(c.capacity)} pak</td>
                    <td data-label="Status">
                      {worst ? <><Badge tone={worst.tone}>{worst.tone === "crit" ? "Bermasalah" : worst.tone === "warn" ? "Melebihi kapasitas" : "Catatan"}</Badge><span className="table-sub">{c.issues.map(x => x.text).join(" ")}</span></> : <Badge tone="ok">Layak</Badge>}
                    </td>
                    <td data-label="Realisasi"><RunCell item={i} run={runs[i.id]} /></td>
                    {(allowed || mayRun) && (
                      <td className="table-action queue-actions">
                        {mayRun && mayHandle(assigned, i.line) && runState(runs[i.id]) === "belum" && <button className="button primary" onClick={() => setRunning({ item: i, action: "mulai" })}><Icon icon={Play} size={14} />Mulai</button>}
                        {mayRun && mayHandle(assigned, i.line) && runState(runs[i.id]) === "jalan" && <button className="button primary" onClick={() => setRunning({ item: i, action: "selesai" })}><Icon icon={CircleCheck} size={14} />Selesai</button>}
                        {allowed && <button className="icon-button" aria-label={`Ubah jadwal ${i.line} ${i.sku}`} onClick={() => setEditing({ ...i })}><Icon icon={Pencil} size={16} /></button>}
                        {allowed && <button className="icon-button" aria-label={`Hapus jadwal ${i.line} ${i.sku}`} onClick={() => setRemoving(i)}><Icon icon={Trash2} size={16} /></button>}
                      </td>
                    )}
                  </tr>
                );
              })}
              {!items.length && <tr><td colSpan={8} className="muted">Belum ada jadwal di shift ini.{allowed ? " Tambah jadwal untuk mulai." : ""}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <ScheduleForm value={editing} onClose={() => setEditing(null)} />}
      {running && <RunDialog item={running.item} action={running.action} run={runs[running.item.id]} onClose={() => setRunning(null)} />}
      {removing && (
        <Modal title="Hapus jadwal ini?" onClose={() => setRemoving(null)}>
          <p className="muted">{removing.line}, {removing.sku}, {number(removing.packs)} pak pukul {clockOf(removing.start)}-{clockOf(removing.end)}. Perubahan tercatat di Riwayat Persetujuan.</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setRemoving(null)}>Batal</button>
            <button className="button primary" onClick={() => { removeScheduleItem(removing.id); setRemoving(null); }}><Icon icon={Trash2} size={16} />Hapus</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ScheduleForm({ value, onClose }: { value: Omit<ScheduleItem, "id"> & { id?: string }; onClose: () => void }) {
  const [form, setForm] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, v: (typeof form)[K]) => { setForm(f => ({ ...f, [key]: v })); setError(null); };
  const start = form.start.replace(".", ":"), end = form.end.replace(".", ":");
  const capacity = Math.max(0, Math.round((RATES[form.line] ?? 0) * (toMinutes(end) - toMinutes(start))));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!(form.packs > 0)) return setError("Isi target produksi lebih dari 0 pak.");
    if (toMinutes(end) <= toMinutes(start)) return setError("Jam selesai harus setelah jam mulai.");
    saveScheduleItem({ ...form, start, end });
    onClose();
  }

  return (
    <Modal title={value.id ? "Ubah jadwal produksi" : "Tambah jadwal produksi"} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <label><span className="field-label">Lini filling</span><Select label="Lini filling" value={form.line} onChange={v => set("line", v)} options={fillers.map(f => ({ value: f.id, label: f.id, hint: `${f.product}, ${f.target} pak/menit` }))} /></label>
        <label><span className="field-label">Produk</span><Select label="Produk" value={form.sku} onChange={v => set("sku", v)} options={SKUS.map(s => ({ value: s, label: s }))} /></label>
        <label><span className="field-label">Target (pak)</span><input type="number" inputMode="numeric" min={1} step={100} value={form.packs || ""} onChange={e => set("packs", Number(e.target.value))} placeholder="Contoh: 24000" /></label>
        <div className="schedule-form-row">
          <label><span className="field-label">Mulai</span><TimeField label="Jam mulai" value={start} onChange={v => set("start", v)} minuteStep={5} /></label>
          <label><span className="field-label">Selesai</span><TimeField label="Jam selesai" value={end} onChange={v => set("end", v)} minuteStep={5} /></label>
        </div>
        <p className="small muted">Kapasitas {form.line} di jam ini sekitar {number(capacity)} pak [simulasi].</p>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">{value.id ? "Simpan perubahan" : "Tambah jadwal"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Realisasi satu order: belum mulai (terlambat bila jam mulai lewat), jalan sejak, atau hasil baik terhadap target. */
function RunCell({ item, run }: { item: ScheduleItem; run?: Run }) {
  const state = runState(run);
  if (state === "selesai") {
    const pct = attainment(run!.output ?? 0, item.packs);
    return <><Badge tone={pct >= 95 ? "ok" : pct >= 85 ? "warn" : "crit"}>{pct}% target</Badge><span className="table-sub">{clockOf(run!.start!)}-{clockOf(run!.end!)}, {number(run!.output ?? 0)} pak baik{run!.reject ? `, ${number(run!.reject)} reject` : ""}</span></>;
  }
  if (state === "jalan") return <><Badge tone="ok">Jalan</Badge><span className="table-sub">Sejak {clockOf(run!.start!)}</span></>;
  return isLate(item.start, run) ? <><Badge tone="warn">Belum mulai</Badge><span className="table-sub">Jadwal mulai {clockOf(item.start)} sudah lewat</span></> : <span className="small muted">Belum mulai</span>;
}

/** Catat mulai atau selesai satu order beserta hasil baik dan reject. */
function RunDialog({ item, action, run, onClose }: { item: ScheduleItem; action: "mulai" | "selesai"; run?: Run; onClose: () => void }) {
  const [start, setStart] = useState(run?.start ?? item.start);
  const [end, setEnd] = useState(item.end);
  const [output, setOutput] = useState(item.packs);
  const [reject, setReject] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (action === "mulai") {
      recordRun(item, { start }, "Produksi dimulai", `mulai ${clockOf(start)}`);
    } else {
      if (toMinutes(end) <= toMinutes(start)) return setError("Jam selesai harus setelah jam mulai.");
      if (!(output >= 0) || !(reject >= 0)) return setError("Hasil baik dan reject tidak boleh negatif.");
      recordRun(item, { end, output, reject }, "Produksi selesai", `${clockOf(start)}-${clockOf(end)}, ${number(output)} pak baik dari target ${number(item.packs)}${reject ? `, ${number(reject)} reject` : ""}`);
    }
    onClose();
  }

  return (
    <Modal title={action === "mulai" ? `Mulai produksi ${item.line}` : `Selesai produksi ${item.line}`} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <p className="muted">{item.sku}, target {number(item.packs)} pak, jadwal {clockOf(item.start)}-{clockOf(item.end)}.</p>
        {action === "mulai"
          ? <label><span className="field-label">Mulai pukul</span><TimeField label="Jam mulai produksi" value={start} onChange={setStart} minuteStep={5} /></label>
          : <>
            <label><span className="field-label">Selesai pukul</span><TimeField label="Jam selesai produksi" value={end} onChange={v => { setEnd(v); setError(null); }} minuteStep={5} /></label>
            <div className="schedule-form-row">
              <label><span className="field-label">Hasil baik (pak)</span><input type="number" inputMode="numeric" min={0} step={100} value={output} onChange={e => { setOutput(Number(e.target.value)); setError(null); }} /></label>
              <label><span className="field-label">Reject (pak)</span><input type="number" inputMode="numeric" min={0} step={10} value={reject} onChange={e => { setReject(Number(e.target.value)); setError(null); }} /></label>
            </div>
            <p className="small muted">Pencapaian {attainment(output, item.packs)}% dari target. Mulai pukul {clockOf(start)}.</p>
          </>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">{action === "mulai" ? "Catat mulai" : "Catat selesai"}</button>
        </div>
      </form>
    </Modal>
  );
}
