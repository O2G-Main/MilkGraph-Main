"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, CalendarRange, ChevronRight, ClipboardList, Coins, Database, Droplets, Factory, FlaskConical, Hourglass, PackageX, ShieldAlert, ShieldCheck, Timer, TriangleAlert, Truck, Users, Wrench } from "lucide-react";
import { useResource } from "@/lib/api/resource";
import type { ApiError } from "@/lib/api/client";
import { DOWNTIME_TYPE_LABEL, FULFILMENT_LABEL, fmtWaktu, type BeArrival, type BeDowntimeEvent, type BeExecDashboard, type BePo, type BeRolesResponse, type BeSchedule, type BeTransfer } from "@/lib/api/contract";
import type { Hold } from "@/lib/demo";
import type { RoleId } from "@/lib/roles";
import type { DataSource, LabResult } from "@/mock/ops";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";
import { Bullets, C, Donut, ExecKpis, type ExecKpi } from "./executive";

/**
 * Beranda mode API per role, dalam bentuk infografis (masukan dosen: angka besar dan grafik, kalimat seperlunya).
 * Setiap angka diambil dari endpoint Backend milik urusan role itu; FE hanya menjumlah atau mengelompokkan record server.
 * Data yang belum ada di Backend tampil sebagai keadaan kosong, tidak diisi angka karangan.
 */

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
const dec = (n: number, d = 1) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d }).format(n);
const status = (e: Error | null) => (e as ApiError | null)?.status;
const hoursBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000);
const countBy = <T,>(rows: T[], key: (r: T) => string) => rows.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
/** Label data dari record pertama yang membawanya (mis. "simulasi"); dirender apa adanya. */
const labelOf = (...lists: (unknown[] | null | undefined)[]) => lists.flatMap(l => l ?? []).map(x => (x as { label_data?: string })?.label_data).find(Boolean);

/** Satu panel infografis: judul, subjudul satu kalimat, tautan ke halaman detail, lalu isi atau keadaan muat/gagal. */
function Panel({ title, subtitle, href, loading, error, children }: { title: string; subtitle: string; href: string; loading?: boolean; error?: Error | null; children: ReactNode }) {
  return <Card className="exec-card">
    <SectionTitle title={title} subtitle={subtitle} action={<Link className="text-link" href={href}>Detail<Icon icon={ChevronRight} size={14} /></Link>} />
    {error ? <p className="small crit-text" role="alert">Gagal memuat: {error.message}</p> : loading ? <p className="small muted" role="status">Memuat data server…</p> : children}
  </Card>;
}
const Empty = ({ children }: { children: ReactNode }) => <p className="muted">{children}</p>;

function Layout({ label, kpis, children, attention }: { label?: string; kpis: ExecKpi[]; children: ReactNode; attention: ReactNode }) {
  return <>
    {label && <p className="exec-label">Label data <Badge tone="warn">{label}</Badge></p>}
    <ExecKpis items={kpis} />
    <div className="exec-grid">{children}</div>
    {attention}
  </>;
}

/* ---------- Superadmin: kesehatan sistem, role, aktivitas, biaya ---------- */
interface Costs { llm?: { calls: number; est_cost_usd: number; label?: string }; llm_aktual?: { calls: number; label?: string }; items_total_by_currency?: Record<string, number>; items?: unknown[] }
interface AuditRow { id: number | string; kind: string; title: string }
const AUDIT_LABEL: Record<string, string> = { rencana: "Rencana", lab: "Lab", hold: "Hold", produksi: "Produksi", penerimaan: "Penerimaan", akses: "Akses", pengaturan: "Pengaturan" };

function SuperadminApi({ attention }: { attention: ReactNode }) {
  const src = useResource<DataSource[]>("/data-sources");
  const roles = useResource<BeRolesResponse>("/roles");
  const audit = useResource<AuditRow[]>("/audit");
  const costs = useResource<Costs>("/costs");
  const sources = src.data ?? [];
  const connected = sources.filter(s => s.status === "terhubung").length;
  const roleRows = Object.entries(roles.data?.roles ?? {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => b.permissions.length - a.permissions.length);
  const permTotal = Object.keys(roles.data?.permissions ?? {}).length;
  const kinds = Object.entries(countBy(audit.data ?? [], a => a.kind)).sort((a, b) => b[1] - a[1]);
  const llm = costs.data?.llm;
  const statusColor = (s: string) => s === "terhubung" ? C.ok : s.includes("putus") || s.includes("gagal") ? C.crit : C.warn;
  const srcSegs = Object.entries(countBy(sources, s => s.status)).map(([k, n]) => ({ key: k, label: k[0].toUpperCase() + k.slice(1), count: n, color: statusColor(k) }));

  const kpis: ExecKpi[] = [
    { icon: Database, label: "Sumber data terhubung", value: src.data ? connected : null, of: src.data ? `dari ${sources.length}` : undefined, progress: sources.length ? connected / sources.length * 100 : undefined, note: src.data ? `${sources.length - connected} belum terhubung` : "Memuat dari server", tone: src.data && connected < sources.length ? "warn" : "ok", href: "/sumber-data" },
    { icon: Users, label: "Role terdaftar", value: roles.data ? roleRows.length : null, of: "role", note: roles.data ? `${roleRows.filter(r => !r.builtin).length} role buatan, ${permTotal} hak akses` : "Memuat dari server", tone: "neutral", href: "/role-akses" },
    { icon: Activity, label: "Aktivitas tercatat", value: audit.data ? audit.data.length : null, of: "kejadian", note: kinds.length ? `Terbanyak: ${AUDIT_LABEL[kinds[0][0]] ?? kinds[0][0]}` : "Belum ada aktivitas", tone: "neutral", href: "/persetujuan" },
    { icon: Coins, label: "Biaya LLM", value: llm ? llm.est_cost_usd : null, decimals: 4, suffix: " USD", note: llm ? `${llm.calls} panggilan, ${llm.label ?? "estimasi"}` : "Belum ada data biaya", tone: "neutral", href: "/sumber-data" },
  ];
  return <Layout kpis={kpis} attention={attention} label={sources.some(s => (s as { simulation?: boolean }).simulation) ? "simulasi" : undefined}>
    <Panel title="Status sumber data" subtitle="Koneksi sistem pabrik yang memasok data MilkGraph." href="/sumber-data" loading={src.loading && !src.data} error={src.error}>
      {sources.length ? <Donut segs={srcSegs} unit="sumber" caption="sumber data" /> : <Empty>Belum ada sumber data terdaftar.</Empty>}
    </Panel>
    <Panel title="Hak akses per role" subtitle={`Jumlah hak akses dari ${permTotal} yang tersedia.`} href="/role-akses" loading={roles.loading && !roles.data} error={roles.error}>
      {roleRows.length ? <Bullets label="Hak akses per role" labelWidth={150} max={permTotal || 1} rows={roleRows.map(r => ({ key: r.id, label: r.label, sub: r.builtin ? undefined : "Role buatan", value: r.permissions.length, text: `${r.permissions.length} akses`, color: r.builtin ? C.ok : C.soft, href: "/role-akses" }))} /> : <Empty>Belum ada role.</Empty>}
    </Panel>
    <Panel title="Aktivitas per jenis" subtitle="Dari log audit aplikasi: siapa melakukan apa." href="/persetujuan" loading={audit.loading && !audit.data} error={audit.error}>
      {kinds.length ? <Bullets label="Aktivitas per jenis" labelWidth={110} max={kinds[0][1]} rows={kinds.map(([k, n]) => ({ key: k, label: AUDIT_LABEL[k] ?? k, value: n, text: `${n} kejadian`, color: C.ok }))} /> : <Empty>Belum ada aktivitas tercatat.</Empty>}
    </Panel>
    <Panel title="Biaya layanan" subtitle="Biaya AI dan item operasional dari Backend." href="/sumber-data" loading={costs.loading && !costs.data} error={costs.error}>
      {costs.data ? <ul className="exec-figures exec-figures-2">
        <li><i style={{ background: C.ok }} aria-hidden="true" /><strong>{llm ? `${dec(llm.est_cost_usd, 4)} USD` : "-"}</strong><span>Biaya LLM <Badge tone="warn">{llm?.label ?? "estimasi"}</Badge></span></li>
        <li><i style={{ background: C.soft }} aria-hidden="true" /><strong>{llm?.calls ?? 0}</strong><span>Panggilan AI tercatat</span></li>
        <li><i style={{ background: C.gray }} aria-hidden="true" /><strong>{costs.data.llm_aktual?.calls ?? 0}</strong><span>Panggilan dengan biaya aktual</span></li>
        <li><i style={{ background: C.warn }} aria-hidden="true" /><strong>{costs.data.items?.length ?? 0}</strong><span>Item biaya operasional</span></li>
      </ul> : <Empty>Belum ada data biaya.</Empty>}
    </Panel>
  </Layout>;
}

/* ---------- Planner/PPIC: PO, jadwal, target ---------- */
function PlannerApi({ attention }: { attention: ReactNode }) {
  const pos = useResource<BePo[]>("/pos");
  const sch = useResource<BeSchedule>("/schedules/latest");
  const exec = useResource<BeExecDashboard>("/dashboard/executive");
  const noSchedule = status(sch.error) === 404;
  const schedule = noSchedule ? null : sch.data;
  const poRows = [...(pos.data ?? [])].sort((a, b) => a.due_datetime.localeCompare(b.due_datetime)).map(p => ({ ...p, liter: p.lines.reduce((s, l) => s + l.qty_liter, 0) }));
  const poLiter = poRows.reduce((s, p) => s + p.liter, 0);
  const ful = schedule?.fulfilment ?? [];
  const risky = ful.filter(f => f.status === "AT_RISK" || f.status === "LATE").length;
  const targets = exec.data?.daily_schedule?.targets ?? [];
  const due = targets.reduce((s, t) => s + t.due_liter, 0), scheduled = targets.reduce((s, t) => s + t.scheduled_liter, 0);
  const kpis: ExecKpi[] = [
    { icon: ClipboardList, label: "PO aktif", value: pos.data ? poRows.length : null, of: "PO", note: pos.data ? `Total ${fmt(poLiter)} liter` : "Memuat dari server", tone: "neutral", href: "/penjadwalan" },
    { icon: CalendarRange, label: "Jadwal terbaru", value: schedule ? schedule.version : null, of: schedule ? `versi, ${schedule.runs.length} run` : undefined, note: schedule ? `Dibuat ${fmtWaktu(schedule.generated_at)}` : "Generate jadwal di Penjadwalan", tone: schedule ? "ok" : "warn", href: "/penjadwalan" },
    { icon: TriangleAlert, label: "PO berisiko atau terlambat", value: schedule ? risky : null, of: schedule ? `dari ${ful.length}` : undefined, progress: ful.length ? risky / ful.length * 100 : undefined, note: schedule ? `${schedule.warnings.length} peringatan jadwal` : "Belum ada jadwal", tone: risky ? "crit" : schedule ? "ok" : "warn", href: "/penjadwalan" },
    { icon: Droplets, label: "Terjadwal dari target", value: due ? Math.round(scheduled / due * 100) : null, suffix: "%", progress: due ? scheduled / due * 100 : undefined, note: due ? `${fmt(scheduled)} dari ${fmt(due)} L` : "Belum ada target harian", tone: due && scheduled < due ? "warn" : due ? "ok" : "warn", href: "/penjadwalan" },
  ];
  const fulSegs = ["FULFILLED", "ON_TRACK", "AT_RISK", "LATE"].map((k, i) => ({ key: k, label: FULFILMENT_LABEL[k], count: ful.filter(f => f.status === k).length, color: [C.ok, C.soft, C.warn, C.crit][i] }));
  const warnTypes = Object.entries(countBy(schedule?.warnings ?? [], w => w.type));
  const WARN_LABEL: Record<string, string> = { HOLDING_TIME: "Holding time", TANK_STOCK_SHORT: "Stok tangki kurang" };
  return <Layout kpis={kpis} attention={attention} label={labelOf(pos.data)}>
    <Panel title="Liter per PO" subtitle="Urut dari jatuh tempo terdekat." href="/penjadwalan" loading={pos.loading && !pos.data} error={pos.error}>
      {poRows.length ? <Bullets label="Liter per PO" labelWidth={128} max={Math.max(...poRows.map(p => p.liter))} rows={poRows.map(p => ({ key: p.po_id, label: p.po_id, sub: `Jatuh tempo ${fmtWaktu(p.due_datetime)}`, value: p.liter, text: `${fmt(p.liter)} L`, color: p.priority === 1 ? C.ok : C.soft, href: "/penjadwalan" }))} /> : <Empty>Belum ada PO. Tambahkan atau import PO di Penjadwalan.</Empty>}
    </Panel>
    <Panel title="Fulfilment PO" subtitle="Status pemenuhan PO pada jadwal terbaru." href="/penjadwalan" loading={sch.loading && !sch.data && !noSchedule} error={noSchedule ? null : sch.error}>
      {schedule && ful.length ? <Donut segs={fulSegs} unit="PO" /> : <Empty>Belum ada jadwal tergenerate, jadi fulfilment PO belum tersedia.</Empty>}
    </Panel>
    <Panel title="Target dan terjadwal per tanggal" subtitle="Liter jatuh tempo dibanding liter terjadwal." href="/penjadwalan" loading={exec.loading && !exec.data} error={exec.error}>
      {targets.length ? <Bullets label="Terjadwal per tanggal" labelWidth={96} max={100} mark={100} rows={targets.map(t => { const p = t.due_liter ? t.scheduled_liter / t.due_liter * 100 : 0; return { key: t.date, label: t.date, sub: `${fmt(t.scheduled_liter)} dari ${fmt(t.due_liter)} L`, value: Math.min(p, 100), text: `${Math.round(p)}%`, color: p < 100 ? C.warn : C.ok }; })} /> : <Empty>Belum ada target harian dari jadwal.</Empty>}
    </Panel>
    <Panel title="Peringatan jadwal" subtitle="Jenis peringatan pada jadwal terbaru." href="/penjadwalan" loading={sch.loading && !sch.data && !noSchedule} error={noSchedule ? null : sch.error}>
      {warnTypes.length ? <Bullets label="Peringatan jadwal" labelWidth={140} max={Math.max(...warnTypes.map(w => w[1]))} rows={warnTypes.map(([k, n]) => ({ key: k, label: WARN_LABEL[k] ?? k, value: n, text: `${n} peringatan`, color: C.warn }))} /> : <Empty>{schedule ? "Tidak ada peringatan pada jadwal terbaru." : "Belum ada jadwal tergenerate."}</Empty>}
    </Panel>
  </Layout>;
}

/* ---------- Receiving: kedatangan RT, keterlambatan, volume ---------- */
const ARR_STATUS = [
  { key: "Dijadwalkan", color: C.gray }, { key: "Dalam Perjalanan", color: C.soft }, { key: "Sudah Tiba", color: C.ok }, { key: "Dibatalkan", color: C.crit },
] as const;
function ReceivingApi({ attention }: { attention: ReactNode }) {
  const arr = useResource<BeArrival[]>("/supply/rt-arrivals");
  const trf = useResource<BeTransfer[]>("/trace/transfers");
  const rows = arr.data ?? [];
  const live = rows.filter(a => a.status !== "Dibatalkan");
  const late = live.filter(a => a.late_minutes > 0).sort((a, b) => b.late_minutes - a.late_minutes);
  const onRoad = rows.filter(a => a.status === "Dalam Perjalanan");
  const arrivedL = rows.filter(a => a.status === "Sudah Tiba").reduce((s, a) => s + a.volume_l, 0);
  const farms = Object.values(live.reduce<Record<string, { name: string; l: number }>>((m, a) => { (m[a.farm_id] ??= { name: a.farm_name, l: 0 }).l += a.volume_l; return m; }, {})).sort((a, b) => b.l - a.l);
  const transfers = trf.data ?? [];
  const selisih = transfers.reduce((s, t) => s + t.selisih_l, 0);
  const kpis: ExecKpi[] = [
    { icon: Truck, label: "Dalam perjalanan", value: arr.data ? onRoad.length : null, of: "RT", note: arr.data ? `${rows.filter(a => a.status === "Dijadwalkan").length} masih dijadwalkan` : "Memuat dari server", tone: "neutral", href: "/kedatangan" },
    { icon: Hourglass, label: "Terlambat dari target", value: arr.data ? late.length : null, of: `dari ${live.length} RT`, progress: live.length ? late.length / live.length * 100 : undefined, note: late.length ? `Terlama ${late[0].rt_id}, ${late[0].late_minutes} menit` : "Semua tepat waktu", tone: late.some(a => a.late_minutes >= 30) ? "crit" : late.length ? "warn" : "ok", href: "/kedatangan" },
    { icon: Droplets, label: "Susu sudah tiba", value: arr.data ? arrivedL : null, of: "liter", note: `${rows.filter(a => a.status === "Sudah Tiba").length} RT berstatus Sudah Tiba`, tone: "neutral", href: "/kedatangan" },
    { icon: Timer, label: "Selisih transfer", value: trf.data ? selisih : null, of: "liter", note: trf.data ? `${transfers.length} transfer tercatat` : "Memuat dari server", tone: "neutral", href: "/transfer" },
  ];
  return <Layout kpis={kpis} attention={attention} label={labelOf(arr.data)}>
    <Panel title="Status kedatangan RT" subtitle="Semua RT di jadwal kedatangan." href="/kedatangan" loading={arr.loading && !arr.data} error={arr.error}>
      {rows.length ? <Donut segs={ARR_STATUS.map(s => ({ key: s.key, label: s.key, count: rows.filter(a => a.status === s.key).length, color: s.color }))} unit="RT" /> : <Empty>Belum ada jadwal kedatangan RT.</Empty>}
    </Panel>
    <Panel title="Keterlambatan per RT" subtitle="Menit terlambat dari target tiba, dihitung server." href="/kedatangan" loading={arr.loading && !arr.data} error={arr.error}>
      {late.length ? <Bullets label="Keterlambatan per RT" labelWidth={64} max={late[0].late_minutes} rows={late.map(a => ({ key: a.id, label: a.rt_id, sub: a.farm_name, value: a.late_minutes, text: `${a.late_minutes} menit`, color: a.late_minutes >= 30 ? C.crit : C.warn, href: "/kedatangan" }))} /> : <Empty>{rows.length ? "Semua RT tepat waktu atau lebih awal." : "Belum ada jadwal kedatangan RT."}</Empty>}
    </Panel>
    <Panel title="Volume per farm" subtitle="Volume RT yang dijadwalkan dan tiba, per farm." href="/kedatangan" loading={arr.loading && !arr.data} error={arr.error}>
      {farms.length ? <Bullets label="Volume per farm" labelWidth={128} max={farms[0].l} rows={farms.map(f => ({ key: f.name, label: f.name, value: f.l, text: `${fmt(f.l)} L`, color: C.ok, href: "/kedatangan" }))} /> : <Empty>Belum ada volume dari farm.</Empty>}
    </Panel>
    <Panel title="Transfer dan selisih" subtitle="Selisih keluar dibanding diterima, dihitung server." href="/transfer" loading={trf.loading && !trf.data} error={trf.error}>
      {transfers.length ? <Bullets label="Selisih per transfer" labelWidth={84} max={Math.max(...transfers.map(t => Math.abs(t.selisih_l)), 1)} rows={transfers.slice(0, 8).map(t => ({ key: t.id, label: t.id, sub: `${t.from_ref} ke ${t.to_ref}`, value: Math.abs(t.selisih_l), text: `${fmt(t.selisih_l)} L`, color: t.volume_out_l && Math.abs(t.selisih_l) / t.volume_out_l > 0.005 ? C.warn : C.ok, href: "/transfer" }))} /> : <Empty>Belum ada transfer tercatat di server.</Empty>}
    </Panel>
  </Layout>;
}

/* ---------- Lab: sampel yang harus diperiksa ---------- */
type ApiLab = LabResult & { decision?: { status: string } };
const LAB_STATUS = [
  { key: "dalam-uji", label: "Dalam uji", color: C.gray }, { key: "uji-ulang", label: "Uji ulang", color: C.warn }, { key: "hasil-siap", label: "Hasil siap", color: C.soft },
  { key: "lulus", label: "Lulus", color: C.ok }, { key: "positif", label: "Out-of-spec", color: C.crit },
] as const;
const LAB_KIND: Record<string, string> = { penerimaan: "Susu masuk (RT)", batch: "Batch tangki", "qc-fg": "Barang jadi" };
const failing = (s: LabResult) => s.params.filter(p => p.ok === false).map(p => `${p.name} ${p.value}`).join(", ");

function LabApi({ attention }: { attention: ReactNode }) {
  const lab = useResource<ApiLab[]>("/lab/results");
  const rows = lab.data ?? [];
  const pending = rows.filter(s => s.status === "dalam-uji" || s.status === "uji-ulang");
  const out = rows.filter(s => s.status === "positif");
  const ready = rows.filter(s => s.status === "hasil-siap");
  const kinds = Object.entries(countBy(rows, s => s.kind));
  const kpis: ExecKpi[] = [
    { icon: FlaskConical, label: "Perlu diperiksa", value: lab.data ? pending.length : null, of: "sampel", note: `${rows.filter(s => s.status === "uji-ulang").length} perlu uji ulang`, tone: pending.length ? "warn" : "ok", href: "/lab" },
    { icon: ClipboardList, label: "Hasil siap", value: lab.data ? ready.length : null, of: "sampel", note: "Menunggu keputusan QA", tone: "neutral", href: "/lab" },
    { icon: ShieldAlert, label: "Out-of-spec", value: lab.data ? out.length : null, of: "sampel", note: out.length ? "Teruskan ke QA" : "Belum ada hasil di luar batas", tone: out.length ? "crit" : "ok", href: "/lab" },
    { icon: ShieldCheck, label: "Lulus", value: lab.data ? rows.filter(s => s.status === "lulus").length : null, of: `dari ${rows.length}`, progress: rows.length ? rows.filter(s => s.status === "lulus").length / rows.length * 100 : undefined, note: "Semua parameter dalam batas", tone: "ok", href: "/lab" },
  ];
  return <Layout kpis={kpis} attention={attention} label={labelOf(lab.data)}>
    <Panel title="Status sampel" subtitle="Semua sampel di Tes Lab." href="/lab" loading={lab.loading && !lab.data} error={lab.error}>
      {rows.length ? <Donut segs={LAB_STATUS.map(s => ({ key: s.key, label: s.label, count: rows.filter(r => r.status === s.key).length, color: s.color }))} unit="sampel" /> : <Empty>Belum ada sampel.</Empty>}
    </Panel>
    <Panel title="Sampel per jenis" subtitle="Susu masuk, batch tangki, dan barang jadi." href="/lab" loading={lab.loading && !lab.data} error={lab.error}>
      {kinds.length ? <Bullets label="Sampel per jenis" labelWidth={128} max={Math.max(...kinds.map(k => k[1]))} rows={kinds.map(([k, n]) => ({ key: k, label: LAB_KIND[k] ?? k, sub: `${rows.filter(s => s.kind === k && (s.status === "dalam-uji" || s.status === "uji-ulang")).length} belum selesai`, value: n, text: `${n} sampel`, color: C.ok, href: "/lab" }))} /> : <Empty>Belum ada sampel.</Empty>}
    </Panel>
    <Panel title="Sampel perlu diperiksa" subtitle="Dalam uji dan uji ulang, paling atas yang perlu uji ulang." href="/lab" loading={lab.loading && !lab.data} error={lab.error}>
      {pending.length ? <Bullets label="Sampel perlu diperiksa" labelWidth={96} max={1} rows={[...pending].sort((a, b) => (a.status === "uji-ulang" ? -1 : 1) - (b.status === "uji-ulang" ? -1 : 1)).map(s => { const done = s.params.filter(p => p.ok !== null).length; return { key: s.id, label: s.subject, sub: s.status === "uji-ulang" ? "Uji ulang" : "Dalam uji", value: s.params.length ? done / s.params.length : 0, text: `${done}/${s.params.length} parameter`, color: s.status === "uji-ulang" ? C.warn : C.soft, href: `/lab?sampel=${s.id}` }; })} /> : <Empty>Tidak ada sampel yang menunggu uji.</Empty>}
    </Panel>
    <Panel title="Out-of-spec" subtitle="Parameter di luar batas, teruskan ke QA." href="/lab" loading={lab.loading && !lab.data} error={lab.error}>
      {out.length ? <ul className="attention-list exec-attention">{out.map(s => <li key={s.id}><Link href={`/lab?sampel=${s.id}`} className="attention-item crit"><span className="attention-icon"><Icon icon={ShieldAlert} size={16} /></span><span className="attention-copy"><strong>{s.subject}</strong><span>{failing(s)}</span></span><Icon icon={ChevronRight} size={16} /></Link></li>)}</ul> : <Empty>Belum ada hasil di luar batas.</Empty>}
    </Panel>
  </Layout>;
}

/* ---------- Operator: mesin, downtime, run ---------- */
const DOWN_COLOR: Record<string, string> = { breakdown: C.crit, planned_maintenance: C.warn, cleaning: C.soft };
function OperatorApi({ attention }: { attention: ReactNode }) {
  const down = useResource<BeDowntimeEvent[]>("/downtime-events");
  const sch = useResource<BeSchedule>("/schedules/latest");
  const exec = useResource<BeExecDashboard>("/dashboard/executive");
  const noSchedule = status(sch.error) === 404;
  const schedule = noSchedule ? null : sch.data;
  const events = down.data ?? [];
  const hours = events.reduce((s, e) => s + hoursBetween(e.start, e.end), 0);
  const perMachine = Object.entries(events.reduce<Record<string, number>>((m, e) => { m[e.resource_id] = (m[e.resource_id] ?? 0) + hoursBetween(e.start, e.end); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const runs = schedule?.runs ?? [];
  const perFm = Object.entries(runs.reduce<Record<string, number>>((m, r) => { m[r.fm_id] = (m[r.fm_id] ?? 0) + r.qty_liter; return m; }, {})).sort((a, b) => a[0].localeCompare(b[0], "id", { numeric: true }));
  const util = exec.data?.machine_utilization ?? [];
  const avg = util.length ? util.reduce((s, u) => s + u.pct, 0) / util.length : null;
  const kpis: ExecKpi[] = [
    { icon: Factory, label: "Utilisasi mesin", value: avg === null ? null : Math.round(avg), suffix: "%", progress: avg ?? undefined, note: util.length ? `Rata-rata ${util.length} mesin filling` : "Belum ada jadwal untuk dihitung", tone: avg === null ? "warn" : avg < 60 ? "warn" : "ok", href: "/kondisi-alat" },
    { icon: Wrench, label: "Kejadian downtime", value: down.data ? events.length : null, of: "kejadian", note: `${events.filter(e => e.type === "breakdown").length} breakdown`, tone: events.some(e => e.type === "breakdown") ? "crit" : "ok", href: "/kondisi-alat" },
    { icon: Timer, label: "Jam downtime", value: down.data ? Math.round(hours * 10) / 10 : null, decimals: 1, of: "jam", note: perMachine.length ? `Terbanyak ${perMachine[0][0]}` : "Belum ada downtime", tone: hours ? "warn" : "ok", href: "/kondisi-alat" },
    { icon: CalendarRange, label: "Run terjadwal", value: schedule ? runs.length : null, of: "run", note: schedule ? `${fmt(runs.reduce((s, r) => s + r.qty_liter, 0))} liter di ${perFm.length} mesin` : "Belum ada jadwal", tone: schedule ? "neutral" : "warn", href: "/penjadwalan" },
  ];
  return <Layout kpis={kpis} attention={attention}>
    <Panel title="Utilisasi per mesin filling" subtitle="Persen dari Backend, dari jadwal terbaru dan downtime." href="/kondisi-alat" loading={exec.loading && !exec.data} error={exec.error}>
      {util.length ? <Bullets label="Utilisasi per mesin" labelWidth={72} max={100} rows={util.map(u => ({ key: u.fm_id, label: u.fm_id, sub: `${dec(u.downtime_hours)} jam down`, value: u.pct, text: `${dec(u.pct)}%`, color: u.pct < 50 ? C.warn : C.ok, href: "/kondisi-alat" }))} /> : <Empty>Belum ada jadwal, utilisasi belum bisa dihitung.</Empty>}
    </Panel>
    <Panel title="Downtime per jenis" subtitle="Kejadian downtime yang tercatat di server." href="/kondisi-alat" loading={down.loading && !down.data} error={down.error}>
      {events.length ? <Donut segs={Object.keys(DOWNTIME_TYPE_LABEL).map(k => ({ key: k, label: DOWNTIME_TYPE_LABEL[k], count: events.filter(e => e.type === k).length, color: DOWN_COLOR[k] ?? C.gray }))} unit="kejadian" /> : <Empty>Belum ada downtime tercatat. Catat di Kondisi Alat bila mesin berhenti.</Empty>}
    </Panel>
    <Panel title="Jam downtime per mesin" subtitle="Total lama berhenti per alat." href="/kondisi-alat" loading={down.loading && !down.data} error={down.error}>
      {perMachine.length ? <Bullets label="Jam downtime per mesin" labelWidth={72} max={perMachine[0][1]} rows={perMachine.map(([id, h]) => ({ key: id, label: id, value: h, text: `${dec(h)} jam`, color: C.warn, href: "/kondisi-alat" }))} /> : <Empty>Belum ada downtime tercatat.</Empty>}
    </Panel>
    <Panel title="Liter terjadwal per mesin" subtitle="Total run pada jadwal terbaru." href="/penjadwalan" loading={sch.loading && !sch.data && !noSchedule} error={noSchedule ? null : sch.error}>
      {perFm.length ? <Bullets label="Liter terjadwal per mesin" labelWidth={72} max={Math.max(...perFm.map(f => f[1]))} rows={perFm.map(([fm, l]) => ({ key: fm, label: fm, sub: `${runs.filter(r => r.fm_id === fm).length} run`, value: l, text: `${fmt(l)} L`, color: C.ok, href: "/penjadwalan" }))} /> : <Empty>Belum ada jadwal tergenerate.</Empty>}
    </Panel>
  </Layout>;
}

/* ---------- QA/QC: rilis susu, mutu barang jadi, hold ---------- */
const HOLD_STATUS = [
  { key: "diajukan", label: "Menunggu keputusan", color: C.warn }, { key: "aktif", label: "Aktif", color: C.crit }, { key: "dilepas", label: "Dilepas", color: C.ok }, { key: "ditolak", label: "Ditolak", color: C.gray },
] as const;
function QaApi({ attention }: { attention: ReactNode }) {
  const lab = useResource<ApiLab[]>("/lab/results");
  const holds = useResource<Hold[]>("/holds");
  const rows = lab.data ?? [];
  const rt = rows.filter(s => s.kind === "penerimaan");
  const fg = rows.filter(s => s.kind === "qc-fg");
  const ready = rt.filter(s => s.status === "hasil-siap");
  const reject = rt.filter(s => s.status === "positif");
  const fgFail = fg.filter(s => s.status === "positif");
  const hs = holds.data ?? [];
  const held = hs.filter(h => h.status === "aktif" || h.status === "diajukan").flatMap(h => h.lots.map(l => ({ ...l, hold: h.id, status: h.status })));
  const kpis: ExecKpi[] = [
    { icon: FlaskConical, label: "Siap dirilis", value: lab.data ? ready.length : null, of: "RT", note: "Semua parameter dalam batas", tone: ready.length ? "warn" : "ok", href: "/lab" },
    { icon: ShieldAlert, label: "RT out-of-spec", value: lab.data ? reject.length : null, of: "RT", note: reject.length ? "Putuskan penolakan" : "Tidak ada", tone: reject.length ? "crit" : "ok", href: "/lab" },
    { icon: PackageX, label: "Lot barang jadi gagal", value: lab.data ? fgFail.length : null, of: `dari ${fg.length} lot diuji`, progress: fg.length ? fgFail.length / fg.length * 100 : undefined, note: fgFail.map(s => s.subject).join(", ") || "Semua lot lulus", tone: fgFail.length ? "crit" : "ok", href: "/qc-produk" },
    { icon: Hourglass, label: "Hold menunggu", value: holds.data ? hs.filter(h => h.status === "diajukan").length : null, of: "hold", note: `${hs.filter(h => h.status === "aktif").length} hold aktif`, tone: hs.some(h => h.status === "diajukan") ? "warn" : "ok", href: "/hold" },
  ];
  return <Layout kpis={kpis} attention={attention} label={labelOf(lab.data, holds.data)}>
    <Panel title="Keputusan rilis susu masuk" subtitle="Status hasil lab RT yang menunggu keputusan QA." href="/lab" loading={lab.loading && !lab.data} error={lab.error}>
      {rt.length ? <Donut segs={LAB_STATUS.map(s => ({ key: s.key, label: s.key === "hasil-siap" ? "Siap dirilis" : s.label, count: rt.filter(r => r.status === s.key).length, color: s.color }))} unit="RT" /> : <Empty>Belum ada hasil lab susu masuk.</Empty>}
    </Panel>
    <Panel title="Status hold produk" subtitle="Semua pengajuan hold." href="/hold" loading={holds.loading && !holds.data} error={holds.error}>
      {hs.length ? <Donut segs={HOLD_STATUS.map(s => ({ key: s.key, label: s.label, count: hs.filter(h => h.status === s.key).length, color: s.color }))} unit="hold" /> : <Empty>Belum ada hold.</Empty>}
    </Panel>
    <Panel title="Pak tertahan per lot" subtitle="Lot dalam hold aktif atau yang sedang diajukan." href="/hold" loading={holds.loading && !holds.data} error={holds.error}>
      {held.length ? <Bullets label="Pak tertahan per lot" labelWidth={104} max={Math.max(...held.map(l => l.packs))} rows={held.map(l => ({ key: `${l.hold}-${l.id}`, label: l.id, sub: l.product, value: l.packs, text: `${fmt(l.packs)} pak`, color: l.status === "aktif" ? C.crit : C.warn, href: "/hold" }))} /> : <Empty>Tidak ada lot yang sedang ditahan.</Empty>}
    </Panel>
    <Panel title="Mutu barang jadi" subtitle="Lot yang diuji QC dan parameter yang gagal." href="/qc-produk" loading={lab.loading && !lab.data} error={lab.error}>
      {fg.length ? <ul className="attention-list exec-attention">{fg.map(s => <li key={s.id}><Link href="/qc-produk" className={`attention-item ${s.status === "positif" ? "crit" : "ok"}`}><span className="attention-icon"><Icon icon={s.status === "positif" ? ShieldAlert : ShieldCheck} size={16} /></span><span className="attention-copy"><strong>{s.subject}</strong><span>{s.status === "positif" ? failing(s) : "Lulus semua parameter"}</span></span><Icon icon={ChevronRight} size={16} /></Link></li>)}</ul> : <Empty>Belum ada lot barang jadi yang diuji.</Empty>}
    </Panel>
  </Layout>;
}

/** Beranda mode API per role. Manager memakai ExecutiveDashboardApi; role buatan Superadmin memakai versi umum di beranda.tsx. */
export const ROLE_DASHBOARD_API: Partial<Record<RoleId, (p: { attention: ReactNode }) => ReactNode>> = {
  superadmin: SuperadminApi, planner: PlannerApi, receiving: ReceivingApi, lab: LabApi, operator: OperatorApi, qa: QaApi,
};
