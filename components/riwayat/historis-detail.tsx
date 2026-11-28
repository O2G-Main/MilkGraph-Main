"use client";

import { Card, SectionTitle, Table } from "@/components/ui";
import { TransactionTimeline } from "./transaction-timeline";
import { traceTimestamp } from "@/lib/production-trace";
import { Equipment } from "@/components/trace/equipment";
import type { BeTraceBackward, BeTraceHistoryGroup } from "@/lib/api/trace-historis";

const liter = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)} L`;
const persen = (n: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}%`;
const waktuText = traceTimestamp;
const jamText = (iso: string) => traceTimestamp(iso).split(", ")[1] || traceTimestamp(iso);
const dateText = (iso: string) => traceTimestamp(iso).split(", ")[0];

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
      <Card className="rules-card">
        <SectionTitle title={detail.title} subtitle={`${detail.processing_type} lewat ${group.sterilizer_id} ke ${group.at_tank_id}. Label data: ${detail.label_data}.`} />
        <Table variant="schedule">
          <thead><tr><th>Langkah</th><th>Waktu</th><th>Dari ke</th><th className="numeric">Volume</th><th>Keterangan</th></tr></thead>
          <tbody>{detail.steps.map(s => <tr key={s.urut}>
            <td className="schedule-time">{s.urut}. {s.tahap}<span className="table-sub mono">{s.ref}</span></td>
            <td data-label="Waktu" className="schedule-time">{waktuText(s.waktu)}</td>
            <td data-label="Dari ke"><strong className="mono">{s.dari}</strong> <span className="muted">ke</span> <strong className="mono">{s.ke}</strong></td>
            <td data-label="Volume" className="numeric">{liter(s.volume_l)}</td>
            <td data-label="Keterangan">{s.keterangan}</td>
          </tr>)}</tbody>
        </Table>
        <p className="small muted">{detail.note}</p>
        <p className="small muted">Metode: {detail.metode}</p>
      </Card>
      <Card className="rules-card">
        <SectionTitle title="Komposisi campuran lot" subtitle="Proporsi sumber tangki persiapan per lot, hasil perhitungan model campuran di server dan ditampilkan apa adanya." />
        <Table variant="schedule">
          <thead><tr><th>Lot</th><th className="numeric">Bagus</th><th className="numeric">Reject</th><th className="numeric">Sampling</th><th className="numeric">Total</th><th>Campuran</th></tr></thead>
          <tbody>{detail.lots.map(l => <tr key={l.po_id}>
            <td><strong className="mono">{l.po_id}</strong><span className="table-sub">{l.sku_id} · Lini {l.line_id}</span></td>
            <td data-label="Bagus" className="numeric">{liter(l.volume_bagus_l)}</td>
            <td data-label="Reject" className="numeric">{liter(l.volume_reject_l)}</td>
            <td data-label="Sampling" className="numeric">{liter(l.volume_sampling_l)}</td>
            <td data-label="Total" className="numeric"><strong>{liter(l.volume_total_l)}</strong></td>
            <td data-label="Campuran">{l.campuran.map(c => <span key={c.sumber} className="table-sub">{c.sumber}: {persen(c.persen)} ({liter(c.volume_l)})</span>)}</td>
          </tr>)}</tbody>
        </Table>
        <p className="small muted">Total group: persiapan {liter(detail.total.persiapan_l)}, sterilisasi {liter(detail.total.sterilisasi_l)}, pengisian {liter(detail.total.pengisian_l)}. Volume terisi tangki aseptik yang tercatat di data sumber: {liter(detail.at_terisi_tercatat_l)}; angka sterilisasi di atas adalah jumlah seluruh peristiwa sterilisasi. Jumlah pak tidak ditampilkan karena respons telusur balik tidak menyediakannya.</p>
      </Card>
    </>}
  </>;
}
