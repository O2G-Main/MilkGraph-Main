"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Icon, Modal } from "@/components/ui";

const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

/**
 * Ubah satu angka aturan lewat modal, bukan isian langsung di tabel.
 * Simpan selalu minta konfirmasi karena nilainya dipakai di jadwal dan cek kelayakan.
 */
export function RuleDialog({
  title, label, value, unit, min, max, step, note, onSave, onClose,
}: {
  title: string; label: string; value: number; unit: string; min: number; max: number; step: number;
  note?: string; onSave: (value: number) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [confirm, setConfirm] = useState(false);
  const next = Number(draft.replace(",", "."));
  const invalid = !Number.isFinite(next) || next < min || next > max;
  const dirty = next !== value;

  const save = () => {
    if (!confirm) { setConfirm(true); return; }
    onSave(next);
    onClose();
  };

  return <Modal title={confirm ? "Konfirmasi perubahan" : title} onClose={onClose}>
    {confirm ? <>
      <p className="dialog-summary">
        {label} akan diubah dari <strong>{fmt(value)} {unit}</strong> menjadi <strong>{fmt(next)} {unit}</strong>.
        Nilai ini dipakai di penjadwalan dan cek kelayakan, jadi pastikan sudah sesuai.
      </p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={() => setConfirm(false)}>Periksa lagi</button>
        <button type="button" className="button primary" onClick={save}><Icon icon={Check} size={16} />Ya, simpan</button>
      </div>
    </> : <>
      <form className="schedule-form" onSubmit={e => { e.preventDefault(); if (!invalid && dirty) save(); }}>
        <label>
          <span className="field-label">Nilai baru</span>
          <input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} autoFocus
            aria-invalid={invalid} onChange={e => setDraft(e.target.value)} />
          <span className="small muted">{unit}</span>
        </label>
        {note && <p className="small muted">{note}</p>}
        {invalid && <p className="small crit-text" role="alert">Isi antara {fmt(min)} dan {fmt(max)} {unit}.</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary" disabled={invalid || !dirty}>Simpan</button>
        </div>
      </form>
    </>}
  </Modal>;
}

/** Nilai aturan di tabel + tombol Ubah; tanpa input langsung di sel. */
export function RuleValue({
  title, label, value, unit, min, max, step, note, onSave, allowed, display,
}: {
  title: string; label: string; value: number; unit: string; min: number; max: number; step: number;
  note?: string; onSave: (value: number) => void; allowed: boolean; display?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!allowed) return <span className="numeric">{display ?? `${fmt(value)} ${unit}`}</span>;
  return <>
    <button type="button" className="rule-edit" onClick={() => setOpen(true)} aria-label={`Ubah ${label}`}>
      <span>{display ?? `${fmt(value)} ${unit}`}</span><Icon icon={Pencil} size={14} />
    </button>
    {open && <RuleDialog title={title} label={label} value={value} unit={unit} min={min} max={max} step={step} note={note} onSave={onSave} onClose={() => setOpen(false)} />}
  </>;
}
