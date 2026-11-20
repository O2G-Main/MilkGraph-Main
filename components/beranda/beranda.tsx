"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarRange, ChevronRight, Container, Droplets, Factory, FlaskConical, Hourglass, PackageX, Send, ShieldAlert, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import { scenario } from "@/lib/data";
import { duration } from "@/lib/format";
import { useDemo } from "@/lib/demo";
import { visibleNav } from "@/lib/nav";
import { ROLES } from "@/lib/roles";
import { holdingLeft, violations } from "@/lib/rules";
import { checkSchedule } from "@/lib/production";
import { PROCESS_LOSS, dataSources, demandPlan, farms, fillers, labResults, pastLog } from "@/mock/ops";
import { BOTTLENECKS } from "@/mock/site";
import type { Tone } from "@/mock/types";
import { Badge, Card, Icon, PageHeading, SectionTitle, SourceModal } from "@/components/ui";
import { MetricGrid } from "@/components/receiving/metric-grid";
import { ASSETS } from "@/lib/assets";

type Item = { icon: LucideIcon; title: string; meta: string; tone: Tone; href: string };
const plan = scenario.plans[0];
const forward = scenario.answers.find(a => a.id === "forward")!;


/** Beranda: KPI, hal yang perlu ditangani, lalu satu baris ringkasan per menu. Setiap baris membawa ke halaman detailnya. */
export function Beranda() {
  const [source, setSource] = useState<string | null>(null);
  const demo = useDemo();
  const me = ROLES[demo.role];
  const broken = violations(plan, "before", demo.limits);
  const after = violations(plan, "after", demo.limits);
  const approved = demo.decisions.find(d => d.plan === "current" && d.status === "approved");
  const left = Math.max(0, holdingLeft(demo.limits));
  const hold = demo.holds.find(h => h.trigger === scenario.qcEvent.lot && h.status !== "ditolak");
  const labPending = labResults.filter(r => r.kind === "penerimaan" && (r.status === "hasil-siap" || r.status === "uji-ulang") && !demo.labs[r.id]).length;
  const broke = fillers.filter(f => f.state === "breakdown");
  const bottlenecks = BOTTLENECKS[approved ? "after" : "before"];
  const arrived = farms.reduce((s, f) => s + f.arrived, 0);
  const plannedRt = farms.reduce((s, f) => s + f.plannedRt, 0);
  const connected = dataSources.filter(d => d.status === "terhubung").length;
  const bay = scenario.metrics[3];
  const lab = scenario.metrics[2];

  const isPlanner = demo.role === "planner";
  // Angka khusus Planner: jadwal, kecukupan susu, dan lini yang memotong kapasitas.
  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  const checks = checkSchedule(demo.schedule, Object.fromEntries(fillers.map(f => [f.id, f.target])), demo.rules);
  const badOrders = demo.schedule.filter(i => checks[i.id].issues.some(x => x.tone !== "neutral"));
  const targetPacks = demo.schedule.reduce((sum, i) => sum + i.packs, 0);
  const milkNeed = Math.round(demandPlan.reduce((sum, d) => sum + d.packs * d.litresPerPack * d.milk, 0) / (1 - PROCESS_LOSS));
  const milkPlanned = farms.reduce((sum, f) => sum + f.plannedL, 0);
  const cover = Math.round(milkPlanned / milkNeed * 100);
  const demandSent = demo.log.some(e => e.title === "Kebutuhan susu dikirim ke farm");
  const running = fillers.filter(f => f.state === "jalan").length;
  const stopped = fillers.filter(f => f.state === "cip" || f.state === "ganti-format");

  const watch = ASSETS.filter(a => a.tone === "crit" || a.tone === "warn").length;
  const summary: Record<string, { text: string; tone: Tone }> = {
    "Simulasi 3D": { text: `${bottlenecks.length} titik bottleneck di tata letak plant`, tone: bottlenecks.some(b => b.tone === "crit") ? "crit" : "neutral" },
    Penerimaan: { text: `${scenario.tankers.length} RT di plant, ${labPending} hasil lab menunggu QA, tiba ${arrived} dari ${plannedRt} RT`, tone: labPending ? "warn" : "neutral" },
    Operasional: { text: `${watch} alat perlu diperhatikan${broke.length ? `, ${broke.map(f => f.id).join(", ")} breakdown` : ""}`, tone: broke.length ? "crit" : watch ? "warn" : "neutral" },
    Rencana: isPlanner
      ? { text: `${badOrders.length} order jadwal perlu dicek, ${broken} constraint dilanggar di rencana awal`, tone: broken || badOrders.length ? "crit" : "neutral" }
      : { text: `${broken} constraint dilanggar, ${after} dengan rekomendasi solver`, tone: broken ? "crit" : "neutral" },
    Traceability: { text: `${scenario.qcEvent.lot} out-of-spec, ${forward.lots!.length} lot terdampak, ${hold ? hold.id : "hold belum diajukan"}`, tone: hold ? "warn" : "crit" },
    Pengaturan: { text: `${connected} dari ${dataSources.length} sumber data terhubung`, tone: connected < dataSources.length ? "warn" : "neutral" },
  };

  const plannerKpis: { icon: LucideIcon; label: string; value: string; unit: string; note: string; tone: Tone; href: string }[] = [
    { icon: TriangleAlert, label: "Kelayakan rencana", value: approved ? "Disetujui" : String(broken), unit: approved ? "" : "constraint dilanggar", note: approved ? `Oleh ${approved.by}, ${approved.at}` : `${after} dengan rekomendasi solver`, tone: approved ? "ok" : broken ? "crit" : "ok", href: "/rencana" },
    { icon: CalendarRange, label: "Jadwal shift", value: String(badOrders.length), unit: `dari ${demo.schedule.length} order perlu dicek`, note: `Target ${fmt(targetPacks)} pak`, tone: badOrders.length ? "warn" : "ok", href: "/penjadwalan" },
    { icon: Droplets, label: "Kecukupan susu segar", value: `${cover}%`, unit: "dari kebutuhan", note: `Rencana kirim farm ${fmt(milkPlanned)} L, butuh ${fmt(milkNeed)} L`, tone: cover < 100 ? "crit" : cover < 105 ? "warn" : "ok", href: "/pasokan" },
    { icon: Factory, label: "Lini filling jalan", value: `${running}/${fillers.length}`, unit: "lini", note: `${broke.length} breakdown, ${stopped.length} CIP atau ganti format`, tone: broke.length ? "crit" : stopped.length ? "warn" : "ok", href: "/kondisi-alat" },
  ];
  // Urutan urgensi PPIC: rencana yang tidak layak, bahan baku yang bisa terbuang, jadwal bermasalah, kapasitas yang hilang, pasokan, lalu dampak kualitas ke stok.
  const plannerAttention: Item[] = [
    ...(!approved ? [{ icon: TriangleAlert, title: `Rencana shift tidak layak, ${broken} constraint dilanggar`, meta: "Bandingkan rekomendasi solver, lalu setujui atau tolak", tone: "crit" as Tone, href: "/rencana" }] : []),
    ...(!approved ? [{ icon: Hourglass, title: "RT-26 mendekati batas holding time", meta: `Sisa ${duration(left)}. Susu berisiko dibuang kalau urutan bongkar tidak berubah`, tone: "crit" as Tone, href: "/receiving" }] : []),
    ...badOrders.slice(0, 3).map(i => ({ icon: CalendarRange, title: `Jadwal ${i.line} ${i.sku} perlu dicek`, meta: checks[i.id].issues.filter(x => x.tone !== "neutral").map(x => x.text).join(" "), tone: (checks[i.id].issues.some(x => x.tone === "crit") ? "crit" : "warn") as Tone, href: "/penjadwalan" })),
    ...broke.map(f => ({ icon: Wrench, title: `${f.id} breakdown, kapasitas ${f.product} turun`, meta: f.note, tone: "crit" as Tone, href: "/kondisi-alat" })),
    ...(stopped.length ? [{ icon: Factory, title: `${stopped.map(f => f.id).join(", ")} belum jalan`, meta: stopped.map(f => f.note).filter((n, i, a) => a.indexOf(n) === i).join(" "), tone: "warn" as Tone, href: "/kondisi-alat" }] : []),
    ...(!demandSent ? [{ icon: Send, title: "Kebutuhan susu belum dikirim ke farm", meta: `Butuh ${fmt(milkNeed)} L untuk ${demandPlan.length} SKU`, tone: "warn" as Tone, href: "/pasokan" }] : []),
    { icon: ShieldAlert, title: `${scenario.qcEvent.lot} out-of-spec`, meta: `${forward.lots!.length} lot terdampak${hold ? `, ${hold.id} ${hold.status}` : ""}. Cek dampaknya ke stok barang jadi`, tone: "neutral", href: "/trace" },
  ];
  const attention: Item[] = [
    ...(!approved ? [{ icon: Hourglass, title: "RT-26 mendekati batas holding time", meta: `Sisa ${duration(left)}, masih menunggu bay`, tone: "crit" as Tone, href: "/receiving" }] : []),
    hold ? { icon: PackageX, title: `${hold.id} ${hold.status === "diajukan" ? "menunggu keputusan QA" : hold.status === "aktif" ? "hold aktif" : "hold dilepas"}`, meta: `${hold.lots.length} lot dari ${scenario.qcEvent.lot}`, tone: hold.status === "diajukan" ? "warn" : "neutral", href: "/hold" }
      : { icon: FlaskConical, title: `${scenario.qcEvent.lot} QC out-of-spec`, meta: `${scenario.qcEvent.test}, perlu ditelusuri`, tone: "crit", href: "/trace" },
    ...broke.map(f => ({ icon: Wrench, title: `${f.id} breakdown`, meta: f.note, tone: "crit" as Tone, href: "/filling" })),
    ...(labPending ? [{ icon: FlaskConical, title: `${labPending} hasil lab menunggu rilis QA`, meta: "RT baru bisa antre bongkar setelah dirilis lab", tone: "warn" as Tone, href: "/lab" }] : []),
    { icon: Container, title: "Bay 2 sedang CIP", meta: bay.delta, tone: "warn", href: "/tangki" },
  ];

  const shown = isPlanner ? plannerAttention : attention;

  return <div className="page-enter">
    <PageHeading title="Beranda" subtitle={isPlanner
      ? `Halo, ${me.user.split(" ")[0]}. Kelayakan rencana, jadwal, dan pasokan Shift Siang, ${scenario.date}, snapshot ${scenario.now}.`
      : `Halo, ${me.user.split(" ")[0]}. Ringkasan Shift Siang, ${scenario.date}, snapshot ${scenario.now}.`} />
    {isPlanner
      ? <div className="schedule-stats planner-kpis">{plannerKpis.map(k => <Link key={k.label} href={k.href} className={`card planner-kpi ${k.tone}`}><span className="planner-kpi-label"><Icon icon={k.icon} size={16} />{k.label}<Icon icon={ArrowUpRight} size={15} className="planner-kpi-go" /></span><strong>{k.value}{k.unit && <small> {k.unit}</small>}</strong><span className="small muted">{k.note}</span></Link>)}</div>
      : <MetricGrid onSource={setSource} />}

    <div className="home-top">
      <section className="incident-card home-plan"><div className="incident-top"><span className="incident-status"><Icon icon={TriangleAlert} size={17} />Rencana shift</span><span className="mono">PLAN-FIFO</span></div>
        <h2>{approved ? <>Rekomendasi disetujui,<br />RT-26 pindah ke Bay 1.</> : <>Rencana tidak layak,<br />{broken} constraint dilanggar.</>}</h2>
        <div className="incident-time"><span><Icon icon={Hourglass} size={15} />Sisa holding time RT-26</span><strong>{duration(left)}</strong></div>
        <p className="inverse-muted">{approved ? `Disetujui ${approved.by}, ${approved.at}.` : `Lab test butuh ${lab.value} ${lab.unit}, dan ${bay.delta}.`}</p>
        <Link href="/rencana" className="button inverse">{approved ? "Lihat rencana" : "Periksa rencana"}<span className="button-circle"><Icon icon={ArrowUpRight} /></span></Link>
      </section>
      <Card className="home-attention"><SectionTitle title={isPlanner ? "Perlu keputusan Planner" : "Perlu perhatian"} subtitle={isPlanner ? "Diurutkan dari yang paling mendesak." : undefined} action={<Badge tone="crit">{shown.filter(a => a.tone === "crit").length} kritis</Badge>} />
        <ul className="attention-list">{shown.map(a => <li key={a.title}><Link href={a.href} className={`attention-item ${a.tone}`}><span className="attention-icon"><Icon icon={a.icon} size={18} /></span><span className="attention-copy"><strong>{a.title}</strong><span>{a.meta}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>)}</ul>
      </Card>
    </div>

    {/* Isi tiap menu diringkas jadi satu baris (poin 7): detailnya ada di halaman menu masing-masing. */}
    <Card className="home-menus"><SectionTitle title="Semua menu" subtitle="Satu baris per menu. Klik untuk membuka halamannya." />
      <ul className="attention-list menu-list">{visibleNav(demo.role).filter(n => summary[n.label]).map(n => { const m = summary[n.label]; return <li key={n.label}><Link href={n.tabs[0].href} className={`attention-item ${m.tone}`}><span className="attention-icon"><Icon icon={n.icon} size={18} /></span><span className="attention-copy"><strong>{n.label}</strong><span>{m.text}</span></span><Icon icon={ChevronRight} size={18} /></Link></li>; })}</ul>
    </Card>

    <Card className="home-activity"><SectionTitle title="Aktivitas terbaru" action={<Link className="text-link" href="/persetujuan">Semua riwayat<Icon icon={ChevronRight} size={14} /></Link>} />
      <ul className="activity-list">{[...demo.log, ...pastLog].slice(0, 3).map(e => <li key={e.id}><span className={`status-dot tone-${e.tone}`} aria-hidden="true" /><span><strong>{e.title}</strong><span>{e.detail}</span><span>{e.by} · {e.at}</span></span></li>)}</ul>
    </Card>
    <SourceModal id={source} onClose={() => setSource(null)} />
  </div>;
}
