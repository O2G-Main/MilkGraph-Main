import { Card, SectionTitle } from "@/components/ui";

/** The current BE assistant supplies traceability facts, not facts for these production batches. */
export function AiRecommendationReview() {
  return <Card>
    <SectionTitle title="Analisis AI untuk batch produksi" subtitle="Analisis ini belum tersedia untuk batch produksi yang dipilih." />
    <p className="small muted">Asisten yang terhubung saat ini memakai konteks traceability. Perbandingan upgrade, perubahan speed, dan pemindahan alat membutuhkan konteks produksi serta validasi kelayakan yang belum disediakan layanan ini.</p>
    <p className="small muted">Tinjau rekomendasi yang tersimpan dari server. Keputusan belum otomatis menjalankan perubahan alat atau jadwal.</p>
  </Card>;
}
