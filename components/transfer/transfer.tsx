"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, ArrowRightLeft } from "lucide-react";
import { addTransfer, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { scenario } from "@/lib/data";
import { applyQueue, checkTransfer, clock, tankRoom, toMin, type QueueRow } from "@/lib/receiving";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
/** Tangki penerimaan (raw milk tank) dari snapshot skenario. */
const TANKS = scenario.assets.filter(a => a.kind === "Buffer").map(a => ({ id: a.id, fill: a.fill, capacity: a.capacity, temp: a.info }));

export function Transfer() {
  const demo = useDemo();
  const allowed = can(demo.role, "transfer.record");
  const [open, setOpen] = useState(false);
  const { transfers } = demo.receiving;
  const room = tankRoom(TANKS, transfers);
  const rows = applyQueue(scenario.tankers, demo.receiving, demo.limits.holdingMin);
  const moved = new Set(transfers.map(t => t.rt));
  const ready = rows.filter(r => (r.stage === "Unloading" || r.stage === "Selesai bongkar") && !moved.has(r.id));
  const fresh = transfers.filter(t => !t.counted);

  return (
    <div className="page-enter">
      <PageHeading title="Transfer & Volume" subtitle="Pindahan susu dari road tanker ke tangki penerimaan. Volume dicocokkan dengan timbangan RT dan sisa ruang tangki.">
        {allowed && <button className="button primary" onClick={() => setOpen(true)}><Icon icon={ArrowRightLeft} size={16} />Catat transfer</button>}
      </PageHeading>
      <div className="schedule-stats">
        {TANKS.map(t => {
          const r = room[t.id];
          const pct = Math.round(r.fill / r.capacity * 100);
          return (
            <Card key={t.id} className="tank-room">
              <span className="small muted">{t.id} · {t.temp}</span>
              <strong className={pct >= 95 ? "crit-text" : pct >= 85 ? "warn-text" : ""}>{pct}% <small>terisi</small></strong>
              <span className="tank-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, pct)}%` }} className={pct >= 95 ? "crit" : pct >= 85 ? "warn" : ""} /></span>
              <span className="small muted">{number(r.fill)} dari {number(r.capacity)} L, sisa {number(Math.max(0, r.free))} L</span>
            </Card>
          );
        })}
      </div>
      <Card>
        <SectionTitle title="Catatan transfer" subtitle={`${fresh.length} transfer baru di shift ini, ${number(fresh.reduce((s, t) => s + t.volume, 0))} L. Transfer sebelum snapshot 14.42 sudah termasuk di level tangki.`} action={<Link className="text-link" href="/receiving">Buka antrean truk<Icon icon={ArrowRight} size={14} /></Link>} />
        <div className="table-wrap">
          <table className="schedule-table">
            <thead><tr><th>Transfer</th><th>RT</th><th>Tangki</th><th className="numeric">Volume</th><th>Jam</th><th>Keterangan</th></tr></thead>
            <tbody>
              {[...transfers].reverse().map(t => {
                const rt = rows.find(r => r.id === t.rt);
                const issue = rt && !t.counted ? checkTransfer(t.volume, rt.volume, Number.POSITIVE_INFINITY)[0] : undefined;
                return (
                  <tr key={t.id}>
                    <td className="schedule-time">{t.id}</td>
                    <td data-label="RT"><strong className="mono">{t.rt}</strong>{rt && <span className="table-sub">{rt.farm}</span>}</td>
                    <td data-label="Tangki">{t.tank}</td>
                    <td data-label="Volume" className="numeric">{number(t.volume)} L</td>
                    <td data-label="Jam" className="schedule-time">{clock(t.start)}-{clock(t.end)}</td>
                    <td data-label="Keterangan">{t.counted ? <span className="small muted">Sudah termasuk di level snapshot</span> : issue ? <><Badge tone={issue.tone}>Perlu dicek</Badge><span className="table-sub">{issue.text}</span></> : <Badge tone="ok">Cocok dengan timbangan</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {open && <TransferForm ready={ready} room={room} onClose={() => setOpen(false)} />}
    </div>
  );
}

function TransferForm({ ready, room, onClose }: { ready: QueueRow[]; room: ReturnType<typeof tankRoom>; onClose: () => void }) {
  const first = ready[0];
  const best = TANKS.reduce((a, b) => (room[b.id].free > room[a.id].free ? b : a)).id;
  const [rtId, setRtId] = useState(first?.id ?? "");
  const rt = ready.find(r => r.id === rtId);
  const [tank, setTank] = useState(best);
  const [volume, setVolume] = useState(first?.volume ?? 0);
  const [start, setStart] = useState(first?.unloadStart ?? "14:45");
  const [end, setEnd] = useState(first?.unloadEnd ?? "15:15");
  const [error, setError] = useState<string | null>(null);
  const issues = checkTransfer(volume, rt?.volume, room[tank]?.free ?? 0);
  const choose = (id: string) => { const r = ready.find(x => x.id === id); setRtId(id); if (r) { setVolume(r.volume); setStart(r.unloadStart ?? "14:45"); setEnd(r.unloadEnd ?? "15:15"); } setError(null); };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!rt) return setError("Pilih RT yang sedang atau sudah dibongkar.");
    if (toMin(end) <= toMin(start)) return setError("Jam selesai harus setelah jam mulai.");
    const crit = issues.find(x => x.tone === "crit");
    if (crit) return setError(crit.text);
    addTransfer({ rt: rt.id, tank, volume, start, end });
    onClose();
  }

  return (
    <Modal title="Catat transfer ke tangki" onClose={onClose}>
      {!ready.length ? <><p className="muted">Belum ada RT yang sedang atau sudah dibongkar tanpa catatan transfer. Mulai bongkar dulu di Antrean Truk.</p><div className="dialog-actions"><Link className="button primary" href="/receiving">Buka antrean truk</Link></div></> : (
        <form className="schedule-form" onSubmit={submit} noValidate>
          <div className="schedule-form-row">
            <label><span className="field-label">RT</span><Select label="RT yang dibongkar" value={rtId} onChange={choose} options={ready.map(r => ({ value: r.id, label: r.id, hint: `${r.farm}, ${number(r.volume)} L` }))} /></label>
            <label><span className="field-label">Tangki tujuan</span><Select label="Tangki tujuan" value={tank} onChange={v => { setTank(v); setError(null); }} options={TANKS.map(t => ({ value: t.id, label: t.id, hint: `Sisa ${number(Math.max(0, room[t.id].free))} L` }))} /></label>
          </div>
          <label><span className="field-label">Volume transfer (L)</span><input type="number" inputMode="numeric" min={1} step={10} value={volume || ""} onChange={e => { setVolume(Number(e.target.value)); setError(null); }} /></label>
          <div className="schedule-form-row">
            <label><span className="field-label">Mulai</span><TimeField label="Jam mulai transfer" value={start} onChange={setStart} minuteStep={5} /></label>
            <label><span className="field-label">Selesai</span><TimeField label="Jam selesai transfer" value={end} onChange={setEnd} minuteStep={5} /></label>
          </div>
          {issues.map(x => <p key={x.text} className={`small ${x.tone === "crit" ? "crit-text" : "warn-text"}`}>{x.text}</p>)}
          {!issues.length && rt && <p className="small ok-text">Volume cocok dengan timbangan {rt.id} dan masih muat di {tank}.</p>}
          {error && <p className="small crit-text" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="button primary">Catat transfer</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
