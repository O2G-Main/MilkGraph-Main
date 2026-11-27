"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card, Icon, SectionTitle } from "@/components/ui";
import { useDemo } from "@/lib/demo";
import { API_MODE, type ApiError } from "@/lib/api/client";
import { fmtWaktu, type BeSchedule } from "@/lib/api/contract";
import { useResource } from "@/lib/api/resource";
import type { BeTraceHistory } from "@/lib/api/trace-historis";
import { SCENARIO_DATE } from "@/lib/flows";
import { number } from "@/lib/format";
import { completedOnProductionDate, overlapsProductionDate, productionInstant } from "@/lib/production-date";
import { canSee, type RoleId } from "@/lib/roles";
import { OUTPUTS } from "@/mock/outputs";

const formatTimestamp = (value: string) => fmtWaktu(new Date(productionInstant(value)).toISOString());
const openLink = (href: string, label: string) => <Link href={href} className="text-link">{label}<Icon icon={ArrowRight} size={14} /></Link>;

export function ProductionDay({ date, role }: { date: string; role: RoleId }) {
  const { schedule: demoSchedule } = useDemo();
  const schedule = useResource<BeSchedule>(API_MODE ? "/schedules/latest" : null);
  const history = useResource<BeTraceHistory>(API_MODE ? "/trace/history" : null);
  const noSchedule = (schedule.error as ApiError | null)?.status === 404;
  const runs = (schedule.data?.runs ?? [])
    .filter(run => overlapsProductionDate(run.start, run.end, date))
    .sort((a, b) => productionInstant(a.start) - productionInstant(b.start));
  const marks = (history.data?.groups ?? [])
    .filter(group => completedOnProductionDate(group.jendela_selesai, date))
    .sort((a, b) => productionInstant(a.jendela_selesai) - productionInstant(b.jendela_selesai));
  const localRuns = date === SCENARIO_DATE ? demoSchedule : [];
  const outputs = OUTPUTS.filter(output => output.date === date);
  const canSchedule = canSee(role, "/penjadwalan");
  const canTrace = canSee(role, "/riwayat-produksi");

  return <>
    <Card>
      <SectionTitle title="Jadwal produksi"
        subtitle={API_MODE ? "Run dari jadwal terbaru yang berlangsung pada tanggal terpilih (WIB)." : "Order simulasi sesuai tanggal snapshot."}
        action={canSchedule && openLink("/penjadwalan", "Kelola jadwal dan PO")} />
      {API_MODE ? (
        schedule.error && !noSchedule ? <p className="crit-text" role="alert">Gagal memuat jadwal: {schedule.error.message}</p>
        : schedule.loading && !schedule.data ? <p className="muted" role="status">Memuat jadwal…</p>
        : !runs.length ? <p className="muted">{noSchedule ? "Belum ada jadwal produksi." : "Jadwal terbaru tidak memuat run untuk tanggal ini."}</p>
        : <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>Run / PO</th><th>Produk</th><th>Lini</th><th>Mulai – selesai</th><th className="numeric">Volume run</th></tr></thead>
          <tbody>{runs.map(run => <tr key={run.run_id}>
            <td><strong>{run.run_id}</strong><span className="table-sub">{run.po_id}</span></td>
            <td>{run.sku}</td><td>{run.fm_id}</td><td>{formatTimestamp(run.start)} – {formatTimestamp(run.end)}</td>
            <td className="numeric">{number(run.qty_liter)} L</td>
          </tr>)}</tbody>
        </table></div>
      ) : localRuns.length ? <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Produk</th><th>Lini</th><th>Mulai – selesai</th><th className="numeric">Target</th></tr></thead>
        <tbody>{localRuns.map(run => <tr key={run.id}><td>{run.sku}</td><td>{run.line}</td><td>{run.start} – {run.end}</td>
          <td className="numeric">{number(run.packs)} pak</td></tr>)}</tbody>
      </table></div> : <p className="muted">Tidak ada order simulasi untuk tanggal ini.</p>}
    </Card>

    <Card>
      <SectionTitle title="Hasil produksi"
        subtitle="Output yang selesai pada tanggal terpilih (WIB)."
        action={canTrace && openLink("/riwayat-produksi", "Buka riwayat")} />
      {API_MODE ? (
        history.error ? <p className="crit-text" role="alert">Gagal memuat hasil produksi: {history.error.message}</p>
        : history.loading && !history.data ? <p className="muted" role="status">Memuat hasil produksi…</p>
        : !marks.length ? <p className="muted">Tidak ada kelompok hasil historis untuk tanggal ini.</p>
        : <div className="table-wrap"><table className="schedule-table">
          <thead><tr><th>Produk / Kelompok</th><th>Selesai</th><th className="numeric">Lot</th><th className="numeric">Volume pengisian</th></tr></thead>
          <tbody>{marks.map(group => <tr key={group.group_id}>
            <td><strong>{group.product_name}</strong><span className="table-sub">{canTrace
              ? <Link className="inline-link" href={`/riwayat-produksi?lot=${encodeURIComponent(group.group_id)}`}>{group.group_id}</Link>
              : group.group_id}</span></td>
            <td>{formatTimestamp(group.jendela_selesai)}</td><td className="numeric">{group.jumlah_lot}</td>
            <td className="numeric">{number(group.total.pengisian_l)} L</td>
          </tr>)}</tbody>
        </table></div>
      ) : outputs.length ? <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Produk / Lot</th><th>Selesai</th><th>Lini</th><th className="numeric">Jumlah</th></tr></thead>
        <tbody>{outputs.map(output => <tr key={output.id}>
          <td><strong>{output.product}</strong><span className="table-sub">{output.id}</span></td>
          <td>{output.end ?? "Belum tercatat"}</td><td>{output.line}</td><td className="numeric">{number(output.packs)} pak</td>
        </tr>)}</tbody>
      </table></div> : <p className="muted">Tidak ada hasil simulasi untuk tanggal ini.</p>}
    </Card>
    {!API_MODE && <div><Badge>Data simulasi</Badge></div>}
  </>;
}
