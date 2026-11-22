/**
 * Tipe respons GET /api/v1/trace/history dan
 * GET /api/v1/trace/history/backward?groupId= (traceability historis).
 * Komposisi campuran adalah keluaran model BE dan ditampilkan apa adanya.
 */
export interface BeTraceHistoryGroup {
  group_id: string;
  product_name: string;
  processing_type: string;
  sterilizer_id: string;
  at_tank_id: string;
  jendela_mulai: string;
  jendela_selesai: string;
  jumlah_tangki_sfp: number;
  jumlah_lot: number;
  total: { persiapan_l: number; sterilisasi_l: number; pengisian_l: number };
}

export interface BeTraceHistory {
  label_data: string;
  sumber: string;
  metode: string;
  kriteria_irisan: string;
  catatan: string[];
  groups: BeTraceHistoryGroup[];
}

export interface BeTraceBackwardLot {
  po_id: string;
  sku_id: string;
  line_id: string;
  volume_bagus_l: number;
  volume_reject_l: number;
  volume_sampling_l: number;
  volume_total_l: number;
  campuran: { sumber: string; volume_l: number; persen: number }[];
}

export interface BeTraceBackward {
  label_data: string;
  group_id: string;
  title: string;
  product_name: string;
  processing_type: string;
  sumber: string;
  metode: string;
  note: string;
  nodes: { id: string; jenis: string; label: string }[];
  edges: { dari: string; ke: string; volume_l: number; lewat?: string; tahap: string }[];
  steps: { urut: number; tahap: string; waktu: string; dari: string; ke: string; volume_l: number; ref: string; keterangan: string }[];
  lots: BeTraceBackwardLot[];
  total: { persiapan_l: number; sterilisasi_l: number; pengisian_l: number };
  at_terisi_tercatat_l: number;
}
