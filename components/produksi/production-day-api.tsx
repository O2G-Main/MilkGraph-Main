"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, Icon, SectionTitle } from "@/components/ui";
import { useResource } from "@/lib/api/resource";
import type { ProductionDaily, ProductionList, ProductionScheduleRow, ProductionSession } from "@/lib/api/production";
import { number } from "@/lib/format";
import { ProductionBatchForm } from "./production-batch-form";
import { ProductionHistory } from "./production-history";

const target = (value: number | null, unit: string) => value === null ? "–" : `${number(value)} ${unit}`;

export function ProductionDayApi({ date, role }: { date: string; role: string }) {
  const query = `?date=${encodeURIComponent(date)}`;
  const daily = useResource<ProductionDaily>(`/production/daily${query}`);
  const schedule = useResource<ProductionList<ProductionScheduleRow>>(`/production/schedule${query}`);
  const session = useResource<ProductionSession>("/session");
  const canCreate = session.data?.role === role && session.data.permissions.includes("plan.decide");
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);
  const batches = daily.data?.batches ?? [];
  const lines = schedule.data?.items ?? [];

  return <>
    <Card>
      <SectionTitle title="Batch produksi" subtitle="Target dan status batch dari backend untuk tanggal terpilih."
        action={canCreate && <button className="button primary" onClick={() => { setAdding(true); setSaved(false); }}><Icon icon={Plus} size={16} />Buat batch</button>} />
      {saved && <p className="ok-text" role="status">Batch produksi berhasil dibuat.</p>}
      {daily.error ? <p className="crit-text" role="alert">Gagal memuat batch: {daily.error.message}</p>
      : daily.loading && !daily.data ? <p className="muted" role="status">Memuat batch…</p>
      : !batches.length ? <p className="muted">Belum ada batch untuk tanggal ini.</p>
      : <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Batch</th><th>Produk</th><th>Lini</th><th>Target</th><th>Status</th><th>Pemenuhan</th></tr></thead>
        <tbody>{batches.map(row => <tr key={`${row.batch_id}:${row.line_no ?? ""}`}>
          <td><strong>{row.batch_code}</strong><span className="table-sub">{row.batch_id}</span></td>
          <td>{row.product_name ?? row.finished_sku_id ?? "–"}<span className="table-sub">{row.production_order_id}</span></td>
          <td>{row.filling_line_id ?? "–"}</td><td>{target(row.target_volume_l, "L")}</td><td>{row.batch_status}</td>
          <td>{row.fulfill_status?.replaceAll("_", " ") ?? "–"}{row.risk_reason && <span className="table-sub">{row.risk_reason}</span>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>

    <Card>
      <SectionTitle title="Jadwal produksi" subtitle="Urutan produksi per batch dan lini sebagaimana tersimpan di backend." />
      {schedule.error ? <p className="crit-text" role="alert">Gagal memuat jadwal: {schedule.error.message}</p>
      : schedule.loading && !schedule.data ? <p className="muted" role="status">Memuat jadwal…</p>
      : !lines.length ? <p className="muted">Belum ada jadwal untuk tanggal ini.</p>
      : <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Urutan</th><th>Batch / SKU</th><th>Lini</th><th>Tangki aseptik</th><th>Sterilizer</th><th>Target</th></tr></thead>
        <tbody>{lines.map(row => <tr key={`${row.batch_id}:${row.line_no ?? ""}`}>
          <td>{row.sequence_no}</td><td>{row.batch_code}<span className="table-sub">{row.finished_sku_id}</span></td>
          <td>{row.filling_line_id ?? "–"}</td><td>{row.aseptic_tank_id ?? "–"}</td><td>{row.sterilizer_id ?? "–"}</td>
          <td>{target(row.target_volume_l, "L")}{row.target_packs !== null && <span className="table-sub">{target(row.target_packs, "pak")}</span>}</td>
        </tr>)}</tbody>
      </table></div>}
    </Card>

    <ProductionHistory date={date} role={role} />
    {adding && canCreate && <ProductionBatchForm date={date} role={role} onClose={() => setAdding(false)}
      onSaved={() => { setAdding(false); setSaved(true); }} />}
  </>;
}
