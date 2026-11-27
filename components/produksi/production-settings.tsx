"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Save } from "lucide-react";
import { Card, Icon, SectionTitle } from "@/components/ui";
import { API_MODE, apiGet } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import type { ProductionSession } from "@/lib/api/production";
import { setLimits, useDemo } from "@/lib/demo";
import { can, canOpen, type RoleId } from "@/lib/roles";
import { type Limits } from "@/lib/rules";

const numericSettings = [
  { key: "maxTransfer", label: "Laju transfer maksimum (L/jam)", min: 7000, max: 12000, step: 100 },
  { key: "tankMax", label: "Batas level Raw Milk Buffer (%)", min: 85, max: 100, step: 1 },
  { key: "cipBuffer", label: "Jeda setelah CIP bay (menit)", min: 0, max: 30, step: 5 },
  { key: "changeoverMax", label: "Changeover maksimum per lini per shift", min: 0, max: 4, step: 1 },
] as const;
type Setting = typeof numericSettings[number]["key"];
type Range = { key: string; kind: string; min?: number; max?: number; step?: number };
type LimitsSchema = { params: Range[] }[];
const tools = [
  { href: "/penjadwalan", label: "Penjadwalan", detail: "Kelola PO, jadwal produksi, dan pemicu regenerasi." },
  { href: "/aturan-produksi", label: "Aturan Produksi", detail: "Lihat atau atur changeover, durasi CIP, dan ketentuan mutu." },
  { href: "/constraint", tab: "/rencana", label: "Constraint", detail: "Periksa kelayakan rencana dan pengaturan constraint lainnya." },
  { href: "/master-data", label: "Master Alat", detail: "Kelola data induk alat dan lini produksi." },
  { href: "/kondisi-alat", label: "Kondisi Alat", detail: "Tinjau kondisi alat dan kelola catatan downtime." },
];

export function ProductionSettings({ role }: { role: RoleId }) {
  const { limits: demoLimits } = useDemo();
  const saved = useResource<Limits>(API_MODE ? "/limits" : null);
  const schema = useResource<LimitsSchema>(API_MODE ? "/limits/schema" : null);
  const current = API_MODE ? saved.data : demoLimits;
  const session = useResource<ProductionSession>(API_MODE ? "/session" : null);
  const allowed = API_MODE
    ? session.data?.role === role && session.data.permissions.includes("constraint.edit")
    : can(role, "constraint.edit");
  const availableTools = tools.filter(tool => canOpen(role, tool.href, tool.tab ?? tool.href));
  const ranges = schema.data?.flatMap(group => group.params) ?? [];
  const fields = numericSettings.flatMap(setting => {
    if (!API_MODE) return [setting];
    const bounds = ranges.find(range => range.key === setting.key && range.kind === "range");
    if (bounds?.min == null || bounds.max == null || bounds.step == null || bounds.step <= 0) return [];
    return [{ ...setting, min: bounds.min, max: bounds.max, step: bounds.step }];
  });
  const [draft, setDraft] = useState<Partial<Record<Setting, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const dirty = fields.some(({ key }) => draft[key] !== undefined && Number(draft[key]) !== current?.[key]);
  const loadError = saved.error ?? schema.error;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || !current || !dirty || saving) return;
    const patch: Partial<Limits> = {};
    for (const { key } of fields) {
      const value = draft[key];
      if (value !== undefined && value !== "" && Number(value) !== current[key]) patch[key] = Number(value);
    }
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    setNotice(false);
    try {
      const latest = API_MODE ? await apiGet<Limits>("/limits", role) : current;
      await setLimits({ ...latest, ...patch }, "Pengaturan batas dari halaman Produksi");
      if (API_MODE) await saved.reload();
      setDraft({});
      setNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Card>
      <SectionTitle title="Batas operasional"
        subtitle={API_MODE ? "Pengaturan global perencanaan produksi yang disimpan ke server." : "Pengaturan global untuk simulasi lokal."} />
      {loadError ? <p className="crit-text" role="alert">Gagal memuat pengaturan: {loadError.message}</p>
      : !current || (API_MODE && !schema.data) ? <p className="muted" role="status">Memuat pengaturan produksi…</p>
      : !fields.length ? <p className="muted">Server belum menyediakan parameter pengaturan ini.</p>
      : <form className="schedule-form" onSubmit={save}>
        <div className="production-settings-grid">
          {fields.map(({ key, label, min, max, step }) => (
            <label key={key}>
              <span className="field-label">{label}</span>
              <input type="number" required min={min} max={max} step={step} readOnly={!allowed}
                disabled={saving} value={draft[key] ?? current[key]}
                onChange={e => {
                  const value = e.currentTarget.value;
                  setDraft(previous => ({ ...previous, [key]: value }));
                  setError(null);
                  setNotice(false);
                }} />
            </label>
          ))}
        </div>
        {error && <p className="crit-text" role="alert">Gagal menyimpan pengaturan: {error}</p>}
        {notice && <p className="ok-text" role="status">Pengaturan produksi tersimpan.</p>}
        {allowed ? <div className="dialog-actions">
          <button type="submit" className="button primary" disabled={!dirty || saving}><Icon icon={Save} size={16} />{saving ? "Menyimpan…" : "Simpan pengaturan"}</button>
        </div> : <p className="small muted">Peran Anda dapat melihat pengaturan ini.</p>}
      </form>}
    </Card>

    {availableTools.length > 0 && <Card>
      <SectionTitle title="Kelola sistem produksi" />
      <ul className="attention-list">{availableTools.map(tool => <li key={tool.href}>
        <Link className="attention-item" href={tool.href}>
          <span className="attention-copy"><strong>{tool.label}</strong><span>{tool.detail}</span></span>
          <Icon icon={ArrowRight} size={16} />
        </Link>
      </li>)}</ul>
    </Card>}
  </>;
}
