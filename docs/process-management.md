# Manajemen proses — Produksi

Tab **Manajemen proses** di **Operasional → Produksi** (`/produksi?tab=proses`) mengelompokkan tiga kebutuhan:

1. **Batas operasional** — form bersama dengan halaman Alat, bersumber dari `GET /limits` dan `GET /limits/schema`. Pengguna dengan izin `constraint.edit` pada sesi backend yang sesuai dapat menyimpan melalui `PUT /limits`. Batas berlaku global untuk perencanaan; tidak mengubah spesifikasi satu alat, tanggal tertentu, atau jadwal yang sudah dibuat.
2. **Alat & rute** — pilihan alat, spesifikasi, dan rute yang memiliki ID alat yang sama dari `GET /master/topology`. Nilai nol dipertahankan, nilai kosong ditulis “Belum tersedia”. Tautan ke katalog/status alat serta Kondisi Pabrik tersedia sesuai akses halaman.
3. **Lini & kompatibilitas** — dedikasi lini, tangki sumber, kecepatan kemasan, dan kelayakan SKU dari `GET /master/lines`, memakai komponen yang sama dengan halaman Alat.

Konfigurasi per alat sekarang terhubung melalui `GET` dan `PATCH /production/assets/{id}/configuration`. Schema `fields` dari BE menentukan label, satuan, batas, kelipatan, dan dukungan nilai kosong. Form menampilkan hanya parameter yang berlaku untuk subtipe alat; tangki, mesin proses, dan filling line memiliki parameter berbeda. Boundary/pipa tanpa subtipe konfigurasi tidak diberi parameter buatan.

PATCH menyertakan `version` dan `changes` (hanya bidang yang berubah). Sesi backend harus memiliki `constraint.edit`. Nilai disimpan pada tabel subtipe alat di PostgreSQL; revisi, waktu pembaruan, audit, dan event disimpan dalam satu transaksi. Versi basi mendapat 409 tanpa menimpa perubahan pengguna lain. Nilai kosong berarti belum ditetapkan (NULL); nilai nol tetap valid untuk durasi CIP.

Sesudah PATCH, FE membaca ulang endpoint dan membandingkan bidang serta versi sebelum menyatakan berhasil. Jika hasil permintaan belum pasti, verifikasi ulang hanya melakukan GET dan tidak mengirim PATCH kedua. Menutup dialog memuat ulang konfigurasi. Backend lama dengan endpoint 404/405 menampilkan keterangan layanan belum tersedia dan spesifikasi master tetap dapat dibaca.

BE menggunakan nilai relational yang sama untuk master aset, topologi, dedikasi kecepatan lini, dan sumber parameter generator jadwal. Kecepatan filling dan holding time tangki berlaku pada generate jadwal berikutnya, sesuai kemampuan generator yang sudah ada. Jadwal/prediksi historis tidak dihitung ulang otomatis. Penyuntingan koneksi rute dan kompatibilitas SKU tidak termasuk endpoint parameter numerik ini.

Form batas operasional membaca ulang izin dan nilai terbaru sebelum menyimpan, sehingga bidang lain tidak tertimpa nilai cache. Sesudah penyimpanan, nilai yang diubah dibaca kembali dan dibandingkan. Kegagalan mempertahankan isian pengguna dan menampilkan pesan; keberhasilan hanya ditampilkan setelah verifikasi cocok. Mode demo menggunakan pengaturan simulasi lokal dan tidak menampilkan konfigurasi master sebagai data backend.

## Verifikasi

- `npm run typecheck`, `npm run lint`, `npm test` (208 tes), `npm run build`.
- `node tests/process-management-browser.mjs`: penyimpanan PUT dengan API tiruan, batas angka dari schema, mempertahankan nilai backend lain yang berubah, kegagalan penyimpanan, pencabutan izin setelah form terbuka, mode hanya baca, pemilihan alat/rute, nilai nol, kosong/gagal/retry, keyboard dan lebar 320/768/1024/1440 px. `BASE_URL` dan `PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat disesuaikan.
- Pengecekan browser API langsung hanya GET; tidak mengubah batas operasional aktif.

- `node --experimental-strip-types --test tests/asset-configuration.test.mjs`: schema/validasi, NULL/nol, izin, versi, readback, dan verifikasi tanpa pengiriman ganda.
- `CONFIG_TEST_API=http://127.0.0.1:3107 node tests/asset-configuration-browser.mjs`: integrasi browser dengan BE nyata dan PostgreSQL **terisolasi**, simpan/reload, schema per subtipe, konflik antarclient, NULL/nol, fokus keyboard, dan lebar 320/768/1024/1440 px. Pengujian menulis data dan menolak URL API selain loopback lokal.
- Aktivasi BE memerlukan commit konfigurasi per alat di repo `O2G-Main/Milkgraph-Back`, migrasi `0007_asset_configuration_revision.sql`, dan deployment layanan. FE tetap dapat digunakan dengan BE versi sebelumnya.
