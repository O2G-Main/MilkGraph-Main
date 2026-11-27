/** Presentation only: never use these labels as API identifiers or form values. */
const labels: Record<string,string> = {
  large_a:"Ukuran besar A",large_b:"Ukuran besar B",esl_320:"ESL 320 ml",exp:"Ekspor",local:"Lokal",
  fulfilled:"Terpenuhi",on_track:"Sesuai rencana",at_risk:"Berisiko",late:"Terlambat",not_fulfilled:"Tidak terpenuhi",
  tidak_terpenuhi:"Tidak terpenuhi",data_tidak_cukup:"Data tidak cukup",upgrade_kapasitas:"Upgrade kapasitas",naikkan_speed:"Naikkan kecepatan",pindahkan_alat:"Pindahkan alat",geser_jadwal:"Geser jadwal",
  user_input:"Input pengguna",user_action:"Tindakan pengguna",manual_input:"Input manual",planned_maintenance:"Perawatan terencana",unplanned_maintenance:"Perawatan tidak terencana",
  current_status:"Status terakhir",current_status_source:"Sumber status",current_status_reason:"Keterangan status",current_status_observed_at:"Waktu catatan status",
  capacity_l:"Kapasitas (L)",speed_packph:"Kecepatan kemasan (pak/jam)",process_speed_lph:"Kecepatan proses (L/jam)",holding_time_limit_hours:"Batas holding time (jam)",cip_duration_minutes:"Durasi CIP (menit)",
  batch_id:"ID batch",asset_id:"ID alat",source_asset_id:"Alat asal",destination_asset_id:"Alat tujuan",transaction_id:"ID transaksi",production_date:"Tanggal produksi",finished_sku_id:"SKU produk jadi",pack_size_code:"Ukuran kemasan",market_variant:"Varian pasar",
  draft:"Draf",accepted:"Diterima",rejected:"Ditolak",applied:"Ditandai diterapkan",
};
export function displayToken(value:string):string {
  const mapped=labels[value.toLowerCase()];if(mapped)return mapped;
  if(!value.includes("_"))return value;
  return value.replace(/_+/g," ").replace(/\s+/g," ").trim().replace(/^./,letter=>letter.toUpperCase());
}
export function displayText(value:string):string {
  if(/^\s*_+\s*$/.test(value))return "Belum tersedia";
  if(/^(?:null|undefined|n\/a|x)$/i.test(value.trim()))return "Belum tersedia";
  return value.replace(/https?:\/\/[^\s]+|www\.[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|\b[A-Za-z][A-Za-z0-9]*(?:[-_]+[A-Za-z0-9]+)*\b/g,token=>{
    if(/^(?:https?:\/\/|www\.)/.test(token)||token.includes("@")||token.includes("-"))return token;
    return displayToken(token);
  });
}
