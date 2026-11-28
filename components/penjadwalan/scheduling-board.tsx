"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, Card, Icon, SectionTitle } from "@/components/ui";
import type { ProductionScheduleRow } from "@/lib/api/production";
import { uniqueSchedule } from "@/lib/scheduling";
import { SchedulingDetail } from "./scheduling-detail";
import styles from "./scheduling.module.css";

export function SchedulingBoard({ rows, loading, error, onRetry, date, role }: {
  rows: ProductionScheduleRow[]; loading: boolean; error: Error | null; onRetry: () => void; date: string; role: string;
}) {
  const [picked, setPicked] = useState<ProductionScheduleRow | null>(null);
  const groups = new Map<string, ProductionScheduleRow[]>();
  for (const row of uniqueSchedule(rows)) {
    const line = row.filling_line_id || "Lini belum ditentukan";
    groups.set(line, [...(groups.get(line) ?? []), row]);
  }
  return <Card>
    <SectionTitle title="Jadwal harian" subtitle={`${date} WIB · Pilih batch untuk melihat alat dan pemenuhannya.`} />
    {error ? <div role="alert"><p className="crit-text">Gagal memuat jadwal: {error.message}</p><Button variant="text" onClick={onRetry}>Coba lagi</Button></div>
    : loading ? <p role="status" className={styles.empty}>Memuat jadwal produksi…</p>
    : !rows.length ? <div className={styles.empty}><h3>Belum ada jadwal pada tanggal ini</h3><p>Gunakan Susun jadwal untuk membuat batch pada tanggal terpilih.</p></div>
    : <div className={styles.lines}>{[...groups].map(([line, items]) => <section className={styles.line} key={line} aria-label={`Jadwal ${line}`}>
      <header><h3>{line}</h3><span className="small muted">{items.length} baris produksi</span></header>
      <ul className={styles.batches}>{items.map((row, index) => <li key={`${row.batch_id}:${row.line_no}:${index}`}>
        <button className={styles.batch} onClick={() => setPicked(row)}>
          <span className={styles.order}>{row.sequence_no}</span>
          <span className={styles.product}><strong>{row.finished_sku_id || "Produk belum ditentukan"}</strong><small>{row.batch_code} · {row.production_order_id || "PO belum dihubungkan"}</small></span>
          <span className={styles.volume}>{row.target_volume_l === null ? "Target belum tersedia" : `${new Intl.NumberFormat("id-ID").format(row.target_volume_l)} L`}<small>{row.status}</small></span>
          <Icon icon={ChevronRight} size={16} />
        </button>
      </li>)}</ul>

    </section>)}</div>}
    {picked && <SchedulingDetail row={picked} role={role} onClose={() => setPicked(null)} />}
  </Card>;
}
