/**
 * Product tour MilkGraph: data langkah per halaman + logika pemilihan.
 * Murni data dan fungsi tanpa DOM, supaya bisa dites. Komponen tour
 * (components/tour/product-tour.tsx) menyaring langkah yang jangkarnya
 * (atribut data-tour) benar-benar ada di halaman, jadi langkah untuk
 * elemen yang tidak tampil pada role/mode itu dilewati otomatis.
 */

export interface TourStepDef {
  /** Nilai atribut data-tour pada elemen yang disorot. */
  anchor: string;
  title: string;
  body: string;
}

/** Langkah pembuka yang berlaku di halaman mana pun tour dimulai. */
export const GLOBAL_STEPS: TourStepDef[] = [
  { anchor: "nav", title: "Menu utama", body: "Semua area ada di menu ini: Penerimaan, Operasional, Rencana, Traceability. Menu yang tampil mengikuti role akun." },
  { anchor: "topbar", title: "Shift dan notifikasi", body: "Ganti shift dan cek notifikasi operasional dari sini." },
  { anchor: "assistant", title: "Tanya MilkGraph", body: "Asisten AI. Tanya soal jadwal, PO, atau batch, jawabannya ditulis dari fakta backend." },
  { anchor: "tour-button", title: "Tombol panduan halaman", body: "Panduan bisa diulang kapan saja dari tombol ini, isinya mengikuti halaman yang dibuka." },
];

const BERANDA_EXECUTIVE: TourStepDef[] = [
  { anchor: "kpis", title: "Angka ringkas hari ini", body: "PO terjadwal, susu diterima, dan target produksi dalam satu baris." },
  { anchor: "exec-status", title: "Status lini dan downtime", body: "Mesin filling mana yang jalan dan catatan downtime, berdampingan." },
  { anchor: "exec-radar", title: "Radar Kualitas Jadwal", body: "Lima aspek kualitas jadwal aktif dihitung langsung dari data: pemenuhan PO, ketepatan selesai, utilisasi mesin, kesiapan bahan baku, efisiensi changeover." },
  { anchor: "attention", title: "Perlu perhatian", body: "Yang berisiko muncul duluan di sini, mulai dari PO AT_RISK sampai bahan baku kurang." },
];

const BERANDA_ROLE: TourStepDef[] = [
  { anchor: "kpis", title: "Ringkasan role kamu", body: "Beranda ini khusus role kamu, isinya yang relevan dengan tugas role itu." },
  { anchor: "attention", title: "Perlu perhatian", body: "Daftar yang perlu ditindaklanjuti role kamu hari ini." },
];

const PENJADWALAN: TourStepDef[] = [
  { anchor: "sched-kpis", title: "Ringkasan penjadwalan", body: "Order di shift ini, total target, dan berapa order yang perlu dicek." },
  { anchor: "sched-table", title: "Jadwal produksi", body: "Jadwal per lini dan jam mulai. Status tiap run: belum mulai, jalan, selesai." },
  { anchor: "sched-feasibility", title: "Cek kelayakan rencana", body: "Sebelum jadwal dijalankan, kelayakannya dicek di sini." },
  { anchor: "import-csv", title: "Import CSV", body: "Data PO baru masuk lewat impor CSV, ada pratinjau validasi sebelum disimpan." },
];

const TRANSFER: TourStepDef[] = [
  { anchor: "transfer-neraca", title: "Neraca harian", body: "Susu masuk lawan keluar per hari dari data historis, selisihnya tampil apa adanya." },
  { anchor: "transfer-radar", title: "Radar Kualitas Jadwal", body: "Versi lengkap radar yang sama seperti di Beranda Manager." },
  { anchor: "transfer-tank", title: "Volume tangki terkini", body: "Level tiap tangki setelah semua transfer tercatat." },
  { anchor: "transfer-history", title: "Riwayat transfer", body: "Setiap perpindahan susu tercatat dengan alat asal, tujuan, dan volumenya. Dari sinilah mass balance dihitung." },
];

const RIWAYAT: TourStepDef[] = [
  { anchor: "rp-picker", title: "Pilih output produksi", body: "3.680 grup produksi historis, pilih satu untuk ditelusuri." },
  { anchor: "rp-path", title: "Jalur produksi", body: "Satu batch dibaca ujung ke ujung: dari penerimaan sampai produk jadi." },
  { anchor: "rp-quality", title: "Mutu dan mass balance", body: "Volume masuk dan keluar di tiap tahap dibandingkan, selisihnya terlihat." },
  { anchor: "rp-example", title: "Contoh FG-1013-07", body: "Batch contoh untuk demo telusur, termasuk kasus out-of-spec." },
];

const SIMULASI: TourStepDef[] = [
  { anchor: "sim-canvas", title: "Denah pabrik 3D", body: "Klik area untuk fokus, tombol kaca pembesar untuk lihat seluruh pabrik." },
  { anchor: "sim-scenario", title: "Skenario what-if", body: "Uji perubahan skenario di sini sebelum jadwal diputuskan." },
  { anchor: "sim-bottleneck", title: "Bottleneck", body: "Titik macet produksi kelihatan dari simulasi, bukan ditebak." },
];

const PAGE_STEPS: Record<string, TourStepDef[]> = {
  "/penjadwalan": PENJADWALAN,
  "/transfer": TRANSFER,
  "/riwayat-produksi": RIWAYAT,
  "/trace": RIWAYAT,
  "/simulasi": SIMULASI,
};

/**
 * Daftar langkah untuk satu halaman: langkah global dulu, lalu langkah
 * khusus halaman itu. Beranda dibedakan menurut varian tampilannya:
 * "executive" untuk Manager (Executive Dashboard), "role" untuk role lain.
 * Halaman tanpa daftar khusus hanya mendapat langkah global.
 */
export function tourStepsFor(pathname: string, variant: "executive" | "role"): TourStepDef[] {
  const page = pathname === "/" ? (variant === "executive" ? BERANDA_EXECUTIVE : BERANDA_ROLE) : (PAGE_STEPS[pathname] ?? []);
  return [...GLOBAL_STEPS, ...page];
}

/** Saring langkah yang jangkarnya tersedia; urutan daftar dipertahankan. */
export function filterStepsWithAnchors(steps: TourStepDef[], present: ReadonlySet<string>): TourStepDef[] {
  return steps.filter(s => present.has(s.anchor));
}
