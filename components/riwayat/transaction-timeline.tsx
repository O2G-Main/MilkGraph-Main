"use client";

import { useState } from "react";
import { ArrowRight, Clock3 } from "lucide-react";
import { Badge, Card, Icon, Modal, SectionTitle, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import type { BeTraceBackward } from "@/lib/api/trace-historis";
import { useResource } from "@/lib/api/resource";
import { distinctTraceEvents, orderTraceEvents, traceAssetIds, traceDuration, traceMillis, traceTimestamp, type ProductionTrace, type ProductionTraceEvent } from "@/lib/production-trace";
import styles from "./transaction-timeline.module.css";

const sourceLabel = (value: string) => ({processing:"Proses",filling:"Filling"}[value] ?? value);
const amount = (value: number | null | undefined, unit: string) => typeof value === "number" && Number.isFinite(value) ? `${new Intl.NumberFormat("id-ID",{maximumFractionDigits:2}).format(value)} ${unit}` : "Belum tercatat";
const routeText = (event: ProductionTraceEvent) => `${event.source_asset_id || "Asal belum tercatat"} → ${event.destination_asset_id || "Tujuan belum tercatat"}`;
export function TransactionTimeline({groupId,evidence}:{groupId:string;evidence?:BeTraceBackward|null}) {
  const resource=useResource<ProductionTrace>(`/production/trace?production_group_id=${encodeURIComponent(groupId)}`);
  const [limit,setLimit]=useState(12);
  const [direction,setDirection]=useState<"forward"|"backward">("forward");
  const [asset,setAsset]=useState("");
  const [source,setSource]=useState("");
  const [picked,setPicked]=useState<ProductionTraceEvent|null>(null);
  const valid=resource.data?.production_group_id===groupId&&Array.isArray(resource.data.events)&&Array.isArray(resource.data.incomplete_sections);
  const events=valid?distinctTraceEvents(resource.data!.events):[];
  const filtered=orderTraceEvents(events.filter(event=>(!asset||traceAssetIds(event).includes(asset))&&(!source||event.trace_source===source)),direction==="backward");
  const assets=[...new Set(events.flatMap(traceAssetIds))].sort();
  const sources=[...new Set(events.map(event=>event.trace_source))].sort();
  const duplicates=valid?resource.data!.events.length-events.length:0;
  return <Card>
    <SectionTitle title="Detail alur & waktu transaksi" subtitle="Ikuti transaksi tercatat pada group ini, termasuk proses, filling, CIP, dan waktu tunggu yang tersedia di backend. Semua waktu menggunakan WIB."
      action={<button className="button secondary" disabled={resource.loading} onClick={()=>{setPicked(null);void resource.reload();}}>Muat ulang transaksi</button>} />
    {resource.error ? <div role="alert"><p className="crit-text">Transaksi belum dapat dimuat: {resource.error.message}</p><button className="button secondary" onClick={()=>void resource.reload()}>Coba lagi</button></div>
    :!resource.data?<p role="status" className="muted">Memuat alur dan waktu transaksi…</p>
    :!valid?<p role="alert" className="crit-text">Data transaksi belum cocok dengan group yang dipilih.</p>
    :<>
      <div className={styles.filters}>
        <Toggle label="Arah penelusuran transaksi" value={direction} onChange={value=>{setDirection(value);setLimit(12);}} options={[{value:"forward",label:"Awal ke akhir"},{value:"backward",label:"Telusur balik"}]} />
        <label><span className="field-label">Alat / titik alur</span><Select label="Filter alat pada transaksi" value={asset} onChange={value=>{setAsset(value);setLimit(12);}} options={[{value:"",label:"Semua alat / titik"},...assets.map(id=>({value:id,label:id}))]} /></label>
        <label><span className="field-label">Sumber transaksi</span><Select label="Filter sumber transaksi" value={source} onChange={value=>{setSource(value);setLimit(12);}} options={[{value:"",label:"Semua sumber"},...sources.map(value=>({value,label:sourceLabel(value)}))]} /></label>
      </div>
      <p className="small muted">Menampilkan {Math.min(limit,filtered.length)} dari {filtered.length} transaksi sesuai filter · {events.length} transaksi unik dalam group{duplicates?` · ${duplicates} salinan identik dari relasi batch digabung`:""}. Waktu proses bisa tumpang tindih; durasi tiap transaksi tidak dijumlahkan sebagai lama produksi.</p>
      {resource.data!.incomplete_sections.length>0&&<p role="status" className={styles.notice}>Bagian data belum lengkap: {resource.data!.incomplete_sections.map(value=>({processing_transactions:"transaksi proses",filling_transactions:"transaksi filling"}[value]??value)).join(", ")}. Alur yang belum tercatat tidak direka sebagai kejadian.</p>}
      {!events.length?<p className="muted">Belum ada transaksi rinci yang tercatat untuk group ini. Ringkasan historis tetap tersedia.</p>
      :!filtered.length?<p className="muted">Tidak ada transaksi yang cocok dengan filter ini.</p>
      :<ol className={styles.timeline} aria-label="Urutan waktu transaksi produksi">{filtered.slice(0,limit).map((event,index)=>{
        const start=traceMillis(event.start_time),end=traceMillis(event.end_time);
        const inconsistent=start!==null&&end!==null&&end<start;
        return <li key={`${event.trace_source}:${event.transaction_id}:${event.machine_id}:${event.start_time}:${index}`}>
          <div className={styles.time}><Icon icon={Clock3} size={16}/><span><time dateTime={start===null?undefined:event.start_time!}>{traceTimestamp(event.start_time)}</time><small>{traceDuration(event)}</small></span></div>
          <button className={styles.event} onClick={()=>setPicked(event)} aria-label={`Detail transaksi ${event.transaction_id||"tanpa ID"}, ${event.activity||"aktivitas belum tercatat"}`}>
            <div className={styles.eventHeader}><strong>{event.activity||"Aktivitas belum tercatat"}</strong><Badge tone={inconsistent?"warn":"neutral"}>{sourceLabel(event.trace_source)}</Badge></div>
            <p>{routeText(event)}</p>
            <span className="small muted">Alat: {event.machine_id||"Belum tercatat"} · Selesai: {event.end_time?traceTimestamp(event.end_time):"Belum tercatat"}</span>
            <span className={styles.eventFooter}><span className="small muted">{event.transaction_id||"ID belum tercatat"}</span><span className={styles.detailLabel}>Detail kejadian <Icon icon={ArrowRight} size={14}/></span></span>
          </button>
        </li>;
      })}</ol>}
      {filtered.length>limit&&<button className={`button secondary ${styles.more}`} onClick={()=>setLimit(value=>value+12)}>Tampilkan {Math.min(12,filtered.length-limit)} transaksi berikutnya ({Math.min(limit,filtered.length)} dari {filtered.length})</button>}
      <p className={`small muted ${styles.scope}`}>Detail ini memakai transaksi untuk group {groupId}. Satu transaksi dapat terkait beberapa batch; identitas batch tunggal dari ringkasan API tidak dianggap mewakili seluruh group. Rekonstruksi campuran dan proporsi lot tetap mengikuti model historis di bawah.</p>
    </>}
    {picked&&<TransactionDetail event={picked} groupId={groupId} evidence={evidence} onClose={()=>setPicked(null)}/>}
  </Card>;
}
function TransactionDetail({event,groupId,evidence,onClose}:{event:ProductionTraceEvent;groupId:string;evidence?:BeTraceBackward|null;onClose:()=>void}) {
  const related=evidence?.group_id===groupId?evidence.steps.filter(step=>!!event.transaction_id&&step.ref===event.transaction_id):[];
  const facts=[
    ["Group produksi",groupId],["Sumber transaksi",sourceLabel(event.trace_source)],
    ["ID transaksi",event.transaction_id||"Belum tercatat"],["Aktivitas",event.activity||"Belum tercatat"],
    ["Alat pencatat",event.machine_id||"Belum tercatat"],["Mulai",traceTimestamp(event.start_time)],
    ["Selesai",traceTimestamp(event.end_time)],["Durasi transaksi",traceDuration(event)],
    ["Dari",event.source_asset_id||"Belum tercatat"],["Ke",event.destination_asset_id||"Belum tercatat"],
    ["Volume proses",amount(event.volume_l,"L")],["Volume output",amount(event.output_volume_l,"L")],
    ["Output bagus",amount(event.output_good_packs,"pak")],["Downtime / keterangan",event.downtime_type||"Tidak dicantumkan pada transaksi ini"],
  ];
  return <Modal title={`Detail transaksi ${event.transaction_id||"tanpa ID"}`} onClose={onClose}>
    <p className="small muted">Waktu dan nilai ditampilkan dari catatan backend, termasuk nilai nol. Waktu kosong tidak diartikan sebagai proses sedang berjalan.</p>
    <dl className={styles.facts}>{facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {related.length>0&&<section className={styles.related}><h3>Kaitan telusur historis</h3><p className="small muted">Dicocokkan berdasarkan ID transaksi yang sama pada rekonstruksi backend.</p><ul>{related.map(step=><li key={step.urut}>{step.dari} → {step.ke} · {amount(step.volume_l,"L")}</li>)}</ul></section>}
    <div className="dialog-actions"><button className="button secondary" onClick={onClose}>Tutup</button></div>
  </Modal>;
}
