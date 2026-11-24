"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarRange, ChevronRight, Droplets, Hourglass, PackageX, TriangleAlert, type LucideIcon } from "lucide-react";
import { useResource } from "@/lib/api/resource";
import { FULFILMENT_LABEL, fmtWaktu, pctText, type BeArrival, type BeDowntimeEvent, type BeExecDashboard, type BeSchedule } from "@/lib/api/contract";
import { type ApiError } from "@/lib/api/client";
import type { Hold } from "@/lib/demo";
import { findNav, visibleNav } from "@/lib/nav";
import { canOpen, canSee, type RoleId } from "@/lib/roles";
import type { DataSource } from "@/mock/ops";
import type { Tone } from "@/mock/types";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
const jam = (n?: number) => (n === undefined ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n));
const statusOf = (e: Error | null) => (e as ApiError | null)?.status;

type Item = { icon: LucideIcon; title: string; meta: string; tone: Tone; href: string };
interface BottleItem { title: string; text: string; tone: Tone }

/**
 * Beranda mode API: hero, daftar perhatian, dan ringkasan menu semuanya dari Backend.
 * KPI utama memakai ExecutiveKpis (GET /dashboard/executive) untuk semua peran.
 * Bagian di file ini menggantikan hitungan skenario lokal versi lama di mode API;
 * mode lokal tidak memakai file ini sama sekali.
 */

/** Kartu status jadwal di kiri atas: versi jadwal, PO berisiko, dan jendela dari dashboard eksekutif server. */
export function BerandaApiHero({ role }: { role: RoleId }) {
  const res = useResource<BeExecDashboard>("/dashboard/executive");
  const d = res.data;
  const ds = d?.daily_schedule ?? null;
  const po = d?.po_summary ?? null;
  const risk = po ? po.at_risk + po.late : 0;
  return <section className="incident-card home-plan"><div className="incident-top"><span className="incident-status"><Icon icon={CalendarRange} size={17} />Jadwal produksi</span><span className="mono">{ds ? ds.schedule_id : "BELUM ADA JADWAL"}</span></div>
    <h2>{res.error
      ? <>Gagal memuat<br />dashboard server.</>
      : !d
      ? <>Memuat jadwal<br />dari server…</>
      : ds
      ? <>Jadwal versi {ds.version} aktif,<br />{ds.runs_count} run terjadwal.</>
      : <>Belum ada jadwal<br />tergenerate.</>}</h2>
    <div className="incident-time"><span><Icon icon={TriangleAlert} size={15} />PO berisiko atau terlambat</span><strong>{po ? `${risk} PO` : "-"}</strong></div>
    <p className="inverse-muted">{res.error
      ? res.error.message
      : !d
      ? "Menghubungi Backend untuk status jadwal dan pasokan terbaru."
      : ds
      ? `Jendela ${fmtWaktu(ds.window.start)} sampai ${fmtWaktu(ds.window.end)}. ${po ? `${po.fulfilled} PO terpenuhi, ${po.on_track} sesuai rencana. ` : ""}Pasokan diterima ${fmt(d.milk_received_l.total)} liter dari RT berstatus Sudah Tiba.`
      : `Pasokan diterima ${fmt(d.milk_received_l.total)} liter dari RT berstatus Sudah Tiba. Generate jadwal di Penjadwalan supaya status PO dan utilisasi mesin bisa dihitung.`}</p>
    {canSee(role, findNav("/penjadwalan").tab.href) && <Link href="/penjadwalan" className="button inverse">Buka Penjadwalan<span className="button-circle"><Icon icon={ArrowUpRight} /></span></Link>}
  </section>;
}

/**
 * Daftar "Perlu perhatian" mode API: hanya dari data server yang benar-benar ada.
 * Sumbernya fulfilment PO (AT_RISK dan LATE) serta warnings dari jadwal terakhir,
 * dan hold yang menunggu keputusan atau sedang aktif dari GET /holds.
 * Kalau sumbernya kosong, daftarnya memang kosong; tidak ada item skenario lokal.
 */
export function BerandaApiAttention({ role, title, subtitle }: { role: RoleId; title: string; subtitle?: string }) {
  const [showAll, setShowAll] = useState(false);
  const schRes = useResource<BeSchedule>("/schedules/latest");
  const holdsRes = useResource<Hold[]>("/holds");
  const noSchedule = statusOf(schRes.error) === 404;
  const schedule = noSchedule ? null : schRes.data;
  const holds = holdsRes.data ?? [];
  const err = !noSchedule && schRes.error ? schRes.error : holdsRes.error;
  const loading = !err && (( !noSchedule && !schRes.data) || !holdsRes.data);

  const items: Item[] = [];
  for (const f of schedule?.fulfilment.filter(x => x.status === "LATE") ?? []) {
    items.push({ icon: TriangleAlert, title: `PO ${f.po_id} terlambat`, meta: `Status ${FULFILMENT_LABEL[f.status] ?? f.status}, terpenuhi ${pctText(f.fulfilled_pct)}, rencana selesai ${fmtWaktu(f.planned_completion)}${f.root_causes?.length ? `. Akar masalah: ${f.root_causes.join(", ")}` : ""}`, tone: "crit", href: "/penjadwalan" });
  }
  for (const f of schedule?.fulfilment.filter(x => x.status === "AT_RISK") ?? []) {
    items.push({ icon: TriangleAlert, title: `PO ${f.po_id} berisiko`, meta: `Status ${FULFILMENT_LABEL[f.status] ?? f.status}, terpenuhi ${pctText(f.fulfilled_pct)}, rencana selesai ${fmtWaktu(f.planned_completion)}${f.root_causes?.length ? `. Akar masalah: ${f.root_causes.join(", ")}` : ""}`, tone: "warn", href: "/penjadwalan" });
  }
  for (const w of schedule?.warnings ?? []) {
    if (w.type === "HOLDING_TIME") {
      items.push({ icon: Hourglass, title: `Holding time ${w.resource_id} melewati batas`, meta: w.projected_h !== undefined || w.limit_h !== undefined ? `Proyeksi ${jam(w.projected_h)} jam dari batas ${jam(w.limit_h)} jam pada jadwal terakhir` : "Tercatat sebagai peringatan pada jadwal terakhir", tone: "warn", href: "/penjadwalan" });
    } else if (w.type === "TANK_STOCK_SHORT") {
      items.push({ icon: Droplets, title: `Stok ${w.resource_id} kurang untuk jadwal`, meta: w.needed_l !== undefined || w.available_l !== undefined ? `Butuh ${fmt(w.needed_l ?? 0)} L, tersedia ${fmt(w.available_l ?? 0)} L pada jadwal terakhir` : "Tercatat sebagai peringatan pada jadwal terakhir", tone: "warn", href: "/penjadwalan" });
    } else {
      items.push({ icon: TriangleAlert, title: `Peringatan jadwal pada ${w.resource_id}`, meta: `Jenis peringatan ${w.type} pada jadwal terakhir`, tone: "warn", href: "/penjadwalan" });
    }
  }
  for (const h of holds.filter(h => h.status === "diajukan")) {
    items.push({ icon: PackageX, title: `${h.id} menunggu keputusan QA`, meta: `${h.lots.length} lot dari ${h.trigger}, diajukan ${h.by}`, tone: "warn", href: "/hold" });
  }
  for (const h of holds.filter(h => h.status === "aktif")) {
    items.push({ icon: PackageX, title: `${h.id} hold aktif`, meta: `${h.lots.length} lot dari ${h.trigger}`, tone: "neutral", href: "/hold" });
  }
  const shown = items.filter(a => canOpen(role, a.href.split("?")[0], findNav(a.href.split("?")[0]).tab.href));
  const visible = showAll ? shown : shown.slice(0, 4);

  return <Card className="home-attention" data-tour="attention"><SectionTitle title={title} subtitle={subtitle} action={<Badge tone="crit">{shown.filter(a => a.tone === "crit").length} kritis</Badge>} />
    {loading
      ? <p className="small muted">Memuat data perhatian dari server…</p>
      : err
      ? <p className="small crit-text">Gagal memuat data perhatian: {err.message}</p>
      : shown.length
      ? <><ul className="attention-list">{visible.map(a => <li key={a.title}><Link href={a.href} className={`attention-item ${a.tone}`}><span className="attention-icon"><Icon icon={a.icon} size={18} /></span><span className="attention-copy"><strong>{a.title}</strong><span>{a.meta}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>)}</ul>
        {shown.length > 4 && <p className="small"><button type="button" className="text-link" onClick={() => setShowAll(v => !v)}>{showAll ? "Tampilkan lebih sedikit" : `+${shown.length - 4} item lainnya`}</button></p>}</>
      : <p className="small muted">Tidak ada hal yang perlu perhatian dari data server saat ini.</p>}
  </Card>;
}

/**
 * Ringkasan satu baris per menu di mode API, dari endpoint yang sama dengan halaman tujuannya:
 * Simulasi 3D dari /site/bottlenecks, Penerimaan dari /supply/rt-arrivals, Operasional dari
 * /downtime-events, Rencana dari /schedules/latest, Traceability dari /holds, Pengaturan dari
 * /data-sources. Menu yang datanya belum termuat atau gagal dimuat tidak ditampilkan,
 * supaya tidak ada angka skenario lokal yang tampil di mode API.
 */
export function BerandaApiMenus({ role }: { role: RoleId }) {
  const schRes = useResource<BeSchedule>("/schedules/latest");
  const holdsRes = useResource<Hold[]>("/holds");
  const arrRes = useResource<BeArrival[]>("/supply/rt-arrivals");
  const downRes = useResource<BeDowntimeEvent[]>("/downtime-events");
  const bottleRes = useResource<BottleItem[]>("/site/bottlenecks?view=before");
  const srcRes = useResource<DataSource[]>("/data-sources");

  const noSchedule = statusOf(schRes.error) === 404;
  const schedule = noSchedule ? null : schRes.data;
  const riskCount = schedule ? schedule.fulfilment.filter(f => f.status === "AT_RISK" || f.status === "LATE").length : 0;
  const breakdowns = downRes.data?.filter(e => e.type === "breakdown").length ?? 0;
  const holdsWaiting = holdsRes.data?.filter(h => h.status === "diajukan").length ?? 0;
  const holdsActive = holdsRes.data?.filter(h => h.status === "aktif").length ?? 0;
  const connected = srcRes.data?.filter(s => s.status === "terhubung").length ?? 0;

  const summary: Record<string, { text: string; tone: Tone } | undefined> = {
    "Simulasi 3D": bottleRes.data
      ? { text: `${bottleRes.data.length} titik bottleneck di tata letak plant`, tone: bottleRes.data.some(b => b.tone === "crit") ? "crit" : bottleRes.data.some(b => b.tone === "warn") ? "warn" : "neutral" }
      : undefined,
    Penerimaan: arrRes.data
      ? { text: `${arrRes.data.filter(a => a.status === "Sudah Tiba").length} dari ${arrRes.data.length} kedatangan RT sudah tiba`, tone: "neutral" }
      : undefined,
    Operasional: downRes.data
      ? { text: downRes.data.length ? `${downRes.data.length} kejadian downtime tercatat${breakdowns ? `, ${breakdowns} breakdown` : ""}` : "Belum ada kejadian downtime tercatat", tone: breakdowns ? "crit" : "neutral" }
      : undefined,
    Rencana: noSchedule
      ? { text: "Belum ada jadwal tergenerate di server", tone: "warn" }
      : schedule
      ? { text: riskCount ? `${riskCount} PO berisiko atau terlambat pada jadwal versi ${schedule.version}` : `Jadwal versi ${schedule.version}, semua PO sesuai rencana atau terpenuhi`, tone: riskCount ? "warn" : "neutral" }
      : undefined,
    Traceability: holdsRes.data
      ? { text: holdsActive || holdsWaiting ? `${holdsActive} hold aktif, ${holdsWaiting} menunggu keputusan` : "Tidak ada hold yang berjalan", tone: holdsWaiting ? "warn" : "neutral" }
      : undefined,
    Pengaturan: srcRes.data
      ? { text: `${connected} dari ${srcRes.data.length} sumber data terhubung`, tone: connected < srcRes.data.length ? "warn" : "neutral" }
      : undefined,
  };
  const rows = visibleNav(role).filter(n => summary[n.label]);
  const settled = [schRes, holdsRes, arrRes, downRes, bottleRes, srcRes].every(r => r.data || r.error);

  return <Card className="home-menus"><SectionTitle title="Semua menu" subtitle="Satu baris per menu. Klik untuk membuka halamannya." />
    {rows.length
      ? <ul className="attention-list menu-list">{rows.map(n => { const m = summary[n.label]!; return <li key={n.label}><Link href={n.tabs[0].href} className={`attention-item ${m.tone}`}><span className="attention-icon"><Icon icon={n.icon} size={18} /></span><span className="attention-copy"><strong>{n.label}</strong><span>{m.text}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>; })}</ul>
      : <p className="small muted">{settled ? "Ringkasan menu dari server belum tersedia." : "Memuat ringkasan menu dari server…"}</p>}
  </Card>;
}
