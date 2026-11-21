"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { saveArrival, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { ARRIVAL_STATUS, ageText, ageTone, arrivalAge, clock, toMin, type Arrival, type ArrivalStatus } from "@/lib/receiving";
import { duration } from "@/lib/format";
import { farms } from "@/mock/ops";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const EDITABLE: ArrivalStatus[] = ["loading", "perjalanan", "batal"];

export function Kedatangan() {
  const demo = useDemo();
  const allowed = can(demo.role, "arrival.edit");
  const holding = demo.limits.holdingMin;
  const [editing, setEditing] = useState<{ item: Arrival; isNew: boolean } | null>(null);
  const list = [...demo.receiving.arrivals].sort((a, b) => toMin(a.eta) - toMin(b.eta));
  const active = list.filter(a => a.status === "perjalanan" || a.status === "loading");
  const onRoad = list.filter(a => a.status === "perjalanan");
  const risky = active.filter(a => ageTone(arrivalAge(a), holding) !== "ok");
  const nextId = `RT-${Math.max(37, ...list.map(a => Number(a.id.replace(/\D/g, "")) || 0)) + 1}`;

  return (
    <div className="page-enter">
      <PageHeading title="Jadwal Kedatangan RT" subtitle="Road tanker yang masih loading di farm atau dalam perjalanan. Perkiraan umur susu saat tiba dihitung dari awal umur susu sampai estimasi tiba.">
        {allowed && <button className="button primary" onClick={() => setEditing({ isNew: true, item: { id: nextId, farm: farms[0].name, volume: 0, depart: "15:00", eta: "16:30", milkStart: "09:00", status: "loading", note: "" } })}><Icon icon={Plus} size={16} />Tambah jadwal RT</button>}
      </PageHeading>
      <div className="schedule-stats">
        <Card><span className="small muted">Dalam perjalanan</span><strong>{onRoad.length} <small>RT</small></strong><span className="small muted">{onRoad[0] ? `Berikutnya ${onRoad[0].id} pukul ${clock(onRoad[0].eta)}` : "Tidak ada RT di jalan"}</span></Card>
        <Card><span className="small muted">Akan masuk shift ini</span><strong>{number(active.reduce((s, a) => s + a.volume, 0))} <small>L</small></strong><span className="small muted">{active.length} RT, termasuk yang masih loading</span></Card>
        <Card><span className="small muted">Berisiko holding time</span><strong className={risky.length ? "warn-text" : "ok-text"}>{risky.length}</strong><span className="small muted">Sisa kurang dari 3 jam saat tiba, batas {duration(holding)}</span></Card>
      </div>
      <Card>
        <SectionTitle title="Jadwal kedatangan" subtitle="Urut menurut estimasi tiba. RT yang sudah tiba dicatat di Antrean Truk." action={<Link className="text-link" href="/receiving">Buka antrean truk<Icon icon={ArrowRight} size={14} /></Link>} />
        <div className="table-wrap">
          <table className="schedule-table">
            <thead><tr><th>RT / Farm</th><th className="numeric">Volume</th><th>Berangkat</th><th>Estimasi tiba</th><th>Umur saat tiba</th><th>Status</th>{allowed && <th><span className="sr-only">Aksi</span></th>}</tr></thead>
            <tbody>
              {list.map(a => {
                const age = arrivalAge(a), tone = a.status === "batal" ? "neutral" : ageTone(age, holding);
                return (
                  <tr key={a.id}>
                    <td><strong className="mono">{a.id}</strong><span className="table-sub">{a.farm}{a.note ? `. ${a.note}` : ""}</span></td>
                    <td data-label="Volume" className="numeric">{number(a.volume)} L</td>
                    <td data-label="Berangkat" className="schedule-time">{clock(a.depart)}</td>
                    <td data-label="Estimasi tiba" className="schedule-time">{clock(a.eta)}</td>
                    <td data-label="Umur saat tiba" className={`schedule-time ${tone === "crit" ? "crit-text" : tone === "warn" ? "warn-text" : ""}`}>{ageText(age)}<span className="table-sub">awal {clock(a.milkStart)}</span></td>
                    <td data-label="Status"><Badge tone={ARRIVAL_STATUS[a.status].tone}>{ARRIVAL_STATUS[a.status].label}</Badge></td>
                    {allowed && (
                      <td className="table-action">
                        {a.status === "tiba"
                          ? <Link className="text-link" href="/receiving">Di antrean</Link>
                          : <button className="icon-button" aria-label={`Ubah jadwal ${a.id}`} onClick={() => setEditing({ isNew: false, item: { ...a } })}><Icon icon={Pencil} size={16} /></button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <ArrivalForm value={editing.item} isNew={editing.isNew} taken={list.map(a => a.id)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ArrivalForm({ value, isNew, taken, onClose }: { value: Arrival; isNew: boolean; taken: string[]; onClose: () => void }) {
  const [form, setForm] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Arrival>(key: K, v: Arrival[K]) => { setForm(f => ({ ...f, [key]: v })); setError(null); };

  function submit(e: FormEvent) {
    e.preventDefault();
    const id = form.id.trim().toUpperCase();
    if (!/^RT-\d+$/.test(id)) return setError("Nomor RT ditulis seperti RT-38.");
    if (isNew && taken.includes(id)) return setError(`${id} sudah ada di jadwal.`);
    if (!(form.volume > 0)) return setError("Isi volume rencana lebih dari 0 L.");
    if (toMin(form.eta) <= toMin(form.depart)) return setError("Estimasi tiba harus setelah jam berangkat.");
    saveArrival({ ...form, id, note: form.note.trim() }, isNew);
    onClose();
  }

  return (
    <Modal title={isNew ? "Tambah jadwal kedatangan RT" : `Ubah jadwal ${value.id}`} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Nomor RT</span><input value={form.id} onChange={e => set("id", e.target.value)} readOnly={!isNew} placeholder="RT-38" /></label>
          <label><span className="field-label">Volume rencana (L)</span><input type="number" inputMode="numeric" min={1} step={100} value={form.volume || ""} onChange={e => set("volume", Number(e.target.value))} placeholder="Contoh: 9800" /></label>
        </div>
        <label><span className="field-label">Farm asal</span><Select label="Farm asal" value={form.farm} onChange={v => set("farm", v)} options={farms.map(f => ({ value: f.name, label: f.name }))} /></label>
        <div className="schedule-form-row">
          <label><span className="field-label">Berangkat</span><TimeField label="Jam berangkat" value={form.depart} onChange={v => set("depart", v)} minuteStep={5} /></label>
          <label><span className="field-label">Estimasi tiba</span><TimeField label="Estimasi tiba" value={form.eta} onChange={v => set("eta", v)} minuteStep={5} /></label>
        </div>
        <div className="schedule-form-row">
          <label><span className="field-label">Awal umur susu</span><TimeField label="Awal umur susu" value={form.milkStart} onChange={v => set("milkStart", v)} minuteStep={5} /></label>
          <label><span className="field-label">Status perjalanan</span><Select label="Status perjalanan" value={form.status} onChange={v => set("status", v)} options={EDITABLE.map(s => ({ value: s, label: ARRIVAL_STATUS[s].label }))} /></label>
        </div>
        <label><span className="field-label">Catatan (opsional)</span><textarea value={form.note} onChange={e => set("note", e.target.value)} maxLength={200} rows={2} placeholder="Contoh: jalan Pujon macet, ETA mundur 20 menit" /></label>
        <p className="small muted">Perkiraan umur susu saat tiba {ageText(arrivalAge(form))}. Kedatangan aktual dicatat di Antrean Truk.</p>
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">{isNew ? "Tambah jadwal" : "Simpan perubahan"}</button>
        </div>
      </form>
    </Modal>
  );
}
