/**
 * Tipe dan helper tampilan untuk GET /api/v1/balance/daily (neraca volume
 * harian historis). Angka selalu dari respons BE; modul ini hanya memformat.
 * Aturan tampil dari kontrak: stok null berarti tidak terukur di paket data
 * (bukan nol), reject dan sampling adalah susut terukur, dan selisih adalah
 * selisih aliran tercatat yang tidak boleh dilabeli susut.
 */
export interface BeNeracaHari {
  tanggal: string;
  masuk_l: number;
  output_bagus_l: number;
  reject_l: number;
  sampling_l: number;
  output_total_l: number;
  stok_awal_l: number | null;
  stok_akhir_l: number | null;
  selisih_l: number;
  selisih_persen: number;
  kualitas_data: string;
  catatan?: string;
}

export interface BeNeracaRingkasan {
  tanggal_awal: string;
  tanggal_akhir: string;
  jumlah_hari: number;
  total_masuk_l: number;
  total_output_bagus_l: number;
  total_reject_l: number;
  total_sampling_l: number;
  total_output_l: number;
  total_selisih_l: number;
  selisih_persen_total: number;
}

export interface BeNeracaList {
  label_data: string;
  sumber: string;
  jendela: string;
  metode: string;
  stok_snapshot: { waktu: string; total_l: number; jumlah_tangki: number; per_tipe_l: Record<string, number> };
  ringkasan: BeNeracaRingkasan;
  hari: BeNeracaHari[];
}

export interface BeNeracaHariResp {
  label_data: string;
  jendela: string;
  metode: string;
  hari: BeNeracaHari;
}

const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

/** Stok yang tidak terukur tampil sebagai teks, tidak pernah sebagai 0 L. */
export function stokText(v: number | null): string {
  return v === null ? "tidak terukur" : `${fmt(v)} L`;
}

export function literText(v: number): string {
  return `${fmt(v)} L`;
}

export function persenText(v: number): string {
  return `${fmt(v)}%`;
}
