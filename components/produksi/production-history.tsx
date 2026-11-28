"use client";

import Link from "next/link";
import { Card, SectionTitle, Table } from "@/components/ui";
import { useResource } from "@/lib/api/resource";
import type { BeTraceHistory } from "@/lib/api/trace-historis";
import { number } from "@/lib/format";
import { completedOnProductionDate } from "@/lib/production-date";
import { canSee, type RoleId } from "@/lib/roles";

export function ProductionHistory({ date, role }: { date: string; role: RoleId }) {
  const history = useResource<BeTraceHistory>("/trace/history");
  const canTrace = canSee(role, "/riwayat-produksi");
  const groups = (history.data?.groups ?? []).filter(group => completedOnProductionDate(group.jendela_selesai, date));

  return <Card>
    <SectionTitle title="Hasil produksi" subtitle="Kelompok hasil historis yang selesai pada tanggal terpilih (WIB)." />
    {history.error ? <p role="alert" className="crit-text">Gagal memuat hasil: {history.error.message}</p>
    : history.loading && !history.data ? <p role="status" className="muted">Memuat hasil produksi…</p>
    : !groups.length ? <p className="muted">Belum ada hasil historis untuk tanggal ini.</p>
    : <Table variant="schedule">
      <thead><tr><th>Produk / kelompok</th><th>Lot</th><th>Volume pengisian</th></tr></thead>
      <tbody>{groups.map(group => <tr key={group.group_id}>
        <td><strong>{group.product_name}</strong><span className="table-sub">{canTrace
          ? <Link href={`/riwayat-produksi?lot=${encodeURIComponent(group.group_id)}`}>{group.group_id}</Link>
          : group.group_id}</span></td>
        <td>{group.jumlah_lot}</td><td>{number(group.total.pengisian_l)} L</td>
      </tr>)}</tbody>
    </Table>}
  </Card>;
}
