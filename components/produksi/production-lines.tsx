"use client";

import { useState } from "react";
import { Button, Card, SectionTitle, Table } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { useResource } from "@/lib/api/resource";

interface LineDedication { line_id: string; allowed_sku_ids: string; pack_size_codes: string; source_aseptic_tank_id: string; speed_packph: string }
interface FinishedCompatibility { line_id: string; finished_sku_id: string; liquid_sku_id: string; pack_size_code: string; market_variant: string; eligible: string }
interface LineData { dedications: LineDedication[]; finishedCompatibility: FinishedCompatibility[]; productCompatibility: { line_id: string; sku_id: string; pack_size_code: string; eligible: string }[] }

export function ProductionLines() {
  const lines = useResource<LineData>("/master/lines");
  const [selected, setSelected] = useState("");
  const shown = (lines.data?.dedications ?? []).filter(line => !selected || line.line_id === selected);
  const compatibility = (lines.data?.finishedCompatibility ?? []).filter(line => !selected || line.line_id === selected);
  return <>
    <Card data-tour="production-lines">
      <SectionTitle title="Konfigurasi lini" subtitle="Dedikasi, sumber tangki aseptik, dan kompatibilitas dari master Greenfields." />
      {lines.error ? <div role="alert"><p className="crit-text">Gagal memuat konfigurasi lini: {lines.error.message}</p><Button variant="secondary" onClick={() => void lines.reload()}>Coba lagi</Button></div>
      : !lines.data ? <p className="muted" role="status">Memuat konfigurasi lini…</p>
      : <>
        <label className="schedule-form production-search"><span className="field-label">Lini produksi</span><Select label="Filter lini produksi" value={selected} onChange={setSelected} options={[{ value: "", label: "Semua lini" }, ...lines.data.dedications.map(line => ({ value: line.line_id, label: line.line_id }))]} /></label>
        <Table variant="schedule"><thead><tr><th>Lini</th><th>Tangki sumber</th><th>Produk</th><th>Ukuran kemasan</th><th>Kecepatan (pak/jam)</th></tr></thead><tbody>{shown.map(line => <tr key={line.line_id}><td><strong>{line.line_id}</strong></td><td>{line.source_aseptic_tank_id || "Belum tersedia"}</td><td>{line.allowed_sku_ids.split(";").join(", ")}</td><td>{line.pack_size_codes.split(";").join(", ")}</td><td>{line.speed_packph || "Belum tersedia"}</td></tr>)}</tbody></Table>
        {!shown.length && <p className="muted">Konfigurasi lini belum tersedia.</p>}
      </>}
    </Card>
    {lines.data && <Card>
      <SectionTitle title="Kompatibilitas finished SKU" subtitle={`${compatibility.length} relasi SKU pada lini terpilih. Nilai kelayakan mengikuti master backend.`} />
      {!compatibility.length ? <p className="muted">Belum ada kompatibilitas SKU untuk lini ini.</p> : <Table variant="schedule"><thead><tr><th>Lini</th><th>Finished SKU</th><th>Produk</th><th>Kemasan</th><th>Pasar</th><th>Eligible</th></tr></thead><tbody>{compatibility.map(line => <tr key={`${line.line_id}:${line.finished_sku_id}`}><td>{line.line_id}</td><td>{line.finished_sku_id}</td><td>{line.liquid_sku_id}</td><td>{line.pack_size_code}</td><td>{line.market_variant}</td><td>{line.eligible}</td></tr>)}</tbody></Table>}
    </Card>}
  </>;
}
