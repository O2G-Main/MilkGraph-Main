"use client";

import { useState, type FormEvent } from "react";
import { ArrowRightLeft } from "lucide-react";
import { addProcessTransfer, assignedAssets, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { ASSETS } from "@/lib/assets";
import { NOW, checkProcessTransfer, mayHandle } from "@/lib/operation";
import { Card, Icon, Modal, SectionTitle } from "@/components/ui";
import { Select, TimeField } from "@/components/ui/fields";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const clock = (t: string) => t.replace(":", ".");
/** Alat proses setelah penerimaan: tangki tengah, mixing, sterilizer, tangki aseptik, dan mesin filling. */
const PROCESS = ASSETS.filter(a => ["Penyimpanan", "Mixing", "Sterilisasi", "Tangki aseptik", "Filling"].includes(a.stage));

/** Transfer bahan antar-alat proses. Operator hanya melihat dan mencatat transfer yang menyentuh alat yang ditugaskan. */
export function ProcessTransfers() {
  const demo = useDemo();
  const allowed = can(demo.role, "process.transfer");
  const assigned = assignedAssets(demo);
  const [open, setOpen] = useState(false);
  const list = [...demo.operation.transfers].filter(t => mayHandle(assigned, t.from) || mayHandle(assigned, t.to)).reverse();

  return (
    <Card className="process-transfer">
      <SectionTitle
        title="Transfer bahan di alat proses"
        subtitle={assigned ? `Perpindahan bahan yang melibatkan alat yang ditugaskan (${assigned.join(", ")}).` : "Perpindahan bahan antar tangki, sterilizer, tangki aseptik, dan mesin filling."}
        action={allowed ? <button className="button primary" onClick={() => setOpen(true)}><Icon icon={ArrowRightLeft} size={16} />Catat transfer bahan</button> : undefined}
      />
      <div className="table-wrap">
        <table className="schedule-table">
          <thead><tr><th>Transfer</th><th>Dari</th><th>Ke</th><th className="numeric">Volume</th><th>Jam</th><th>Dicatat</th></tr></thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id}>
                <td className="schedule-time">{t.id}</td>
                <td data-label="Dari"><strong className="mono">{t.from}</strong></td>
                <td data-label="Ke"><strong className="mono">{t.to}</strong></td>
                <td data-label="Volume" className="numeric">{number(t.volume)} L</td>
                <td data-label="Jam" className="schedule-time">{clock(t.start)}-{clock(t.end)}</td>
                <td data-label="Dicatat" className="small muted">{t.by}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="muted">Belum ada transfer bahan yang tercatat.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <ProcessForm assigned={assigned} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function ProcessForm({ assigned, onClose }: { assigned: string[] | undefined; onClose: () => void }) {
  const mine = PROCESS.filter(a => mayHandle(assigned, a.id));
  const [from, setFrom] = useState(mine.find(a => a.id === "UHT-2")?.id ?? mine[0]?.id ?? "");
  const [to, setTo] = useState(mine.find(a => a.id === "AT-2")?.id ?? mine[1]?.id ?? "");
  const [volume, setVolume] = useState(0);
  const [start, setStart] = useState("14:00");
  const [end, setEnd] = useState(NOW);
  const [error, setError] = useState<string | null>(null);
  const options = PROCESS.map(a => ({ value: a.id, label: a.id, hint: `${a.group}, ${a.status.toLowerCase()}`, group: a.group }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const problem = checkProcessTransfer({ from, to, volume, start, end });
    if (problem) return setError(problem);
    if (!mayHandle(assigned, from) && !mayHandle(assigned, to)) return setError("Salah satu alat harus alat yang ditugaskan kepadamu.");
    addProcessTransfer({ from, to, volume, start, end });
    onClose();
  }

  return (
    <Modal title="Catat transfer bahan" onClose={onClose}>
      <form className="schedule-form" onSubmit={submit} noValidate>
        <div className="schedule-form-row">
          <label><span className="field-label">Dari</span><Select label="Alat asal" value={from} onChange={v => { setFrom(v); setError(null); }} options={options} searchable /></label>
          <label><span className="field-label">Ke</span><Select label="Alat tujuan" value={to} onChange={v => { setTo(v); setError(null); }} options={options} searchable /></label>
        </div>
        <label><span className="field-label">Volume (L)</span><input type="number" inputMode="numeric" min={1} step={10} value={volume || ""} onChange={e => { setVolume(Number(e.target.value)); setError(null); }} placeholder="Contoh: 6900" /></label>
        <div className="schedule-form-row">
          <label><span className="field-label">Mulai</span><TimeField label="Jam mulai transfer bahan" value={start} onChange={v => { setStart(v); setError(null); }} minuteStep={5} /></label>
          <label><span className="field-label">Selesai</span><TimeField label="Jam selesai transfer bahan" value={end} onChange={v => { setEnd(v); setError(null); }} minuteStep={5} /></label>
        </div>
        {assigned && <p className="small muted">Alat yang ditugaskan: {assigned.join(", ")}. Minimal salah satu ujung transfer harus alat ini.</p>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">Catat transfer</button>
        </div>
      </form>
    </Modal>
  );
}
