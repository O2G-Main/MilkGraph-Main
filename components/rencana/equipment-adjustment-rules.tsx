"use client";

import { useState } from "react";
import { Button, Card, SectionTitle, Table } from "@/components/ui";
import { ProductionLines } from "@/components/produksi/production-lines";
import { useResource } from "@/lib/api/resource";

interface Range { key: string; kind: string; min?: number; max?: number; step?: number }
type Schema = { params: Range[] }[];
const value = (number: unknown) => typeof number === "number" && Number.isFinite(number) ? new Intl.NumberFormat("id-ID").format(number) : "Belum tersedia";
const labels: Record<string, string> = { maxTransfer: "Laju transfer maksimum (L/jam)", tankMax: "Level tangki maksimum (%)", cipBuffer: "Jeda CIP (menit)", changeoverMax: "Changeover maksimum" };

export function EquipmentAdjustmentRules() {
  const [open, setOpen] = useState(false);
  const limits = useResource<Record<string, unknown>>(open ? "/limits" : null);
  const schema = useResource<Schema>(open ? "/limits/schema" : null);
  const ranges = Array.isArray(schema.data) ? schema.data.flatMap(group => group.params ?? []).filter(row => row.kind === "range") : [];
  return <>
    <Card>
      <SectionTitle title="Rules penyesuaian alat" subtitle="Tinjau batas operasional dan kompatibilitas sebelum memutuskan rekomendasi." />
      <p className="small muted">Prediksi volume saat ini belum menghitung kapasitas dan speed alat. Batas dan kompatibilitas berikut merupakan referensi konfigurasi untuk meninjau penyesuaian.</p>
      <p className="small muted">Upgrade kapasitas, perubahan speed, dan pemindahan alat perlu memenuhi batas yang diizinkan, kecocokan produk/kemasan, sumber tangki, serta jalur alat. Kelayakan akhir memerlukan validasi server.</p>
      <Button variant="secondary" aria-expanded={open} aria-controls="equipment-adjustment-rules" onClick={() => setOpen(!open)}>{open ? "Tutup rules" : "Lihat rules dari server"}</Button>
      {open && <div id="equipment-adjustment-rules">
        {limits.error || schema.error ? <div role="alert"><p>Gagal memuat rules. Kelayakan penyesuaian belum dapat dipastikan.</p><Button variant="text" onClick={() => { void limits.reload(); void schema.reload(); }}>Coba lagi</Button></div>
        : limits.loading || schema.loading || !limits.data || !schema.data ? <p role="status">Memuat batas operasional…</p>
        : !ranges.length ? <p>Belum ada rentang parameter yang disediakan server.</p>
        : <Table><thead><tr><th>Parameter</th><th>Nilai saat ini</th><th>Rentang diizinkan</th><th>Langkah</th></tr></thead><tbody>{ranges.map(range => <tr key={range.key}><td>{labels[range.key] || range.key}</td><td>{value(limits.data?.[range.key])}</td><td>{value(range.min)}–{value(range.max)}</td><td>{value(range.step)}</td></tr>)}</tbody></Table>}
        <p className="small muted">Rentang ini berlaku pada parameter yang tercantum. Batas speed/kapasitas per alat belum dapat disimpulkan dari spesifikasi nominal saja. Persetujuan rekomendasi mencatat keputusan; pelaksanaan perubahan alat memerlukan dukungan validasi dan penyimpanan dari server.</p>
      </div>}
    </Card>
    {open && <ProductionLines />}
  </>;
}
