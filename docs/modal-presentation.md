# Standar seluruh modal konten

Semua pemakaian `Modal` bersama (49 lokasi saat audit) menggunakan satu lebar: `min(720px, 100vw - 32px)`. Override lebar pada modal graph, laporan, lab, jadwal, tools/target mingguan, dan detail alat dihapus. Padding bersama 24 px pada desktop dan 16 px pada ponsel, permukaan putih dari token aplikasi, tinggi dibatasi viewport, isi dapat digulir, dan judul/tombol tutup tetap terlihat. Tabel tetap memakai area gulirnya sendiri bila dibutuhkan.

`lib/display-text.ts` menerjemahkan label tampilan: LARGE_A/B, ESL_320, EXP/LOCAL, enum status, sumber input, serta nama parameter. Nilai kosong berkode underscore, N/A, X, null/undefined yang berupa teks ditampilkan sebagai belum tersedia. Enum lain dengan underscore diberi spasi. URL, email, dan kode dengan tanda hubung dipertahankan.

`readableModalContent` pada batas presentasi Modal memproses teks dan label yang ditampilkan tanpa mengubah objek respons, props nilai formulir, handler, atau payload API. Teks kode/identitas eksplisit (`mono`, `code`, `data-verbatim`) dan isi input/textarea tidak ditulis ulang. Kode SKU cair/produk jadi dan ID transaksi tetap dapat dipakai sebagai acuan. Tidak ada pengubahan DOM dengan observer. Select menggunakan konteks modal untuk merapikan label/group/hint opsi; `option.value` tetap asli dan perilaku halaman di luar modal tetap sama.

Data kemasan pada modal Produk diberi judul kolom Kemasan, bukan Kode, karena yang ditampilkan sekarang nama kemasan yang dapat dibaca.

Verifikasi:

- typecheck, lint, seluruh tes Node, dan build produksi.
- `tests/display-text.test.mjs`: enum, label pasar/kemasan, placeholder, URL/email, ID dengan tanda hubung, angka nol dan teks biasa.
- `tests/modal-consistency-browser.mjs`: produk berisi tabel panjang, detail alat, formulir status, detail kondisi pabrik, detail jadwal, PO & versi jadwal, dan target/alokasi. Memeriksa lebar yang sama di 320/768/1024/1440 px, overflow, judul/tutup saat scroll, Escape, pengembalian fokus, label terbaca, ID yang sah, dan payload status mentah yang tetap benar. Satu operasi tulis hanya dikirim ke API tiruan.
- Browser API langsung hanya GET untuk Produk, Alat, formulir status (tanpa menyimpan), dan kondisi pabrik. Tidak ada data produksi aktif yang diubah.
