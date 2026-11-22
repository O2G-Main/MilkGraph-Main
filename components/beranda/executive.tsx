"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import CountUp from "@/components/bits/CountUp";
import { Card, Icon, SectionTitle } from "@/components/ui";
import type { Tone } from "@/mock/types";

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const AXIS = { fontSize: 11, fill: "var(--color-on-surface-muted)" };
const GAP = { stroke: "var(--color-surface)", strokeWidth: 2 };

/* ---------- KPI: angka besar, bar progres, satu frasa ---------- */
/** `value` null = data belum ada di sumbernya; tampil "Belum ada", bukan 0. `progress` kosong = tanpa bar. */
export type ExecKpi = { icon: LucideIcon; label: string; value: number | null; suffix?: string; of?: string; decimals?: number; progress?: number; note: string; tone: Tone; href: string };
export function ExecKpis({ items }: { items: ExecKpi[] }) {
  return <div className="schedule-stats planner-kpis exec-kpis">{items.map(k => (
    <Link key={k.label} href={k.href} className={`card planner-kpi exec-kpi ${k.tone}`}>
      <span className="planner-kpi-label"><Icon icon={k.icon} size={16} />{k.label}<Icon icon={ArrowUpRight} size={15} className="planner-kpi-go" /></span>
      {k.value === null
        ? <strong className="exec-kpi-empty">Belum ada</strong>
        // CountUp memakai titik sebagai pemisah desimal; angka berdesimal ditulis statis dengan format Indonesia.
        : <strong>{k.decimals ? `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: k.decimals }).format(k.value)}${k.suffix ?? ""}` : <CountUp to={k.value} separator="." duration={1.2} suffix={k.suffix} />}{k.of && <small> {k.of}</small>}</strong>}
      {k.progress !== undefined && <span className="exec-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, k.progress))}%` }} /></span>}
      <span className="small muted">{k.note}</span>
    </Link>
  ))}</div>;
}

export function Tip({ active, payload, unit }: TooltipContentProps & { unit?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { name?: string; label?: string };
  return <div className="lc-tooltip"><span>{row.label ?? row.name}</span>{payload.map(p => <strong key={String(p.dataKey ?? p.name)}>{p.name}: {fmt(Number(p.value))}{unit ? ` ${unit}` : ""}</strong>)}</div>;
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return <ul className="exec-legend">{items.map(i => <li key={i.label}><i style={{ background: i.color }} aria-hidden="true" />{i.label}{i.value && <strong>{i.value}</strong>}</li>)}</ul>;
}

/* ---------- Pasokan: gauge cakupan + RT per farm ---------- */
export type FarmBar = { name: string; tiba: number; jalan: number; belum: number; plannedL: number };
const FARM = [
  { key: "tiba", label: "Sudah tiba", color: "var(--color-primary)" },
  { key: "jalan", label: "Dalam perjalanan", color: "#6FBF8B" },
  { key: "belum", label: "Belum berangkat", color: "var(--color-neutral-fill)" },
] as const;
export function SupplyCard({ cover, planned, need, farms }: { cover: number; planned: number; need: number; farms: FarmBar[] }) {
  const tone = cover < 100 ? "crit" : cover < 105 ? "warn" : "ok";
  const arc = Math.min(cover, 120) / 120;
  return <Card className="exec-card">
    <SectionTitle title="Pasokan susu" subtitle="Rencana kiriman farm dibanding kebutuhan produksi." action={<Link className="text-link" href="/pasokan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
    <div className="exec-supply">
      <figure className="exec-gauge" aria-label={`Cakupan pasokan ${cover}% dari kebutuhan`}>
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <path d="M10 62 A50 50 0 0 1 110 62" pathLength={1} className="exec-gauge-track" />
          <path d="M10 62 A50 50 0 0 1 110 62" pathLength={1} className={`exec-gauge-fill ${tone}`} style={{ strokeDasharray: `${arc} 1` }} />
          {/* Tanda 100% kebutuhan */}
          <line x1="60" y1="4" x2="60" y2="14" transform={`rotate(${(100 / 120) * 180 - 90} 60 62)`} className="exec-gauge-mark" />
        </svg>
        <figcaption><strong className={`${tone}-text`}><CountUp to={cover} duration={1.2} suffix="%" /></strong><span>dari kebutuhan</span></figcaption>
        <dl><div><dt>Rencana</dt><dd>{fmt(planned)} L</dd></div><div><dt>Butuh</dt><dd>{fmt(need)} L</dd></div></dl>
      </figure>
      <div className="exec-plot">
        <p className="exec-plot-title">RT per farm</p>
        <ResponsiveContainer width="100%" height={farms.length * 38 + 12}>
          <BarChart data={farms} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} tick={AXIS} />
            <Tooltip content={p => <Tip {...p} unit="RT" />} cursor={{ fill: "var(--color-surface-muted)", opacity: 0.5 }} />
            {FARM.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="rt" fill={s.color} {...GAP} radius={i === FARM.length - 1 ? [0, 4, 4, 0] : i === 0 ? [4, 0, 0, 4] : 0} isAnimationActive />)}
          </BarChart>
        </ResponsiveContainer>
        <Legend items={FARM.map(s => ({ label: s.label, color: s.color }))} />
      </div>
    </div>
    <details className="lc-table"><summary>Lihat data sebagai tabel</summary><div className="table-wrap"><table><thead><tr><th>Farm</th><th className="numeric">Tiba</th><th className="numeric">Perjalanan</th><th className="numeric">Belum</th><th className="numeric">Rencana</th></tr></thead>
      <tbody>{farms.map(f => <tr key={f.name}><td>{f.name}</td><td className="numeric">{f.tiba} RT</td><td className="numeric">{f.jalan} RT</td><td className="numeric">{f.belum} RT</td><td className="numeric">{fmt(f.plannedL)} L</td></tr>)}</tbody></table></div></details>
  </Card>;
}

/* ---------- Mesin: donut status lini + downtime ---------- */
export type StateSlice = { key: string; label: string; count: number; color: string; lines: string[] };
/** Warna infografis (palet divalidasi): hijau = baik, hijau muda = berjalan, kuning = perlu dicek, abu = netral, merah = kritis. */
export const C = { ok: "var(--color-primary)", soft: "#6FBF8B", warn: "#B7791F", gray: "#CBD3CD", crit: "var(--color-status-crit)" };

/** Donut dengan total di tengah dan legenda berangka. Irisan 0 disembunyikan tapi tetap tercantum di legenda. */
export type DonutSeg = { key: string; label: string; count: number; color: string };
export function Donut({ segs, unit, caption }: { segs: DonutSeg[]; unit: string; caption?: string }) {
  const shown = segs.filter(s => s.count);
  const total = segs.reduce((s, x) => s + x.count, 0);
  return <div className="exec-machine">
    <figure className="exec-donut" aria-label={segs.map(s => `${s.label} ${s.count}`).join(", ")}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={shown} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="96%" paddingAngle={shown.length > 1 ? 2 : 0} cornerRadius={4} {...GAP}>
            {shown.map(s => <Cell key={s.key} fill={s.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="lc-tooltip"><span>{String(payload[0].name)}</span><strong>{String(payload[0].value)} {unit}</strong></div> : null} />
        </PieChart>
      </ResponsiveContainer>
      <figcaption><strong><CountUp to={total} duration={1} /></strong><span>{caption ?? unit}</span></figcaption>
    </figure>
    <Legend items={segs.map(s => ({ label: s.label, color: s.color, value: String(s.count) }))} />
  </div>;
}

/** Bullet bar HTML: satu baris per item, isi relatif terhadap `max`, garis putus-putus opsional di `mark`. */
export type BulletRow = { key: string; label: string; value: number; text: string; sub?: string; color: string; href?: string };
export function Bullets({ rows, max, mark, labelWidth = 40, label }: { rows: BulletRow[]; max: number; mark?: number; labelWidth?: number; label: string }) {
  return <ul className="exec-bullets" aria-label={label} style={{ ["--exec-label" as string]: `${labelWidth}px` }}>
    {rows.map(r => { const body = <>
      <strong>{r.label}{r.sub && <small className="table-sub">{r.sub}</small>}</strong>
      <span className="exec-bullet-track" aria-hidden="true"><i style={{ width: `${max ? Math.min(100, (r.value / max) * 100) : 0}%`, background: r.color }} />{mark !== undefined && <b style={{ left: `${(mark / max) * 100}%` }} />}</span>
      <span className="exec-bullet-value">{r.text}</span>
    </>; return <li key={r.key}>{r.href ? <a href={r.href} className="exec-bullet-link">{body}</a> : body}</li>; })}
  </ul>;
}

export function MachineCard({ states, total, running, downtime }: { states: StateSlice[]; total: number; running: number; downtime: { cause: string; minutes: number }[] }) {
  const shown = states.filter(s => s.count);
  return <Card className="exec-card">
    <SectionTitle title="Penggunaan mesin" subtitle="Kondisi lini filling saat ini dan downtime shift." action={<Link className="text-link" href="/kondisi-alat">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
    <div className="exec-machine">
      <figure className="exec-donut" aria-label={`${running} dari ${total} lini jalan. ${shown.map(s => `${s.label} ${s.count}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={shown} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="96%" paddingAngle={2} cornerRadius={4} {...GAP}>
              {shown.map(s => <Cell key={s.key} fill={s.color} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="lc-tooltip"><span>{String(payload[0].name)}</span><strong>{(payload[0].payload as StateSlice).lines.join(", ")}</strong></div> : null} />
          </PieChart>
        </ResponsiveContainer>
        <figcaption><strong><CountUp to={running} duration={1} /><small>/{total}</small></strong><span>lini jalan</span></figcaption>
      </figure>
      <Legend items={shown.map(s => ({ label: s.label, color: s.color, value: String(s.count) }))} />
    </div>
    <div className="exec-plot">
      <p className="exec-plot-title">Downtime (menit)</p>
      {downtime.length
        ? <ResponsiveContainer width="100%" height={downtime.length * 34 + 8}>
          <BarChart data={downtime} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="cause" width={96} tickLine={false} axisLine={false} tick={AXIS} />
            <Tooltip content={p => <Tip {...p} unit="menit" />} cursor={{ fill: "var(--color-surface-muted)", opacity: 0.5 }} />
            <Bar dataKey="minutes" name="Downtime" fill="var(--color-status-warn)" radius={[0, 4, 4, 0]} barSize={14} label={{ position: "right", fontSize: 11, fill: "var(--color-on-surface)" }} />
          </BarChart>
        </ResponsiveContainer>
        : <p className="small muted">Belum ada downtime di shift ini.</p>}
    </div>
  </Card>;
}

/* ---------- Pencapaian target: laju per lini terhadap garis 100% ---------- */
export type PaceRow = { line: string; pace: number; state: string; running: boolean; product: string };
export function TargetCard({ rows }: { rows: PaceRow[] }) {
  const data = rows.map(r => ({ ...r, value: r.running ? r.pace : 0, text: r.running ? `${r.pace}%` : r.state }));
  const color = (r: PaceRow) => !r.running ? "var(--color-neutral-fill)" : r.pace < 90 ? "var(--color-status-warn)" : "var(--color-primary)";
  return <Card className="exec-card">
    <SectionTitle title="Pencapaian target per lini" subtitle="Laju mesin terhadap target. Garis putus-putus = 100%." action={<Link className="text-link" href="/penjadwalan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
    <ul className="exec-bullets" aria-label="Laju per lini terhadap target">
      {data.map(r => <li key={r.line} title={`${r.line}, ${r.product}`}>
        <strong>{r.line}</strong>
        <span className="exec-bullet-track" aria-hidden="true"><i style={{ width: `${Math.min(100, (r.value / 110) * 100)}%`, background: color(r) }} /><b style={{ left: `${(100 / 110) * 100}%` }} /></span>
        <span className={r.running ? "exec-bullet-value" : "exec-bullet-value muted"}>{r.text}</span>
      </li>)}
    </ul>
    <Legend items={[{ label: "Sesuai laju (90% ke atas)", color: "var(--color-primary)" }, { label: "Di bawah 90%", color: "var(--color-status-warn)" }, { label: "Tidak jalan", color: "var(--color-neutral-fill)" }]} />
  </Card>;
}

/* ---------- Jadwal: satu bar bertumpuk status order ---------- */
export type OrderSeg = { key: string; label: string; count: number; color: string };
export function ScheduleCard({ segs, total, plan }: { segs: OrderSeg[]; total: number; plan: { ok: boolean; text: string } }) {
  return <Card className="exec-card">
    <SectionTitle title="Jadwal shift" subtitle={`${total} order produksi.`} action={<Link className="text-link" href="/rencana">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
    <p className={`exec-plan ${plan.ok ? "ok" : "crit"}`}>{plan.text}</p>
    <div className="exec-stack" role="img" aria-label={segs.map(s => `${s.label} ${s.count}`).join(", ")}>
      {segs.filter(s => s.count).map(s => <span key={s.key} style={{ flexGrow: s.count, background: s.color }} title={`${s.label}: ${s.count}`} />)}
    </div>
    <ul className="exec-figures">{segs.map(s => <li key={s.key}><i style={{ background: s.color }} aria-hidden="true" /><strong>{s.count}</strong><span>{s.label}</span></li>)}</ul>
  </Card>;
}
