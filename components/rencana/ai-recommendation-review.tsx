import { Card, SectionTitle } from "@/components/ui";

/** Selection provenance comes from production recommendations, not traceability chat. */
export function AiRecommendationReview() {
  return <Card>
    <SectionTitle title="Pemilihan rekomendasi AI" subtitle="Backend memilih solusi berdasarkan fakta prediksi batch dan kandidat tindakan yang tersedia." />
    <p className="small muted">Label Dipilih AI berasal dari sumber pilihan Jev pada respons backend. Jika AI tidak tersedia, server memakai aturan cadangan dan menandainya Dipilih aturan BE. Hasil lama yang tidak menyertakan sumber tetap ditandai sumber belum disertakan.</p>
    <p className="small muted">Upgrade kapasitas, kenaikan speed, pemindahan alat/batch, atau pergeseran jadwal perlu ditinjau sesuai penyebab masalah. Prediksi volume belum membuktikan kelayakan waktu dan kapasitas alat; pilihan AI belum merupakan bukti bahwa tindakan akan menghilangkan kekurangan susu.</p>
    <p className="small muted">Keputusan rekomendasi dicatat terpisah. Perubahan konfigurasi alat dan jadwal tidak dijalankan otomatis.</p>
  </Card>;
}
