"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarClock, Droplets, FlaskConical, Hourglass, MapPin, PackageCheck, PackageOpen, Pencil, ShieldCheck, TriangleAlert, Truck } from "lucide-react";
import { can, canSee } from "@/lib/roles";
import { applyQueue, clock, type QueueRow } from "@/lib/receiving";
import { mergeLab } from "@/lib/lab";
import { findNav } from "@/lib/nav";
import { labResults } from "@/mock/ops";
import { ArriveDialog, RtDialog, type RtAction } from "./queue-actions";
import { scenario } from "@/lib/data";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { apiSend } from "@/lib/api/client";
import { receivingHeadline } from "./api-view";
import type { Scenario } from "@/mock/types";
import { duration, number } from "@/lib/format";
import { useDemo } from "@/lib/demo";
import { holdingLeft, violations } from "@/lib/rules";
import { Badge, Card, Icon, PageLink, SectionTitle, SourceModal, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { MetricGrid } from "./metric-grid";
import { Queue3D } from "./queue-3d";
import { queueLayout } from "./queue-layout";

const stageIcons = [MapPin, Truck, Droplets, FlaskConical, ShieldCheck, PackageOpen, PackageCheck];
type ReceivingData = Pick<Scenario, "metrics" | "stages" | "tankers" | "assets" | "labHistory"> & {
  labSummary: { avgMinutes: number; deltaMinutes: number };
  incident: { rt: string; holdingLeftMin: number; summary: string; factors: { label: string; sourceId: string }[] };
};
type CheckResult = { violations: { before: number } };

export function Receiving() {
  const [source, setSource] = useState<string | null>(null);
  const [filter, setFilter] = useState("Semua tahap");
  const demo = useDemo();
  const receiving = useResource<ReceivingData>(API_MODE ? "/receiving" : null);
  const meta = useResource<{ now: string }>(API_MODE ? "/meta" : null);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<Error | null>(null);

  useEffect(() => {
    if (!API_MODE) return;
    let live = true;
    void apiSend<CheckResult>("POST", "/plans/current/check", {}, demo.role)
      .then(value => { if (live) setChecked(value); })
      .catch(error => { if (live) setCheckError(error); });
    return () => { live = false; };
  }, [demo.role, demo.limits]);

  const data = API_MODE ? receiving.data : {
    ...scenario,
    labSummary: { avgMinutes: 52, deltaMinutes: 14 },
    incident: {
      rt: "RT-26",
      holdingLeftMin: holdingLeft(demo.limits),
      summary: "Antrean RT menumpuk karena lab test lama dan Bay 2 sedang CIP.",
      factors: [
        { label: "Lab test 52 menit", sourceId: "LAB-QUEUE" },
        { label: "Bay 2 CIP sampai 15.20", sourceId: "CIP-B2" },
        { label: "Holding time RT-26", sourceId: "HOLD-RT26" },
      ],
    },
  };

  if (!data || (API_MODE && (!meta.data || !checked))) {
    const error = receiving.error ?? meta.error ?? checkError;
    return <div className="page-enter" role="status">{error ? `Gagal memuat antrean truk: ${error.message}` : "Memuat antrean truk…"}</div>;
  }

  return (
    <ReceivingContent
      data={data}
      now={API_MODE ? meta.data!.now : scenario.now}
      demo={demo}
      check={API_MODE ? checked! : { violations: { before: violations(scenario.plans[0], "before", demo.limits) } }}
      source={source}
      setSource={setSource}
      filter={filter}
      setFilter={setFilter}
    />
  );
}

function ReceivingContent({
  data: scenarioData,
  now,
  demo,
  check,
  source,
  setSource,
  filter,
  setFilter,
}: {
  data: ReceivingData;
  now: string;
  demo: ReturnType<typeof useDemo>;
  check: CheckResult;
  source: string | null;
  setSource: (id: string | null) => void;
  filter: string;
  setFilter: (v: string) => void;
}) {
  // Antrean memakai catatan Koordinator receiving: RT yang dicatat tiba, umur susu, dan proses bongkar.
  const rows = applyQueue(scenarioData.tankers, demo.receiving, demo.limits.holdingMin);
  const stages = ["Semua tahap", ...new Set(rows.map(t => t.stage))];
  const approved = demo.decisions.find(d => d.plan === "current" && d.status === "approved");
  const tankers = rows.filter(t => filter === stages[0] || t.stage === filter);
  const mayRecord = can(demo.role, "queue.record");
  const seePlan = canSee(demo.role, "/rencana");
  const seeBay = canSee(demo.role, findNav("/tangki").tab.href);
  const [dialog, setDialog] = useState<{ row: QueueRow; action: RtAction } | "tiba" | null>(null);
  const scenarioBay = useMemo(() => Object.fromEntries(scenarioData.assets.flatMap(a => { const rt = a.kind === "Bay" ? a.status.match(/RT-\d+/)?.[0] : undefined; return rt ? [[rt, a.id]] : []; })), [scenarioData]);
  const bayOf = (r: QueueRow) => r.bay ?? (r.stage === "Unloading" ? scenarioBay[r.id] : undefined);
  // Untuk Lab: RT dan batch yang hasil ujinya belum lengkap, RT dengan umur susu tertua di atas.
  const mayTest = can(demo.role, "lab.record");
  const samples = mergeLab(labResults, demo.lab).filter(s => s.kind !== "qc-fg");
  const LABEL: Record<string, string> = { "dalam-uji": "dalam uji", "uji-ulang": "perlu uji ulang", positif: "out-of-spec, tunggu QA" };
  const toTest = [
    ...rows.filter(r => r.stage === "Sampling" || r.stage === "Lab test").sort((a, b) => b.ageMin - a.ageMin).flatMap(r => {
      const s = samples.find(x => x.subject === r.id);
      if (s && (s.status === "hasil-siap" || s.status === "lulus" || demo.labs[s.id])) return [];
      const done = s ? s.params.filter(p => p.ok !== null).length : 0;
      return [{ key: r.id, batch: false, href: s ? `/lab?sampel=${s.id}` : "/lab", tone: s?.status === "positif" ? "crit" as const : r.tone, title: `${r.id} ${s ? LABEL[s.status] : "belum disampel"}`, meta: `${r.farm}, umur susu ${r.age}${s ? `. ${done} dari ${s.params.length} parameter selesai` : ""}` }];
    }),
    ...samples.filter(s => s.kind === "batch" && (s.status === "dalam-uji" || s.status === "uji-ulang")).map(s => ({
      key: s.id, batch: true, href: `/lab?sampel=${s.id}`, tone: "warn" as const, title: `Batch ${s.subject} ${LABEL[s.status]}`, meta: `${s.detail}. ${s.params.filter(p => p.ok !== null).length} dari ${s.params.length} parameter selesai`,
    })),
  ];
  // Next phase PDF: antrean juga bisa dilihat dalam 3D, dari data yang sama dengan tabel.
  const [mode, setMode] = useState<"tabel" | "3d">("tabel");
  const [picked, setPicked] = useState<string | null>(null);
  const layout = useMemo(() => {
    const bays = scenarioData.assets.filter(a => a.kind === "Bay").map(a => ({ id: a.id, status: a.status, tone: a.tone, note: a.info }));
    const at = Object.fromEntries(bays.flatMap(b => { const rt = b.status.match(/RT-\d+/)?.[0]; return rt ? [[rt, b.id]] : []; }));
    return queueLayout(scenarioData.tankers, scenarioData.stages.find(st => st.id === "otw")?.count ?? 0, bays, at);
  }, [scenarioData]);
  const pickedRt = scenarioData.tankers.find(t => t.id === picked);

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <h1>Antrean Truk</h1>
          <p>Alur RT dari farm sampai tangki, diperbarui {now}</p>
        </div>
        <div className="page-actions">
          {mayRecord && <button className="button primary" onClick={() => setDialog("tiba")}><Icon icon={Truck} />Catat kedatangan</button>}
          {seePlan && <Link className={`button ${mayRecord ? "secondary" : "primary"}`} href="/rencana">
            <Icon icon={CalendarClock} />Periksa rencana<Icon icon={ArrowUpRight} size={16} />
          </Link>}
        </div>
      </div>
      {mayTest && <Card className="lab-queue">
        <SectionTitle title="Perlu diperiksa lab" subtitle="RT di sampling dan lab test serta batch tangki proses yang hasil ujinya belum lengkap. RT diurutkan dari umur susu tertua." action={<Link className="text-link" href="/lab">Buka Tes Lab<Icon icon={ArrowRight} size={14} /></Link>} />
        {toTest.length ? <ul className="attention-list">{toTest.map(t => <li key={t.key}><Link href={t.href} className={`attention-item ${t.tone}`}><span className="attention-icon"><Icon icon={t.batch ? FlaskConical : Truck} size={18} /></span><span className="attention-copy"><strong>{t.title}</strong><span>{t.meta}</span></span><Icon icon={ArrowRight} size={16} /></Link></li>)}</ul>
          : <p className="small muted">Tidak ada RT atau batch yang menunggu pemeriksaan.</p>}
      </Card>}
      <MetricGrid metrics={scenarioData.metrics} onSource={setSource} />
      <Card className="flow-card">
        <SectionTitle title="Alur penerimaan RT" action={<span className="small muted flow-hint"><span className="status-dot" />Snapshot {now}</span>} />
        <ol className="stage-flow">
          {scenarioData.stages.map((stage, i) => (
            <li key={stage.id}>
              <a href={stage.id === "stored" && seeBay ? "/tangki" : "#antrean-rt"} className={`flow-step ${stage.tone}`}>
                <span className="flow-icon"><Icon icon={stageIcons[i]} size={20} /></span>
                <span>
                  <strong>{stage.label} <span className="stage-count">{stage.count}</span></strong>
                  <span className="flow-status"><span className="status-dot" />{stage.status}</span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      </Card>
      <div className={`monitor-bottom ${mode === "3d" ? "wide" : ""}`}>
        <Card id="antrean-rt" className="truck-card">
          <SectionTitle
            title="Antrean Road Tanker"
            action={<div className="page-actions"><Toggle label="Tampilan antrean" value={mode} onChange={m => { setMode(m); setPicked(null); }} options={[{ value: "tabel", label: "Tabel" }, { value: "3d", label: "Antrean 3D" }]} />{mode === "tabel" && <Select compact label="Filter tahap RT" value={filter} onChange={setFilter} options={stages.map(s => ({ value: s, label: s }))} />}</div>}
          />
          {mode === "3d" ? <>
            <Queue3D tankers={scenarioData.tankers} assets={scenarioData.assets} layout={layout} picked={picked} onPick={setPicked} label="Antrean road tanker dalam 3D, dari kedatangan sampai bay bongkar" />
            {pickedRt ? <div className="queue-detail">
              <div><strong className="mono">{pickedRt.id}</strong> <span className="muted">{pickedRt.farm}</span></div>
              <Badge tone={pickedRt.tone}>{pickedRt.stage}</Badge>
              <span>{number(pickedRt.volume)} L</span><span>Tunggu {pickedRt.wait} mnt</span><span className={pickedRt.tone === "crit" ? "crit-text" : ""}>Umur susu {pickedRt.age}</span><span>{number(pickedRt.temperature)} °C</span>
              <button className="text-link" onClick={() => setSource(pickedRt.source)}>Lihat bukti<Icon icon={ArrowUpRight} size={14} /></button>
            </div> : <p className="small muted queue-hint">Klik truk untuk melihat rinciannya. Denyut merah: RT mendekati batas holding time. Seret untuk menggeser, klik kanan untuk memutar.</p>}
          </> : <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RT / Farm</th>
                  <th className="numeric">Volume</th>
                  <th>Tahap</th>
                  <th className="numeric">Tunggu</th>
                  <th className="numeric">Umur susu</th>
                  <th className="numeric">Suhu</th>
                  {mayRecord && <th>Proses</th>}
                  <th><span className="sr-only">Bukti</span></th>
                </tr>
              </thead>
              <tbody>
                {tankers.map(rt => (
                  <tr key={rt.id}>
                    <td><strong className="mono">{rt.id}</strong><span className="table-sub">{rt.farm}{rt.arrivedAt ? `, tiba ${clock(rt.arrivedAt)}` : ""}</span></td>
                    <td data-label="Volume" className="numeric">{number(rt.volume)} L</td>
                    <td data-label="Tahap"><Badge tone={rt.tone}>{rt.stage}</Badge>{bayOf(rt) && <span className="table-sub">{bayOf(rt)}{rt.unloadStart ? ` sejak ${clock(rt.unloadStart)}` : ""}{rt.unloadEnd ? `, selesai ${clock(rt.unloadEnd)}` : ""}</span>}</td>
                    <td data-label="Tunggu" className="numeric">{rt.wait} mnt</td>
                    <td data-label="Umur susu" className={`numeric ${rt.tone === "crit" ? "crit-text" : rt.tone === "warn" ? "warn-text" : ""}`}>{rt.age}<span className="table-sub">awal {clock(rt.milkStart)}</span></td>
                    <td data-label="Suhu" className="numeric">{number(rt.temperature)} °C</td>
                    {mayRecord && <td data-label="Proses" className="queue-actions">
                      {rt.stage === "Released" && <button className="button primary" onClick={() => setDialog({ row: rt, action: "mulai" })}>Mulai bongkar</button>}
                      {rt.stage === "Unloading" && <button className="button primary" onClick={() => setDialog({ row: rt, action: "selesai" })}>Selesai bongkar</button>}
                      {rt.stage === "Selesai bongkar" && <Link className="text-link" href="/transfer">Catat transfer</Link>}
                      {(rt.stage === "Sampling" || rt.stage === "Lab test") && <span className="small muted">Tunggu rilis lab</span>}
                      <button className="icon-button" aria-label={`Ubah catatan tiba dan umur susu ${rt.id}`} onClick={() => setDialog({ row: rt, action: "catatan" })}><Icon icon={Pencil} size={15} /></button>
                    </td>}
                    <td className="table-action">
                      {rt.source && <button className="icon-button" aria-label={`Lihat bukti ${rt.id}`} onClick={() => setSource(rt.source)}>
                        <Icon icon={ArrowUpRight} size={16} />
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
          <div className="table-footer">
            <span>{tankers.length} dari {rows.length} RT di plant. Batas holding time {duration(demo.limits.holdingMin)} [asumsi].</span>
            {seePlan ? <Link href="/rencana" className="text-link">Susun ulang antrean<Icon icon={ArrowRight} size={14} /></Link>
              : <Link href="/kedatangan" className="text-link">Jadwal kedatangan<Icon icon={ArrowRight} size={14} /></Link>}
          </div>
        </Card>
        <section className="incident-card" id="peringatan">
          <div className="incident-top">
            <span className="incident-status"><Icon icon={TriangleAlert} size={17} />Rencana shift</span>
            <span className="mono">PLAN-FIFO</span>
          </div>
          <h2>{receivingHeadline(check, demo.decisions, scenarioData.incident)}</h2>
          <div className="incident-time">
            <span><Icon icon={Hourglass} size={15} />Sisa holding time {scenarioData.incident.rt}</span>
            <strong>{duration(Math.max(0, scenarioData.incident.holdingLeftMin))}</strong>
          </div>
          <p className="inverse-muted">
            {scenarioData.incident.summary} {approved ? `Disetujui ${approved.by} pukul ${approved.at}. Koordinator receiving tinggal mengonfirmasi instruksinya.` : "Periksa rencana sebelum RT berikutnya tiba."}
          </p>
          <div className="incident-factors">
            {scenarioData.incident.factors.map(factor => (
              <button key={factor.sourceId} onClick={() => setSource(factor.sourceId)}>
                <FlaskConical size={15} strokeWidth={1.75} aria-hidden />
                {factor.label}
                <ArrowUpRight size={13} aria-hidden />
              </button>
            ))}
          </div>
          <p className="incident-links">Rincian tunggu lab ada di <PageLink href="/lab">Tes Lab</PageLink>{seeBay && <>, dan kondisi bay di <Link href="/tangki">Bay &amp; Tangki</Link></>}.</p>
          <Link href={seePlan ? "/rencana" : seeBay ? "/tangki" : "/lab"} className="button inverse">
            {seePlan ? "Periksa kelayakan rencana" : seeBay ? "Lihat kesiapan bay" : "Buka Tes Lab"}<span className="button-circle"><Icon icon={ArrowUpRight} /></span>
          </Link>
        </section>
      </div>
      <SourceModal id={source} onClose={() => setSource(null)} />
      {dialog === "tiba" && <ArriveDialog onClose={() => setDialog(null)} />}
      {dialog && dialog !== "tiba" && <RtDialog row={dialog.row} action={dialog.action} rows={rows} bayOf={bayOf} onClose={() => setDialog(null)} />}
    </div>
  );
}
