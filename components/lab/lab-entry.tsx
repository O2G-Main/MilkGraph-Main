"use client";

import { useState, type FormEvent } from "react";
import { addLabSample, saveLabEntry, useDemo, type DemoState } from "@/lib/demo";
import { newIntakeSample } from "@/lib/lab";
import { applyQueue } from "@/lib/receiving";
import { scenario } from "@/lib/data";
import type { LabParam, LabResult } from "@/mock/ops";
import { Modal } from "@/components/ui";
import { Select } from "@/components/ui/fields";

type Verdict = "lulus" | "gagal" | "berjalan";
const toVerdict = (ok: boolean | null): Verdict => (ok === null ? "berjalan" : ok ? "lulus" : "gagal");
const fromVerdict = (v: Verdict) => (v === "berjalan" ? null : v === "lulus");
const VERDICTS: { value: Verdict; label: string }[] = [{ value: "berjalan", label: "Masih berjalan" }, { value: "lulus", label: "Dalam batas" }, { value: "gagal", label: "Di luar batas" }];

/** Masukkan atau perbarui hasil tiap parameter satu sampel. */
export function LabEntryDialog({ sample, onClose }: { sample: LabResult; onClose: () => void }) {
  const [rows, setRows] = useState(sample.params.map(p => ({ ...p, verdict: toVerdict(p.ok) })));
  const [retest, setRetest] = useState(sample.status === "uji-ulang");
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) => { setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x))); setError(null); };

  function submit(e: FormEvent) {
    e.preventDefault();
    const empty = rows.find(r => r.verdict !== "berjalan" && !r.value.trim());
    if (empty) return setError(`Isi nilai ${empty.name} sebelum menyimpan hasilnya.`);
    const params: LabParam[] = rows.map(r => ({ name: r.name, limit: r.limit, value: r.verdict === "berjalan" && !r.value.trim() ? "Berjalan" : r.value.trim(), ok: fromVerdict(r.verdict) }));
    saveLabEntry(sample, params, retest);
    onClose();
  }

  return (
    <Modal title={`Hasil uji ${sample.subject}`} onClose={onClose} className="lab-entry-modal">
      <form className="schedule-form" onSubmit={submit} noValidate>
        <p className="muted">{sample.id} · {sample.detail} · diambil {sample.sampled}</p>
        <div className="lab-entry-list">
          {rows.map((r, i) => (
            <fieldset key={r.name} className="lab-entry-row">
              <legend>{r.name} <small>Batas {r.limit}</small></legend>
              <input aria-label={`Nilai ${r.name}`} value={r.value === "Berjalan" ? "" : r.value} placeholder="Nilai hasil uji" onChange={e => set(i, { value: e.target.value })} />
              <Select label={`Hasil ${r.name}`} value={r.verdict} onChange={v => set(i, { verdict: v })} options={VERDICTS} />
            </fieldset>
          ))}
        </div>
        {sample.kind !== "qc-fg" && <label className="check-row"><input type="checkbox" checked={retest} onChange={e => setRetest(e.target.checked)} />Perlu uji ulang sebelum diputuskan QA</label>}
        {error && <p className="small crit-text" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>Batal</button>
          <button type="submit" className="button primary">Simpan hasil</button>
        </div>
      </form>
    </Modal>
  );
}

/** RT yang sudah tiba tapi belum punya sampel lab. */
export function unsampledRts(samples: LabResult[], demo: Pick<DemoState, "receiving" | "limits">) {
  const sampled = new Set(samples.map(s => s.subject));
  return applyQueue(scenario.tankers, demo.receiving, demo.limits.holdingMin).filter(r => (r.stage === "Sampling" || r.stage === "Lab test") && !sampled.has(r.id));
}

/** Buat sampel untuk RT yang baru tiba. */
export function NewSampleDialog({ samples, onClose }: { samples: LabResult[]; onClose: () => void }) {
  const waiting = unsampledRts(samples, useDemo());
  const [rt, setRt] = useState(waiting[0]?.id ?? "");
  const pick = waiting.find(r => r.id === rt);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pick) return;
    const next = Math.max(9100, ...samples.map(s => Number(s.id.replace(/\D/g, "")) || 0)) + 1;
    addLabSample(newIntakeSample(`LAB-${next}`, pick.id, `${pick.farm} · ${new Intl.NumberFormat("id-ID").format(pick.volume)} L`, (pick.arrivedAt ?? "14:42").replace(":", "."), pick.temperature));
    onClose();
  }

  return (
    <Modal title="Buat sampel RT" onClose={onClose}>
      {!waiting.length ? <><p className="muted">Semua RT di antrean sudah punya sampel.</p><div className="dialog-actions"><button className="button primary" onClick={onClose}>Tutup</button></div></> : (
        <form className="schedule-form" onSubmit={submit} noValidate>
          <label><span className="field-label">RT yang belum disampel</span><Select label="RT yang belum disampel" value={rt} onChange={setRt} options={waiting.map(r => ({ value: r.id, label: r.id, hint: `${r.farm}, umur susu ${r.age}` }))} /></label>
          <p className="small muted">Semua parameter dimulai dari status berjalan. Isi hasilnya lewat Ubah hasil setelah uji selesai.</p>
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="button primary">Buat sampel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
