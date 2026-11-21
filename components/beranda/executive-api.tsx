"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, CalendarRange, ChevronRight, Droplets, Factory, TriangleAlert, type LucideIcon } from "lucide-react";
import { useResource } from "@/lib/api/resource";
import { FULFILMENT_LABEL, FULFILMENT_TONE, fmtWaktu, pctText, type BeExecDashboard } from "@/lib/api/contract";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";
import type { Tone } from "@/mock/types";
import { Bullets, ExecKpis, Legend, Tip, type ExecKpi } from "./executive";

const AXIS = { fontSize: 11, fill: "var(--color-on-surface-muted)" };

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
const jam = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
type Kpi = { icon: LucideIcon; label: string; value: string; unit: string; note: string; tone: Tone; href: string };

/**
 * Executive Dashboard mode API: semua angka dari GET /api/v1/dashboard/executive.
 * KPI lokal versi lama (persen kecukupan pasokan, jumlah lini jalan, laju terhadap target,
 * status persetujuan rencana, dan constraint solver) tidak punya padanan di Backend,
 * jadi tidak ditampilkan di mode ini supaya tidak tercampur dengan angka server.
 */
export function ExecutiveKpis() {
  const res = useResource<BeExecDashboard>("/dashboard/executive");
  if (!res.data) {
    return <div className="schedule-stats planner-kpis">
      <Card><span className="small muted">{res.error ? `Gagal memuat dashboard eksekutif: ${res.error.message}` : "Memuat dashboard eksekutif…"}</span></Card>
    </div>;
  }
  const d = res.data;
  const util = d.machine_utilization ?? [];
  const avgPct = util.length ? util.reduce((s, u) => s + u.pct, 0) / util.length : null;
  const downTotal = util.reduce((s, u) => s + u.downtime_hours, 0);
  const po = d.po_summary;
  const kpis: Kpi[] = [
    { icon: Droplets, label: "Pasokan susu diterima", value: fmt(d.milk_received_l.total), unit: "liter", note: `Dari ${d.milk_received_l.by_farm.length} farm, kedatangan RT berstatus Sudah Tiba`, tone: "neutral", href: "/pasokan" },
    { icon: Factory, label: "Penggunaan mesin", value: avgPct === null ? "-" : `${jam(avgPct)}%`, unit: avgPct === null ? "" : "rata-rata per mesin", note: util.length ? `${util.length} mesin terhitung, downtime total ${jam(downTotal)} jam` : "Belum ada jadwal untuk dihitung", tone: "neutral", href: "/kondisi-alat" },
    { icon: CalendarRange, label: "Jadwal harian", value: d.daily_schedule ? `Versi ${d.daily_schedule.version}` : "Belum ada", unit: d.daily_schedule ? d.daily_schedule.schedule_id : "", note: d.daily_schedule ? `${d.daily_schedule.runs_count} run, jendela ${fmtWaktu(d.daily_schedule.window.start)} sampai ${fmtWaktu(d.daily_schedule.window.end)}` : "Generate jadwal dulu di Penjadwalan", tone: d.daily_schedule ? "neutral" : "warn", href: "/penjadwalan" },
    { icon: TriangleAlert, label: "Status PO", value: po ? String(po.fulfilled + po.at_risk + po.late + po.on_track) : "-", unit: po ? "PO" : "", note: po ? `${po.fulfilled} terpenuhi, ${po.on_track} sesuai rencana, ${po.at_risk} berisiko, ${po.late} terlambat` : "Belum ada jadwal tergenerate", tone: po && po.late ? "crit" : po && po.at_risk ? "warn" : "neutral", href: "/penjadwalan" },
  ];
  return <div className="schedule-stats planner-kpis">{kpis.map(k => <Link key={k.label} href={k.href} className={`card planner-kpi ${k.tone}`}><span className="planner-kpi-label"><Icon icon={k.icon} size={16} />{k.label}<Icon icon={ArrowUpRight} size={15} className="planner-kpi-go" /></span><strong>{k.value}{k.unit && <small> {k.unit}</small>}</strong><span className="small muted">{k.note}</span></Link>)}</div>;
}

/** Rincian di bawah KPI: target harian, pasokan per farm, utilisasi per mesin, dan fulfilment PO. */
export function ExecutiveDetails() {
  const res = useResource<BeExecDashboard>("/dashboard/executive");
  if (!res.data) return null;
  const d = res.data;
  return <>
    <Card className="home-menus"><SectionTitle title="Target dan jadwal harian" subtitle="Target per tanggal dari jadwal tergenerate terbaru di Backend." />
      {d.daily_schedule
        ? <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>Tanggal</th><th className="numeric">Jatuh tempo</th><th className="numeric">Terjadwal</th><th className="numeric">Terjadwal dari target</th></tr></thead>
          <tbody>{d.daily_schedule.targets.map(t => <tr key={t.date}>
            <td><strong>{t.date}</strong></td>
            <td className="numeric">{fmt(t.due_liter)} L</td>
            <td className="numeric">{fmt(t.scheduled_liter)} L</td>
            <td className="numeric">{t.due_liter ? `${Math.round(t.scheduled_liter / t.due_liter * 100)}%` : "-"}</td>
          </tr>)}
          {!d.daily_schedule.targets.length && <tr><td colSpan={4} className="muted">Tidak ada target pada jadwal ini.</td></tr>}
          </tbody></table></div>
        : <p className="muted">Belum ada jadwal tergenerate, jadi target harian belum tersedia. Generate jadwal di halaman Penjadwalan.</p>}
    </Card>

    <Card className="home-menus"><SectionTitle title="Pasokan per farm dan penggunaan mesin" subtitle="Susu diterima hanya dari kedatangan RT berstatus Sudah Tiba. Utilisasi dihitung Backend dari jadwal terbaru dan jendela downtime." />
      <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Farm</th><th className="numeric">Susu diterima</th></tr></thead>
        <tbody>{d.milk_received_l.by_farm.map(f => <tr key={f.farm_id}>
          <td><strong>{f.farm_name}</strong><span className="table-sub">{f.farm_id}</span></td>
          <td className="numeric">{fmt(f.total_l)} L</td>
        </tr>)}
        {!d.milk_received_l.by_farm.length && <tr><td colSpan={2} className="muted">Belum ada kedatangan RT berstatus Sudah Tiba.</td></tr>}
        </tbody></table></div>
      <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Mesin filling</th><th className="numeric">Jam pakai</th><th className="numeric">Jam downtime</th><th className="numeric">Utilisasi</th></tr></thead>
        <tbody>{(d.machine_utilization ?? []).map(u => <tr key={u.fm_id}>
          <td><strong>{u.fm_id}</strong></td>
          <td className="numeric">{jam(u.used_hours)} jam</td>
          <td className="numeric">{jam(u.downtime_hours)} jam</td>
          <td className="numeric">{jam(u.pct)}%</td>
        </tr>)}
        {!(d.machine_utilization ?? []).length && <tr><td colSpan={4} className="muted">Belum ada jadwal, utilisasi belum bisa dihitung.</td></tr>}
        </tbody></table></div>
    </Card>

    {d.po_summary && <Card className="home-menus"><SectionTitle title="Rincian status PO" subtitle="Fulfilment per PO dari jadwal terbaru di Backend." />
      <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>PO</th><th>Status</th><th className="numeric">Terpenuhi</th><th>Rencana selesai</th><th>Akar masalah</th></tr></thead>
        <tbody>{d.po_summary.fulfilment.map(f => <tr key={f.po_id}>
          <td><strong className="mono">{f.po_id}</strong></td>
          <td><Badge tone={FULFILMENT_TONE[f.status] ?? "neutral"}>{FULFILMENT_LABEL[f.status] ?? f.status}</Badge></td>
          <td className="numeric">{pctText(f.fulfilled_pct)}</td>
          <td>{fmtWaktu(f.planned_completion)}</td>
          <td>{f.root_causes?.length ? f.root_causes.join(", ") : <span className="small muted">Tidak ada</span>}</td>
        </tr>)}
        {!d.po_summary.fulfilment.length && <tr><td colSpan={5} className="muted">Tidak ada data fulfilment.</td></tr>}
        </tbody></table></div>
    </Card>}
  </>;
}

/**
 * Executive Dashboard mode API sebagai infografis (masukan dosen: pimpinan membaca grafik, bukan tabel).
 * Semua angka dari GET /dashboard/executive. Bagian yang datanya null di Backend tampil sebagai keadaan kosong, tidak diisi 0.
 */
export function ExecutiveDashboardApi({ attention }: { attention: ReactNode }) {
  const res = useResource<BeExecDashboard>("/dashboard/executive");
  if (!res.data) {
    return <Card className="exec-card"><p className="muted" role={res.error ? "alert" : "status"}>{res.error ? `Gagal memuat dashboard eksekutif: ${res.error.message}` : "Memuat dashboard eksekutif…"}</p></Card>;
  }
  const d = res.data;
  const label = (d as { label_data?: string }).label_data;
  const util = d.machine_utilization ?? [];
  const avgPct = util.length ? util.reduce((s, u) => s + u.pct, 0) / util.length : null;
  const downTotal = util.reduce((s, u) => s + u.downtime_hours, 0);
  const targets = d.daily_schedule?.targets ?? [];
  const due = targets.reduce((s, t) => s + t.due_liter, 0), scheduled = targets.reduce((s, t) => s + t.scheduled_liter, 0);
  const coverage = d.daily_schedule && due ? Math.round(scheduled / due * 100) : null;
  const po = d.po_summary;
  const poTotal = po ? po.fulfilled + po.on_track + po.at_risk + po.late : 0;
  const farms = [...d.milk_received_l.by_farm].sort((a, b) => b.total_l - a.total_l);
  const farmMax = Math.max(0, ...farms.map(f => f.total_l));

  const kpis: ExecKpi[] = [
    { icon: Droplets, label: "Susu diterima", value: d.milk_received_l.total, of: "liter", note: `Dari ${farms.length} farm, RT berstatus Sudah Tiba`, tone: "neutral", href: "/pasokan" },
    { icon: Factory, label: "Utilisasi mesin", value: avgPct === null ? null : Math.round(avgPct), suffix: "%", progress: avgPct ?? undefined, note: util.length ? `Rata-rata ${util.length} mesin, downtime ${jam(downTotal)} jam` : "Belum ada jadwal untuk dihitung", tone: avgPct === null ? "warn" : "neutral", href: "/kondisi-alat" },
    { icon: CalendarRange, label: "Terjadwal dari target", value: coverage, suffix: "%", progress: coverage ?? undefined, note: d.daily_schedule ? `Jadwal versi ${d.daily_schedule.version}, ${d.daily_schedule.runs_count} run` : "Generate jadwal di Penjadwalan", tone: coverage === null || coverage < 100 ? "warn" : "ok", href: "/penjadwalan" },
    { icon: TriangleAlert, label: "PO terpenuhi", value: po ? po.fulfilled : null, of: po ? `dari ${poTotal} PO` : undefined, progress: po && poTotal ? po.fulfilled / poTotal * 100 : undefined, note: po ? `${po.at_risk} berisiko, ${po.late} terlambat` : "Belum ada jadwal tergenerate", tone: po?.late ? "crit" : po?.at_risk ? "warn" : po ? "ok" : "warn", href: "/penjadwalan" },
  ];
  const poSegs = po ? [
    { key: "fulfilled", label: "Terpenuhi", count: po.fulfilled, color: "var(--color-primary)" },
    { key: "on_track", label: "Sesuai rencana", count: po.on_track, color: "#6FBF8B" },
    { key: "at_risk", label: "Berisiko", count: po.at_risk, color: "#B7791F" },
    { key: "late", label: "Terlambat", count: po.late, color: "var(--color-status-crit)" },
  ] : [];
  const poShown = poSegs.filter(s => s.count);

  return <>
    {label && <p className="exec-label">Label data <Badge tone="warn">{label}</Badge></p>}
    <ExecKpis items={kpis} />
    <div className="exec-grid">
      <Card className="exec-card">
        <SectionTitle title="Target dan jadwal harian" subtitle="Liter jatuh tempo dibanding liter yang sudah terjadwal, per tanggal." action={<Link className="text-link" href="/penjadwalan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
        {d.daily_schedule && targets.length
          ? <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={targets.map(t => ({ ...t, label: t.date }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={AXIS} />
                <YAxis tickLine={false} axisLine={false} width={56} tick={AXIS} tickFormatter={v => fmt(Number(v))} />
                <Tooltip content={p => <Tip {...p} unit="L" />} cursor={{ fill: "var(--color-surface-muted)", opacity: 0.5 }} />
                <Bar dataKey="due_liter" name="Jatuh tempo" fill="var(--color-neutral-fill)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="scheduled_liter" name="Terjadwal" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
            <Legend items={[{ label: "Jatuh tempo", color: "var(--color-neutral-fill)" }, { label: "Terjadwal", color: "var(--color-primary)" }]} />
          </>
          : <p className="muted">{d.daily_schedule ? "Jadwal terbaru tidak punya target per tanggal." : "Belum ada jadwal tergenerate, jadi target harian belum tersedia. Generate jadwal di halaman Penjadwalan."}</p>}
      </Card>

      <Card className="exec-card">
        <SectionTitle title="Status PO" subtitle="Fulfilment PO dari jadwal terbaru." action={<Link className="text-link" href="/penjadwalan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
        {po && poTotal
          ? <div className="exec-machine">
            <figure className="exec-donut" aria-label={poSegs.map(s => `${s.label} ${s.count}`).join(", ")}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={poShown} dataKey="count" nameKey="label" innerRadius="64%" outerRadius="96%" paddingAngle={2} cornerRadius={4} stroke="var(--color-surface)" strokeWidth={2}>
                    {poShown.map(s => <Cell key={s.key} fill={s.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="lc-tooltip"><span>{String(payload[0].name)}</span><strong>{String(payload[0].value)} PO</strong></div> : null} />
                </PieChart>
              </ResponsiveContainer>
              <figcaption><strong>{poTotal}</strong><span>PO</span></figcaption>
            </figure>
            <Legend items={poSegs.map(s => ({ label: s.label, color: s.color, value: String(s.count) }))} />
          </div>
          : <p className="muted">{po ? "Belum ada PO di jadwal terbaru." : "Belum ada jadwal tergenerate, jadi status PO belum tersedia."}</p>}
      </Card>

      <Card className="exec-card">
        <SectionTitle title="Susu diterima per farm" subtitle="Hanya kedatangan RT berstatus Sudah Tiba. Klik farm untuk melihat jadwal kedatangan." action={<Link className="text-link" href="/kedatangan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
        {farms.length
          ? <Bullets label="Susu diterima per farm" labelWidth={128} max={farmMax} rows={farms.map(f => ({ key: f.farm_id, label: f.farm_name, value: f.total_l, text: `${fmt(f.total_l)} L`, color: "var(--color-primary)", href: "/kedatangan" }))} />
          : <p className="muted">Belum ada kedatangan RT berstatus Sudah Tiba.</p>}
      </Card>

      <Card className="exec-card">
        <SectionTitle title="Utilisasi per mesin filling" subtitle="Persen dari Backend, dihitung dari jadwal terbaru dan jendela downtime. Klik untuk membuka Kondisi Alat." action={<Link className="text-link" href="/kondisi-alat">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
        {util.length
          ? <Bullets label="Utilisasi per mesin" labelWidth={72} max={100} rows={util.map(u => ({ key: u.fm_id, label: u.fm_id, sub: `${jam(u.downtime_hours)} jam down`, value: u.pct, text: `${jam(u.pct)}%`, color: u.pct < 50 ? "#B7791F" : "var(--color-primary)", href: "/kondisi-alat" }))} />
          : <p className="muted">Belum ada jadwal, utilisasi belum bisa dihitung.</p>}
      </Card>
    </div>
    {attention}
  </>;
}
