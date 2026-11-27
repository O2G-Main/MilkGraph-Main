# Riwayat Produksi — alur dan waktu rinci

Pada hasil historis yang dipilih di `/riwayat-produksi`, kartu **Detail alur & waktu transaksi** membaca `GET /production/trace?production_group_id=...`. Tidak ada penulisan transaksi atau perubahan data historis.

- Urutan **Awal ke akhir** atau **Telusur balik**, dengan filter alat/titik alur dan sumber transaksi.
- Awalnya 12 transaksi ditampilkan; tombol berikutnya memuat tambahan dari data yang sudah dibaca. Jumlah yang tampil, sesuai filter, dan unik dalam group dibedakan.
- Waktu mulai/selesai memakai tanggal lengkap, detik, dan Asia/Jakarta (WIB). Durasi dihitung hanya bila dua timestamp valid. Waktu kosong tidak dianggap bukti proses sedang berjalan; end sebelum start ditandai.
- Detail kejadian menampilkan ID, alat, aktivitas, asal/tujuan, volume proses/output, output bagus, dan catatan downtime. Nilai nol tetap nol; data kosong ditulis belum tercatat. Kaitan lot/tahap rekonstruksi backend dicocokkan hanya dengan ID transaksi yang sama.
- View batch trace dapat menggandakan transaksi karena relasi beberapa batch dalam satu group. Hanya payload transaksi yang identik sepenuhnya digabung; ID sama dengan isi berbeda dipertahankan. Field batch tunggal pada ringkasan API tidak dipakai sebagai identitas seluruh group.
- Durasi transaksi yang tumpang tindih tidak dijumlahkan sebagai total lama produksi. Volume beberapa tahap tidak dijumlahkan menjadi hasil akhir. Proporsi campuran tetap merupakan model historis BE yang ditampilkan terpisah.
- `incomplete_sections`, data kosong, group yang tidak cocok, pemuatan, dan kegagalan muat memiliki pesan tersendiri. Retry tidak mengganti kegagalan dengan data simulasi.

Verifikasi: unit test `tests/production-trace.test.mjs`, browser `tests/production-trace-browser.mjs` (API tiruan GET-only, termasuk data lebih dari 12 transaksi), typecheck/lint/build/suite Node. Browser memeriksa arah telusur, detik dan pergantian tanggal WIB pada browser zona Amerika, filter, exact dedup, nol/data kosong, referensi rekonstruksi, error/mismatch, dialog lewat keyboard dan pengembalian fokus, serta lebar 320/768/1024/1440 px.

Pengecekan API langsung hanya GET: group CAM-003664 mengembalikan 124 baris yang mewakili 62 transaksi unik. Tidak ada nilai produksi yang diubah untuk pengujian. Riwayat historis tetap berhenti pada batas hulu Prepared Product Release sesuai cakupan data sumber.
