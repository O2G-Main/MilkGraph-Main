"use client";

import { useRef, useState } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { apiSend } from "@/lib/api/client";
import { sourceText, type ChatReply } from "@/lib/api/contract";
import type { ProductionRecommendation } from "@/lib/api/planning";

export function AiRecommendationReview({ date, batch, rows, role }: { date: string; batch: string; rows: ProductionRecommendation[]; role: string | null }) {
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const candidates = rows.filter(row => row.production_date === date && (!batch || row.batch_id === batch) && row.status !== "rejected");
  async function ask() {
    if (lock.current || !role || !date || !candidates.length || candidates.length > 20) return;
    lock.current = true; setBusy(true); setError(null); setReply(null);
    try {
      const ids = candidates.slice(0, 20).map(row => `#${row.id} ${row.recommendation_type}`).join(", ");
      const question = `Evaluasi solusi terbaik untuk produksi tanggal ${date}, batch ${batch || "semua"}. Kandidat dari BE: ${ids}. Bandingkan upgrade kapasitas, naikkan speed, atau pindahkan alat hanya jika tersedia pada kandidat. Gunakan fakta BE, limits dan kompatibilitas. Jelaskan pilihan, alasan, trade-off, rules yang harus dipenuhi, dan sumber. Jangan samakan expected_gain yang satuannya belum diketahui atau mengklaim perubahan sudah diterapkan. Bila data tidak cukup, nyatakan tidak bisa memilih solusi terbaik.`;
      if (question.length > 1000) throw new Error("Konteks terlalu panjang. Pilih satu batch dengan kandidat yang lebih sedikit.");
      const result = await apiSend<ChatReply>("POST", "/assistant/chat", { question }, role);
      if (!result || typeof result.jawaban !== "string" || !result.jawaban.trim()) throw new Error("Asisten belum mengembalikan analisis yang dapat dibaca.");
      setReply(result);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Card>
    <SectionTitle title="Analisis solusi oleh AI" subtitle="Minta asisten server membandingkan kandidat berdasarkan fakta dan rules yang tersedia." />
    <button className="button secondary" disabled={busy || !role || !date || !candidates.length || candidates.length > 20} onClick={() => void ask()}>{busy ? "Meminta analisis…" : "Minta rekomendasi terbaik dari AI"}</button>
    {!candidates.length && <p className="small muted">Analisis tersedia setelah server menghasilkan kandidat rekomendasi untuk pilihan ini.</p>}
    {candidates.length > 20 && <p className="small muted">Pilih batch yang lebih spesifik untuk membandingkan maksimal 20 kandidat dalam satu analisis.</p>}
    {error && <p role="alert" className="crit-text">Analisis AI belum tersedia: {error}. Kandidat BE tetap dapat ditinjau.</p>}
    {reply && <div role="status"><p style={{ whiteSpace: "pre-wrap" }}>{reply.jawaban}</p><p className="small muted">Sumber: {sourceText(reply.sumber) || "Belum disertakan asisten"}{reply.label_data ? ` · ${reply.label_data}` : ""}</p></div>}
    <p className="small muted">Analisis merupakan saran. Peringkat terstruktur dan kelayakan penerapan tetap memerlukan dukungan validasi server.</p>
  </Card>;
}
