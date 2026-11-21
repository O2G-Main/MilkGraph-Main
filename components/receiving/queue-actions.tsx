"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { recordArrival, updateRtRecord, useDemo } from "@/lib/demo";
import { ageAt, ageText, clock, toMin, type QueueRow } from "@/lib/receiving";
import { Modal } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
/** Bay 2 sedang CIP sampai pukul 15.20 di snapshot [simulasi]. */
const BAY_CIP: Record<string, string> = { "Bay 2": "15:20" };
export const BAYS = ["Bay 1", "Bay 2", "Bay 3"];

function Actions({ onClose, label }: { onClose: () => void; label: string }) {
  return <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button type="submit" className="button primary">{label}</button></div>;
}

/** Catat kedatangan aktual RT dari jadwal: jam tiba, awal umur susu, volume timbang, dan suhu. */
export function ArriveDialog({ onClose }: { onClose: () => void }) {
  const { receiving } = useDemo();
  const waiting = receiving.arrivals.filter(a => a.status === "perjalanan" || a.status === "loading");
  const [id, setId] = useState(waiting[0]?.id ?? "");
  const pick = waiting.find(a => a.id === id);
  const [arrivedAt, setArrivedAt] = useState(pick?.eta ?? "15:05");
  const [milkStart, setMilkStart] = useState(pick?.milkStart ?? "06:00");
  const [volume, setVolume] = useState(pick?.volume ?? 0);
  const [temperature, setTemperature] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const choose = (next: string) => { const a = waiting.find(x => x.id === next); setId(next); if (a) { setArrivedAt(a.eta); setMilkStart(a.milkStart); setVolume(a.volume); } setError(null); };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pick) return setError("Pilih RT dari jadwal kedatangan.");
    if (!(volume > 0)) return setError("Isi volume timbang lebih dari 0 L.");
    if (!(temperature > 0 && temperature < 15)) return setError("Isi suhu susu antara 0 dan 15 °C.");
    recordArrival(pick.id, { arrivedAt, milkStart, volume, temperature });
    onClose();
  }

  return (
    <Modal title="Catat kedatangan RT" onClose={onClose}>
      {!waiting.length ? <><p className="muted">Semua RT di jadwal sudah tiba atau dibatalkan. Tambah jadwal baru di Jadwal Kedatangan RT.</p><div className="dialog-actions"><Link className="button primary" href="/kedatangan">Buka jadwal kedatangan</Link></div></> : (
        <form className="schedule-form" onSubmit={submit} noValidate>
          <label><span className="field-label">RT dari jadwal</span><Select label="RT dari jadwal" value={id} onChange={choose} options={waiting.map(a => ({ value: a.id, label: a.id, hint: `${a.farm}, ETA ${clock(a.eta)}` }))} /></label>
          <div className="schedule-form-row">
            <label><span className="field-label">Tiba aktual</span><TimeField label="Jam tiba aktual" value={arrivedAt} onChange={setArrivedAt} minuteStep={5} /></label>
            <label><span className="field-label">Awal umur susu</span><TimeField label="Awal umur susu" value={milkStart} onChange={setMilkStart} minuteStep={5} /></label>
          </div>
          <div className="schedule-form-row">
            <label><span className="field-label">Volume timbang (L)</span><input type="number" inputMode="numeric" min={1} step={10} value={volume || ""} onChange={e => setVolume(Number(e.target.value))} /></label>
            <label><span className="field-label">Suhu (°C)</span><input type="number" inputMode="decimal" min={0} max={15} step={0.1} value={temperature} onChange={e => setTemperature(Number(e.target.value))} /></label>
          </div>
          <p className="small muted">Umur susu saat tiba {ageText(ageAt(milkStart, arrivedAt))}. RT masuk antrean di tahap Sampling.</p>
          {error && <p className="small crit-text" role="alert">{error}</p>}
          <Actions onClose={onClose} label="Catat kedatangan" />
        </form>
      )}
    </Modal>
  );
}

export type RtAction = "catatan" | "mulai" | "selesai";

/** Ubah catatan RT di antrean: jam tiba dan awal umur susu, mulai bongkar di bay, atau selesai bongkar. */
export function RtDialog({ row, action, rows, bayOf, onClose }: { row: QueueRow; action: RtAction; rows: QueueRow[]; bayOf: (r: QueueRow) => string | undefined; onClose: () => void }) {
  const [arrivedAt, setArrivedAt] = useState(row.arrivedAt ?? "");
  const [milkStart, setMilkStart] = useState(row.milkStart);
  const occupant = (b: string) => rows.find(r => r.id !== row.id && r.stage === "Unloading" && bayOf(r) === b);
  /** Jam bay baru kosong setelah bongkar terakhir yang sudah selesai di bay itu. */
  const freeAt = (b: string) => rows.filter(r => r.id !== row.id && bayOf(r) === b && r.unloadEnd).map(r => r.unloadEnd!).sort((x, y) => toMin(y) - toMin(x))[0];
  /** Jam paling awal bay bisa dipakai: setelah CIP dan bongkar sebelumnya. */
  const readyAt = (b: string, from = "14:45") => [from, BAY_CIP[b], freeAt(b)].filter((x): x is string => !!x).sort((x, y) => toMin(y) - toMin(x))[0];
  const free = BAYS.find(b => !occupant(b) && !BAY_CIP[b]) ?? BAYS[0];
  const [bay, setBay] = useState(bayOf(row) ?? free);
  const [start, setStart] = useState(row.unloadStart ?? readyAt(bayOf(row) ?? free));
  const [end, setEnd] = useState(row.unloadEnd ?? "15:15");
  const [volume, setVolume] = useState(row.volume);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (action === "catatan") {
      updateRtRecord(row.id, { ...(arrivedAt ? { arrivedAt } : {}), milkStart }, "Catatan RT diubah", `tiba ${arrivedAt ? clock(arrivedAt) : "-"}, awal umur susu ${clock(milkStart)}`);
    } else if (action === "mulai") {
      const busy = occupant(bay);
      if (busy) return setError(`${bay} masih dipakai ${busy.id}.`);
      if (BAY_CIP[bay] && toMin(start) < toMin(BAY_CIP[bay])) return setError(`${bay} masih CIP sampai pukul ${clock(BAY_CIP[bay])}.`);
      const after = freeAt(bay);
      if (after && toMin(start) < toMin(after)) return setError(`${bay} baru kosong pukul ${clock(after)} setelah bongkar sebelumnya.`);
      updateRtRecord(row.id, { bay, unloadStart: start }, "Bongkar RT dimulai", `${bay} pukul ${clock(start)}`);
    } else {
      if (row.unloadStart && toMin(end) <= toMin(row.unloadStart)) return setError("Jam selesai harus setelah jam mulai bongkar.");
      if (!(volume > 0)) return setError("Isi volume terbongkar lebih dari 0 L.");
      updateRtRecord(row.id, { bay: bayOf(row), unloadEnd: end, volume }, "Bongkar RT selesai", `${bayOf(row) ?? "bay"} pukul ${clock(end)}, ${number(volume)} L`);
    }
    onClose();
  }

  const title = { catatan: `Catatan ${row.id}`, mulai: `Mulai bongkar ${row.id}`, selesai: `Selesai bongkar ${row.id}` }[action];
  return (
    <Modal title={title} onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <p className="muted">{row.farm}, {number(row.volume)} L, umur susu {row.age}.</p>
        {action === "catatan" && <div className="schedule-form-row">
          <label><span className="field-label">Tiba aktual</span><TimeField label="Jam tiba aktual" value={arrivedAt} onChange={setArrivedAt} minuteStep={5} placeholder="Belum dicatat" /></label>
          <label><span className="field-label">Awal umur susu</span><TimeField label="Awal umur susu" value={milkStart} onChange={setMilkStart} minuteStep={5} /></label>
        </div>}
        {action === "mulai" && <div className="schedule-form-row">
          <label><span className="field-label">Bay bongkar</span><Select label="Bay bongkar" value={bay} onChange={v => { setBay(v); setError(null); setStart(readyAt(v)); }} options={BAYS.map(b => { const o = occupant(b), f = freeAt(b); return { value: b, label: b, hint: o ? `Dipakai ${o.id}` : BAY_CIP[b] ? `CIP sampai ${clock(BAY_CIP[b])}` : f ? `Kosong sejak ${clock(f)}` : "Siap" }; })} /></label>
          <label><span className="field-label">Mulai pukul</span><TimeField label="Jam mulai bongkar" value={start} onChange={v => { setStart(v); setError(null); }} minuteStep={5} /></label>
        </div>}
        {action === "selesai" && <div className="schedule-form-row">
          <label><span className="field-label">Selesai pukul</span><TimeField label="Jam selesai bongkar" value={end} onChange={v => { setEnd(v); setError(null); }} minuteStep={5} /></label>
          <label><span className="field-label">Volume terbongkar (L)</span><input type="number" inputMode="numeric" min={1} step={10} value={volume || ""} onChange={e => setVolume(Number(e.target.value))} /></label>
        </div>}
        {action === "selesai" && <p className="small muted">Setelah selesai, catat pindahan susu ke tangki di <Link className="inline-link" href="/transfer">Transfer &amp; Volume</Link>.</p>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <Actions onClose={onClose} label={{ catatan: "Simpan catatan", mulai: "Mulai bongkar", selesai: "Selesai bongkar" }[action]} />
      </form>
    </Modal>
  );
}
