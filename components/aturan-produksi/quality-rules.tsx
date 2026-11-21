"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { setLimits, setQuality, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { DEFAULT_LIMITS, type Limits } from "@/lib/rules";
import { DEFAULT_QUALITY, type QualitySpec } from "@/lib/lab";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";

const hm = (m: number) => (m % 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m / 60} jam`);
const fmt = (n: number, digits: number) => n.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Satu isian angka dengan batas wajar, disimpan per baris. */
function SpecInput({ label, value, unit, min, max, step, digits = 0, onSave, allowed }: { label: string; value: number; unit: string; min: number; max: number; step: number; digits?: number; onSave: (v: number) => void; allowed: boolean }) {
  const [draft, setDraft] = useState(String(value));
  const v = Number(draft.replace(",", "."));
  const invalid = !Number.isFinite(v) || v < min || v > max;
  if (!allowed) return <span className="numeric">{fmt(value, digits)} {unit}</span>;
  return (
    <form className="rule-input quality-input" onSubmit={e => { e.preventDefault(); if (!invalid && v !== value) onSave(v); }}>
      <input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} onChange={e => setDraft(e.target.value)} aria-label={`${label}, ${unit}`} aria-invalid={invalid} />
      <span className="small muted">{unit}</span>
      <button type="submit" className="button secondary" disabled={invalid || v === value}><Icon icon={Check} size={14} />Simpan</button>
      {invalid && <span className="small crit-text rule-error" role="alert">Isi antara {fmt(min, digits)} dan {fmt(max, digits)} {unit}.</span>}
    </form>
  );
}

const status = (value: number, def: number) => value === def ? <Badge tone="ok">Standar awal</Badge> : <Badge tone="warn">Diubah dari {fmt(def, Number.isInteger(def) ? 0 : 1)}</Badge>;

/** Bagian QA/QC di Aturan Produksi: batas holding time dan ketentuan mutu susu segar. */
export function QualityRules() {
  const demo = useDemo();
  const allowed = can(demo.role, "quality.rules");
  const { limits, quality } = demo;
  const saveLimit = (key: keyof Pick<Limits, "holdingMin" | "bufferMaxMin">, label: string) => (v: number) => void setLimits({ ...limits, [key]: v }, `${label}: ${hm(limits[key])} jadi ${hm(v)}`);
  const saveSpec = (key: keyof QualitySpec, label: string, unit: string, digits: number) => (v: number) => setQuality({ ...quality, [key]: v }, `${label}: ${fmt(quality[key], digits)} jadi ${fmt(v, digits)} ${unit}`);

  const holding = [
    { key: "holdingMin" as const, label: "Farm sampai tersimpan dingin", min: 480, max: 720, step: 10 },
    { key: "bufferMaxMin" as const, label: "Raw Milk Buffer sampai thermal", min: 720, max: 1_440, step: 30 },
  ];
  const specs = [
    { key: "tempMax" as const, label: "Suhu tiba maksimal", unit: "°C", min: 2, max: 8, step: 0.1, digits: 1 },
    { key: "tpcMax" as const, label: "TPC maksimal", unit: "CFU/ml", min: 100_000, max: 2_000_000, step: 10_000, digits: 0 },
    { key: "fatMin" as const, label: "Lemak minimal", unit: "%", min: 2, max: 5, step: 0.1, digits: 1 },
    { key: "proteinMin" as const, label: "Protein minimal", unit: "%", min: 2, max: 4, step: 0.1, digits: 1 },
  ];

  return <>
    <Card className="rules-card">
      <SectionTitle title="Batas holding time" subtitle="Umur susu maksimal sebelum masuk tahap berikutnya. Dipakai di antrean truk, jadwal kedatangan, dan cek kelayakan rencana." />
      <div className="table-wrap"><table className="rules-table">
        <thead><tr><th>Tahap</th><th>Batas</th><th>Status</th></tr></thead>
        <tbody>{holding.map(h => <tr key={h.key}>
          <td>{h.label}<span className="table-sub">{hm(limits[h.key])} [asumsi]</span></td>
          <td data-label="Batas"><SpecInput key={limits[h.key]} label={h.label} value={limits[h.key]} unit="menit" min={h.min} max={h.max} step={h.step} allowed={allowed} onSave={saveLimit(h.key, h.label)} /></td>
          <td data-label="Status">{status(limits[h.key], DEFAULT_LIMITS[h.key])}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
    <Card className="rules-card">
      <SectionTitle title="Ketentuan mutu susu segar" subtitle="Batas parameter sampel RT di Tes Lab. Alcohol test dan antibiotik tetap harus negatif." />
      <div className="table-wrap"><table className="rules-table">
        <thead><tr><th>Parameter</th><th>Batas</th><th>Status</th></tr></thead>
        <tbody>{specs.map(s => <tr key={s.key}>
          <td>{s.label}</td>
          <td data-label="Batas"><SpecInput key={quality[s.key]} label={s.label} value={quality[s.key]} unit={s.unit} min={s.min} max={s.max} step={s.step} digits={s.digits} allowed={allowed} onSave={saveSpec(s.key, s.label, s.unit, s.digits)} /></td>
          <td data-label="Status">{status(quality[s.key], DEFAULT_QUALITY[s.key])}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
  </>;
}
