"use client";

import { useState } from "react";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import { literText, persenText, stokText, type BeNeracaHariResp, type BeNeracaList } from "@/lib/api/neraca";
import { Card, SectionTitle } from "@/components/ui";
import { DateField } from "@/components/ui/fields";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const dateText = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso; };

/**
 * Seksi neraca volume harian historis di halaman Transfer & Volume.
 * Data dari GET /api/v1/balance/daily; tanggal dipilih lewat parameter
 * date pada endpoint yang sama. Aturan tampil wajib dari kontrak: stok
 * null tampil sebagai tidak terukur (bukan 0), reject dan sampling adalah
 * susut terukur, dan selisih aliran tidak dilabeli susut karena cakupan
 * pencatatan penerimaan dan output berbeda tahap.
 */
export function NeracaHarianApiCard() {
  const listRes = useResource<BeNeracaList>(API_MODE ? "/balance/daily" : null);
  const [picked, setPicked] = useState("");
  const days = listRes.data?.hari ?? [];
  const tanggal = picked || days.at(-1)?.tanggal || "";
  const detailRes = useResource<BeNeracaHariResp>(API_MODE && tanggal ? `/balance/daily?date=${tanggal}` : null);
  const list = listRes.data;
  const hari = detailRes.data?.hari;
  const metode = detailRes.data?.metode ?? list?.metode;

  return (
    <Card className="rules-card">
      <SectionTitle title="Neraca volume harian (historis)" subtitle={list ? `${list.jendela}. Label data: ${list.label_data}.` : "Agregat harian data historis dari server."} />
      {listRes.error && <p className="crit-text" role="alert">Gagal memuat neraca harian: {listRes.error.message}</p>}
      {!list && !listRes.error && <p className="muted" role="status">Memuat neraca harian…</p>}
      {list && (
        <>
          <div className="schedule-form">
            <label><span className="field-label">Tanggal hari produksi</span>
              <DateField label="Tanggal hari produksi" value={tanggal} onChange={setPicked} initialMonth={list.ringkasan.tanggal_akhir} />
            </label>
          </div>
          {detailRes.error && <p className="crit-text" role="alert">Gagal memuat neraca tanggal ini: {detailRes.error.message}</p>}
          {!hari && !detailRes.error && <p className="muted" role="status">Memuat neraca {dateText(tanggal)}…</p>}
          {hari && (
            <div className="table-wrap"><table className="schedule-table">
              <thead><tr><th>Komponen {dateText(hari.tanggal)}</th><th className="numeric">Volume</th></tr></thead>
              <tbody>
                <tr><td>Susu masuk</td><td data-label="Volume" className="numeric">{literText(hari.masuk_l)}</td></tr>
                <tr><td>Output bagus</td><td data-label="Volume" className="numeric">{literText(hari.output_bagus_l)}</td></tr>
                <tr><td>Reject (susut terukur)</td><td data-label="Volume" className="numeric">{literText(hari.reject_l)}</td></tr>
                <tr><td>Sampling (susut terukur)</td><td data-label="Volume" className="numeric">{literText(hari.sampling_l)}</td></tr>
                <tr><td>Output total</td><td data-label="Volume" className="numeric"><strong>{literText(hari.output_total_l)}</strong></td></tr>
                <tr><td>Stok awal</td><td data-label="Volume" className="numeric">{stokText(hari.stok_awal_l)}</td></tr>
                <tr><td>Stok akhir</td><td data-label="Volume" className="numeric">{stokText(hari.stok_akhir_l)}</td></tr>
                <tr><td>Selisih aliran tercatat<span className="table-sub">Bukan susut: penerimaan mencatat seluruh susu masuk pabrik, sedangkan output tercatat hanya tahap filling, jadi selisih ini adalah kesenjangan cakupan pencatatan.</span></td><td data-label="Volume" className="numeric">{literText(hari.selisih_l)}<span className="table-sub">{persenText(hari.selisih_persen)} dari susu masuk</span></td></tr>
              </tbody>
            </table></div>
          )}
          {hari?.catatan && <p className="small muted">{hari.catatan}</p>}
          <p className="small muted">Rentang data: {dateText(list.ringkasan.tanggal_awal)} sampai {dateText(list.ringkasan.tanggal_akhir)} ({list.ringkasan.jumlah_hari} hari produksi). Total susu masuk {literText(list.ringkasan.total_masuk_l)}, total output {literText(list.ringkasan.total_output_l)}. Stok terukur satu-satunya berasal dari snapshot {dateText(list.stok_snapshot.waktu.slice(0, 10))} pukul 06.00: {literText(list.stok_snapshot.total_l)} pada {list.stok_snapshot.jumlah_tangki} tangki.</p>
          {metode && <p className="small muted">Metode: {metode}</p>}
        </>
      )}
    </Card>
  );
}
