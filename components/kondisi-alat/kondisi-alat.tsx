"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, CircleCheck, Pencil, Search, TimerOff } from "lucide-react";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle, Toggle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";
import { ASSETS as ALL, type Asset } from "@/lib/assets";
import { assignedAssets, saveDowntime, updateMachine, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { DOWNTIME_CAUSE, MACHINE_STATE, NOW, downtimeMinutes, mayHandle, type Downtime, type MachineState, type OperationState } from "@/lib/operation";
import { groupAttention } from "./groups";

/** Mesin yang kondisinya bisa diperbarui operator: sterilizer UHT dan mesin filling. */
const isMachine = (a: Asset) => a.kind === "Sterilisasi" || a.kind === "Filling";
const clock = (t: string) => t.replace(":", ".");
const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`);

/** Kondisi terbaru dari operator menimpa kondisi snapshot. */
const withUpdates = (assets: Asset[], machines: OperationState["machines"]) => assets.map(a => {
  const u = machines[a.id];
  return u ? { ...a, status: MACHINE_STATE[u.state].label, tone: MACHINE_STATE[u.state].tone, note: `${u.note || a.note} · diperbarui ${u.by}, ${u.at}`, active: u.state === "jalan" } : a;
});

function AssetTable({ rows, onEdit }: { rows: Asset[]; onEdit?: (a: Asset) => (() => void) | undefined }) {
  return <div className="table-wrap"><table className="asset-table">
    <thead><tr><th>Alat</th><th>Tahap</th><th>Kondisi</th><th>Keterangan</th><th><span className="sr-only">Detail</span></th></tr></thead>
    <tbody>{rows.map(a => <tr key={a.id}>
      <td><strong className="mono">{a.id}</strong></td>
      <td data-label="Tahap">{a.group}</td>
      <td data-label="Kondisi"><Badge tone={a.tone}>{a.status}</Badge></td>
      <td data-label="Keterangan" className="asset-note">{a.note}</td>
      <td className="table-action queue-actions">
        {onEdit?.(a) && <button className="icon-button" aria-label={`Perbarui kondisi ${a.id}`} onClick={onEdit(a)}><Icon icon={Pencil} size={15} /></button>}
        <Link className="text-link" href={a.href} aria-label={`Detail ${a.id}`}>Detail<Icon icon={ArrowRight} size={14} /></Link>
      </td>
    </tr>)}</tbody>
  </table></div>;
}

export function KondisiAlat() {
  const demo = useDemo();
  const mayUpdate = can(demo.role, "equipment.update");
  const assigned = assignedAssets(demo);
  const handles = (a: Asset) => mayUpdate && isMachine(a) && mayHandle(assigned, a.id);
  const [view, setView] = useState<"semua" | "perhatian" | "tugas">(demo.role === "operator" ? "tugas" : "semua");
  const [query, setQuery] = useState("");
  const [machine, setMachine] = useState<Asset | null>(null);
  const [downtime, setDowntime] = useState<Partial<Downtime> | null>(null);
  const assets = withUpdates(ALL, demo.operation.machines);
  const grouped = groupAttention(assets);
  const attentionCount = grouped.reduce((n, g) => n + g.items.length, 0);
  const q = query.trim().toLowerCase();
  const hit = (a: Asset) => !q || `${a.id} ${a.group} ${a.status} ${a.note}`.toLowerCase().includes(q);
  const mine = assigned ? assets.filter(a => assigned.includes(a.id)) : assets;
  const rows = (view === "tugas" ? mine : assets).filter(hit);
  const groups = grouped.map(g => ({ ...g, items: g.items.filter(hit) })).filter(g => g.items.length);
  const empty = view === "perhatian" ? !groups.length : !rows.length;
  // Tombol ubah hanya di mesin yang boleh ditangani peran ini.
  const edit = (a: Asset) => (handles(a) ? () => setMachine(a) : undefined);
  const downtimes = [...demo.operation.downtime].sort((a, b) => Number(!!a.end) - Number(!!b.end) || b.start.localeCompare(a.start));
  const machines = assets.filter(a => isMachine(a) && mayHandle(assigned, a.id));

  return <div className="page-enter">
    <PageHeading title="Kondisi Alat" subtitle={assigned ? `Kondisi alat yang ditugaskan (${assigned.join(", ")}) dan semua alat lain, snapshot pukul 14.42. Perbarui kondisi mesin dan catat downtime.` : "Kondisi setiap alat pada snapshot pukul 14.42, diurutkan sesuai alur produksi."}>
      {mayUpdate && <button className="button primary" onClick={() => setDowntime({ asset: machines[0]?.id, cause: "Breakdown", start: NOW, note: "" })}><Icon icon={TimerOff} size={16} />Catat downtime</button>}
    </PageHeading>
    <div className="page-tabs"><Toggle label="Tampilan alat" value={view} onChange={setView} options={[...(assigned ? [{ value: "tugas" as const, label: `Ditugaskan (${mine.length})` }] : []), { value: "semua", label: `Semua (${assets.length})` }, { value: "perhatian", label: `Perlu diperhatikan (${attentionCount})` }]} /></div>
    <Card>
      <div className="asset-toolbar">
        <label className="asset-search"><Icon icon={Search} size={16} /><span className="sr-only">Cari alat</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama, kode, atau kondisi..." autoComplete="off" /></label>
      </div>
      {empty ? <p className="muted asset-empty">{q ? <>Tidak ada alat yang cocok dengan &quot;{query}&quot;.</> : "Semua alat dalam kondisi normal."}</p>
        : view !== "perhatian" ? <AssetTable rows={rows} onEdit={edit} />
        : groups.map(g => <section key={g.id} className={`asset-group ${g.id}`} aria-labelledby={`grp-${g.id}`}>
          <header><h2 id={`grp-${g.id}`}>{g.title} <span className="asset-group-count">{g.items.length}</span></h2><p>{g.hint}</p></header>
          <AssetTable rows={g.items} onEdit={edit} />
        </section>)}
    </Card>
    <Card className="downtime-card">
      <SectionTitle title="Downtime" subtitle={`${downtimes.filter(d => !d.end).length} masih berlangsung, total ${duration(downtimes.reduce((s, d) => s + downtimeMinutes(d), 0))} di shift ini.`} />
      <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Alat</th><th>Penyebab</th><th>Jam</th><th className="numeric">Lama</th><th>Catatan</th>{mayUpdate && <th><span className="sr-only">Aksi</span></th>}</tr></thead>
        <tbody>{downtimes.map(d => <tr key={d.id}>
          <td><strong className="mono">{d.asset}</strong></td>
          <td data-label="Penyebab"><Badge tone={d.end ? "neutral" : d.cause === "Breakdown" ? "crit" : "warn"}>{d.cause}</Badge></td>
          <td data-label="Jam" className="schedule-time">{clock(d.start)}-{d.end ? clock(d.end) : "sekarang"}</td>
          <td data-label="Lama" className="numeric">{duration(downtimeMinutes(d))}</td>
          <td data-label="Catatan" className="asset-note">{d.note || "-"}</td>
          {mayUpdate && <td className="table-action queue-actions">{mayHandle(assigned, d.asset) && <>
            {!d.end && <button className="button primary" onClick={() => setDowntime({ ...d, end: NOW })}><Icon icon={CircleCheck} size={14} />Selesai</button>}
            <button className="icon-button" aria-label={`Ubah downtime ${d.asset}`} onClick={() => setDowntime({ ...d })}><Icon icon={Pencil} size={15} /></button>
          </>}</td>}
        </tr>)}</tbody>
      </table></div>
    </Card>
    {machine && <MachineDialog asset={machine} onClose={() => setMachine(null)} />}
    {downtime && <DowntimeDialog value={downtime} machines={machines} onClose={() => setDowntime(null)} />}
  </div>;
}

function MachineDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const current = (Object.keys(MACHINE_STATE) as MachineState[]).find(k => MACHINE_STATE[k].label === asset.status) ?? "jalan";
  const [state, setState] = useState<MachineState>(current);
  const [note, setNote] = useState("");
  return (
    <Modal title={`Kondisi ${asset.id}`} onClose={onClose}>
      <form className="schedule-form" onSubmit={e => { e.preventDefault(); updateMachine(asset.id, state, note.trim()); onClose(); }}>
        <p className="muted">{asset.group}, sekarang {asset.status.toLowerCase()}.</p>
        <label><span className="field-label">Kondisi mesin</span><Select label="Kondisi mesin" value={state} onChange={setState} options={(Object.keys(MACHINE_STATE) as MachineState[]).map(k => ({ value: k, label: MACHINE_STATE[k].label }))} /></label>
        <label><span className="field-label">Keterangan (opsional)</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={200} placeholder="Contoh: sensor level AT-2 dikalibrasi ulang, jalan normal" /></label>
        <p className="small muted">Kalau mesin berhenti, catat juga downtime-nya supaya lama berhentinya terhitung.</p>
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button type="submit" className="button primary">Simpan kondisi</button></div>
      </form>
    </Modal>
  );
}

function DowntimeDialog({ value, machines, onClose }: { value: Partial<Downtime>; machines: Asset[]; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Downtime>>(value);
  const [ongoing, setOngoing] = useState(!value.end);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Downtime>(k: K, v: Downtime[K]) => { setForm(f => ({ ...f, [k]: v })); setError(null); };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.asset) return setError("Pilih alat yang berhenti.");
    const end = ongoing ? undefined : form.end ?? NOW;
    if (end && end <= (form.start ?? NOW)) return setError("Jam selesai harus setelah jam mulai.");
    saveDowntime({ id: form.id, asset: form.asset, cause: form.cause ?? "Lainnya", start: form.start ?? NOW, end, note: (form.note ?? "").trim() });
    onClose();
  }

  return (
    <Modal title={form.id ? `Downtime ${form.asset}` : "Catat downtime"} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Alat</span><Select label="Alat yang berhenti" value={form.asset ?? ""} onChange={v => set("asset", v)} options={machines.map(a => ({ value: a.id, label: a.id, hint: a.status }))} /></label>
          <label><span className="field-label">Penyebab</span><Select label="Penyebab downtime" value={form.cause ?? "Lainnya"} onChange={v => set("cause", v)} options={DOWNTIME_CAUSE.map(c => ({ value: c, label: c }))} /></label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Mulai</span><TimeField label="Jam mulai downtime" value={form.start ?? NOW} onChange={v => set("start", v)} minuteStep={5} /></label>
          {!ongoing && <label><span className="field-label">Selesai</span><TimeField label="Jam selesai downtime" value={form.end ?? NOW} onChange={v => set("end", v)} minuteStep={5} /></label>}
        </div>
        <label className="check-row"><input type="checkbox" checked={ongoing} onChange={e => setOngoing(e.target.checked)} />Masih berlangsung</label>
        <label><span className="field-label">Catatan (opsional)</span><textarea value={form.note ?? ""} onChange={e => set("note", e.target.value)} rows={2} maxLength={200} placeholder="Contoh: seal jaw aus, tiket MT-2240" /></label>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button type="submit" className="button primary">Simpan downtime</button></div>
      </form>
    </Modal>
  );
}
