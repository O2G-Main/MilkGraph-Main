"use client";

import { Button, Card, PageHeading, PageLink, SectionTitle, Table } from "@/components/ui";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";

interface MasterSummary { source: string; status: string; numericalPlanningReady: boolean; totalTables: number; tables: Record<string, number> }
const sections = [
  { href: "/produk", title: "Master Produk", detail: "Produk, varian rasa, ukuran kemasan, pasar, dan finished SKU." },
  { href: "/alat", title: "Alat", detail: "Spesifikasi Greenfields, status terakhir, dan riwayat downtime." },
  { href: "/produksi", title: "Alur dan konfigurasi lini", detail: "Topologi pabrik, rute, dedikasi lini, dan kompatibilitas SKU." },
  { href: "/aturan-produksi", title: "Aturan Produksi", detail: "Changeover, CIP, constraint, dan definisi satuan." },
];

export function MasterDirectory() {
  const summary = useResource<MasterSummary>(API_MODE ? "/master" : null);
  return <div className="page-enter production-stack">
    <PageHeading title="Data induk" subtitle="Data master ditempatkan di halaman sesuai fungsinya. Pilih bagian yang ingin diperiksa." />
    <Card><SectionTitle title="Buka data sesuai jenisnya" /><ul className="attention-list">{sections.map(section => <li key={section.href}><PageLink className="attention-item" href={section.href}><span className="attention-copy"><strong>{section.title}</strong><span>{section.detail}</span></span><span aria-hidden="true">→</span></PageLink></li>)}</ul></Card>
    <Card><SectionTitle title="Sumber dan integritas dataset" subtitle="Ringkasan mengikuti respons backend; tidak menggunakan status valid bawaan." />
      {!API_MODE ? <p className="muted">Mode simulasi lokal. Ringkasan dataset tersedia saat mode API diaktifkan.</p>
      : summary.error ? <div role="alert"><p className="crit-text">Gagal memuat sumber dataset: {summary.error.message}</p><Button variant="secondary" onClick={() => void summary.reload()}>Coba lagi</Button></div>
      : !summary.data ? <p className="muted" role="status">Memuat sumber dataset…</p>
      : <><p><strong>{summary.data.source}</strong></p><p className="small muted">Status: {summary.data.status}. Kesiapan perencanaan numerik: {summary.data.numericalPlanningReady ? "tersedia" : "belum tersedia"}.</p><Table variant="schedule"><thead><tr><th>Tabel master</th><th>Jumlah baris</th></tr></thead><tbody>{Object.entries(summary.data.tables).map(([table, count]) => <tr key={table}><td>{table}</td><td>{count}</td></tr>)}</tbody></Table></>}
    </Card>
  </div>;
}
