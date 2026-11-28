"use client";

import { useState } from "react";
import { Badge, buttonClass, Card, SectionTitle, Table } from "@/components/ui";
import { TransactionTimeline } from "./transaction-timeline";
import { traceMillis, traceTimestamp } from "@/lib/production-trace";
import { Equipment } from "@/components/trace/equipment";
import type { BeTraceBackward, BeTraceBackwardLot, BeTraceHistoryGroup } from "@/lib/api/trace-historis";

const liter = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)} L`;
const persen = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}%`;
const waktuText = traceTimestamp;
const jamText = (iso: string) => traceTimestamp(iso).split(", ")[1] || traceTimestamp(iso);
const dateText = (iso: string) => traceTimestamp(iso).split(", ")[0];

type TraceNode = BeTraceBackward["nodes"][number];
type TraceStep = BeTraceBackward["steps"][number];

function formatDeltaSeconds(totalSeconds: number): string {
  if (totalSeconds === 0) return "0 menit";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}j` : "", minutes ? `${minutes}m` : "", !hours && seconds ? `${seconds}d` : ""].filter(Boolean).join(" ") || "0m";
}

function stepDelta(prevWaktu: string | undefined, currWaktu: string, index: number): string {
  if (index === 0) return traceMillis(currWaktu) !== null ? "Titik awal" : "—";
  const prev = traceMillis(prevWaktu);
  const curr = traceMillis(currWaktu);
  if (prev === null || curr === null) return "—";
  const diffSec = Math.round((curr - prev) / 1000);
  if (diffSec === 0) return "0 menit";
  return diffSec < 0 ? `-${formatDeltaSeconds(Math.abs(diffSec))}` : `+${formatDeltaSeconds(diffSec)}`;
}

function nodeWindow(node: TraceNode, steps: TraceStep[]): string {
  const extra = node as TraceNode & { waktu?: string; timestamp?: string; window?: string };
  const explicit = extra.window || extra.waktu || extra.timestamp;
  if (explicit) return traceMillis(explicit) !== null ? waktuText(explicit) : explicit;
  const times = steps
    .filter(s => s.dari === node.id || s.ke === node.id)
    .map(s => ({ raw: s.waktu, ms: traceMillis(s.waktu) }))
    .filter((t): t is { raw: string; ms: number } => t.ms !== null)
    .sort((a, b) => a.ms - b.ms);
  if (!times.length) return "Waktu belum tercatat";
  const first = jamText(times[0].raw);
  const last = jamText(times[times.length - 1].raw);
  return first === last ? first : `${first} – ${last}`;
}

function lotTimestamp(lot: BeTraceBackwardLot, steps: TraceStep[]): string | null {
  const extra = lot as BeTraceBackwardLot & { waktu?: string; timestamp?: string; jendela_selesai?: string; end_time?: string; start_time?: string };
  const direct = extra.waktu || extra.timestamp || extra.jendela_selesai || extra.end_time || extra.start_time;
  const matched = direct || steps.find(s => (s.ke === lot.po_id || s.ref === lot.po_id) && traceMillis(s.waktu) !== null)?.waktu;
  return matched ? waktuText(matched) : null;
}

/**
 * Detail telusur group historis (label data historis) di Riwayat Produksi.
 * Semua angka dari GET /trace/history dan /trace/history/backward:
 * ringkasan group, langkah telusur balik, dan komposisi campuran tiap lot
 * apa adanya dari respons BE. Telusur berhenti di batas hulu
 * "Prepared Product Release" karena komposisi hulu tidak tercatat di data.
 */
export function HistorisDetail({ group, detail, loading, error }: {
  group: BeTraceHistoryGroup; detail: BeTraceBackward | null; loading: boolean; error: Error | null;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedStepUrut, setSelectedStepUrut] = useState<number | null>(null);
  const selectedNode = detail?.nodes?.find(n => n.id === selectedNodeId) ?? null;
  const selectedStep = detail?.steps?.find(s => s.urut === selectedStepUrut) ?? null;
  const nodeSteps = selectedNode && detail ? detail.steps.filter(s => s.dari === selectedNode.id || s.ke === selectedNode.id) : [];

  return <>
    <Card className="rp-summary">
      <Equipment kind="Lot" size={52} />
      <div className="rp-summary-main"><span>Group historis terpilih</span><h2>{group.product_name}</h2><span className="mono">{group.group_id}</span></div>
      <dl>
        <div><dt>Selesai produksi</dt><dd>{jamText(group.jendela_selesai)}<small>{dateText(group.jendela_selesai)}</small></dd></div>
        <div><dt>Jumlah output</dt><dd className="rp-big">{liter(group.total.pengisian_l)}<small>{group.jumlah_lot} lot, {group.jumlah_tangki_sfp} tangki persiapan</small></dd></div>
        <div><dt>Asal susu</dt><dd>Prepared Product Release<small>batas hulu data</small></dd></div>
      </dl>
    </Card>
    <TransactionTimeline key={group.group_id} groupId={group.group_id} evidence={detail} />
    {loading && <Card><p className="muted" role="status">Memuat telusur balik {group.group_id}…</p></Card>}
    {error && <Card><p className="crit-text" role="alert">Gagal memuat telusur balik {group.group_id}: {error.message}</p></Card>}
    {detail && <>
      {detail.nodes?.length > 0 && <Card className="rules-card">
        <SectionTitle title="Alur simpul & jendela waktu" subtitle="Klik simpul untuk menyorot detail, jenis, dan waktu langkah terkait." />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: selectedNode ? "14px" : 0 }} role="list" aria-label="Simpul alur historis">
          {detail.nodes.map(node => {
            const active = selectedNodeId === node.id;
            return <button key={node.id} type="button" className={buttonClass(active ? "primary" : "secondary")} style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap", height: "auto", paddingBlock: "8px" }} aria-pressed={active} onClick={() => setSelectedNodeId(prev => prev === node.id ? null : node.id)}>
              <span>{node.label || node.id}</span>
              <Badge tone={active ? "ok" : "neutral"}>{node.jenis}</Badge>
              <span className="small">{nodeWindow(node, detail.steps)}</span>
            </button>;
          })}
        </div>
        {selectedNode && <div className="callout ok" role="region" aria-label={`Detail simpul ${selectedNode.label || selectedNode.id}`}>
          <div>
            <strong>{selectedNode.label || selectedNode.id}</strong> <span className="mono small">({selectedNode.id})</span> · <Badge tone="neutral">{selectedNode.jenis}</Badge>
            <p className="small">Jendela waktu: {nodeWindow(selectedNode, detail.steps)}</p>
            {nodeSteps.length > 0 ? <ul className="small" style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
              {nodeSteps.map(s => <li key={s.urut}>Langkah {s.urut} ({s.tahap}): {waktuText(s.waktu)} · {s.dari} → {s.ke} ({liter(s.volume_l)})</li>)}
            </ul> : <p className="small muted">Belum ada langkah transaksi yang langsung merujuk simpul ini.</p>}
          </div>
        </div>}
      </Card>}
      <Card className="rules-card">
        <SectionTitle title={detail.title} subtitle={`${detail.processing_type} lewat ${group.sterilizer_id} ke ${group.at_tank_id}. Label data: ${detail.label_data}.`} />
        <Table variant="schedule">
          <thead><tr><th>Langkah</th><th>Waktu</th><th>Durasi / delta</th><th>Dari ke</th><th className="numeric">Volume</th><th>Keterangan</th></tr></thead>
          <tbody>{detail.steps.map((s, idx) => {
            const active = selectedStepUrut === s.urut || (selectedNodeId !== null && (s.dari === selectedNodeId || s.ke === selectedNodeId));
            return <tr key={s.urut} onClick={() => setSelectedStepUrut(prev => prev === s.urut ? null : s.urut)} style={{ cursor: "pointer", ...(active ? { background: "var(--color-accent-soft)" } : {}) }} aria-selected={selectedStepUrut === s.urut}>
              <td className="schedule-time">{s.urut}. {s.tahap}<span className="table-sub mono">{s.ref}</span></td>
              <td data-label="Waktu" className="schedule-time">{waktuText(s.waktu)}</td>
              <td data-label="Durasi / delta" className="small">{stepDelta(idx > 0 ? detail.steps[idx - 1]?.waktu : undefined, s.waktu, idx)}</td>
              <td data-label="Dari ke"><strong className="mono">{s.dari}</strong> <span className="muted">ke</span> <strong className="mono">{s.ke}</strong></td>
              <td data-label="Volume" className="numeric">{liter(s.volume_l)}</td>
              <td data-label="Keterangan">{s.keterangan}</td>
            </tr>;
          })}</tbody>
        </Table>
        {selectedStep && <div className="callout ok" role="region" aria-label={`Detail langkah ${selectedStep.urut}`} style={{ marginTop: "12px" }}>
          <div>
            <strong>Langkah {selectedStep.urut}: {selectedStep.tahap}</strong> · <span className="mono">{selectedStep.ref}</span>
            <p className="small">Waktu: {waktuText(selectedStep.waktu)} · Alur: {selectedStep.dari} → {selectedStep.ke} · Volume: {liter(selectedStep.volume_l)}</p>
            {selectedStep.keterangan && <p className="small muted">{selectedStep.keterangan}</p>}
          </div>
        </div>}
        <p className="small muted">{detail.note}</p>
        <p className="small muted">Metode: {detail.metode}</p>
      </Card>
      <Card className="rules-card">
        <SectionTitle title="Komposisi campuran lot" subtitle="Proporsi sumber tangki persiapan per lot, hasil perhitungan model campuran di server dan ditampilkan apa adanya." />
        <Table variant="schedule">
          <thead><tr><th>Lot</th><th className="numeric">Bagus</th><th className="numeric">Reject</th><th className="numeric">Sampling</th><th className="numeric">Total</th><th>Campuran</th></tr></thead>
          <tbody>{detail.lots.map(l => {
            const lotTime = lotTimestamp(l, detail.steps);
            return <tr key={l.po_id}>
              <td><strong className="mono">{l.po_id}</strong><span className="table-sub">{l.sku_id} · Lini {l.line_id}</span>{lotTime && <span className="table-sub">Waktu: {lotTime}</span>}</td>
              <td data-label="Bagus" className="numeric">{liter(l.volume_bagus_l)}</td>
              <td data-label="Reject" className="numeric">{liter(l.volume_reject_l)}</td>
              <td data-label="Sampling" className="numeric">{liter(l.volume_sampling_l)}</td>
              <td data-label="Total" className="numeric"><strong>{liter(l.volume_total_l)}</strong></td>
              <td data-label="Campuran">{l.campuran.map(c => <span key={c.sumber} className="table-sub">{c.sumber}: {persen(c.persen)} ({liter(c.volume_l)})</span>)}</td>
            </tr>;
          })}</tbody>
        </Table>
        <p className="small muted">Total group: persiapan {liter(detail.total.persiapan_l)}, sterilisasi {liter(detail.total.sterilisasi_l)}, pengisian {liter(detail.total.pengisian_l)}. Volume terisi tangki aseptik yang tercatat di data sumber: {liter(detail.at_terisi_tercatat_l)}; angka sterilisasi di atas adalah jumlah seluruh peristiwa sterilisasi. Jumlah pak tidak ditampilkan karena respons telusur balik tidak menyediakannya.</p>
      </Card>
    </>}
  </>;
}
