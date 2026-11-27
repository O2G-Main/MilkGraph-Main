# Image #1: implementasi frontend MilkGraph

Verifikasi akhir: 27 November 2026, sekitar 17.41 WIB.
Branch kerja: deployment. Basis remote terbaru yang sudah digabung: 37a6f34 (perbaikan instrumentation-client Next.js). Perubahan fitur berikut masih berada di working tree, belum di-commit, di-push, atau di-deploy ke situs publik.

## 1. Acuan visual

Sebelum mengedit, situs https://milkgraph.web.id dibuka melalui akun demo yang disediakan aplikasi. Beranda dan Produksi diperiksa langsung, termasuk computed styles dan token warna.

Gaya dipertahankan:
- Onest sebagai font utama, JetBrains Mono hanya untuk pengenal/kode.
- Canvas #F4F4F3, permukaan putih, teks #141414 dan muted #6B6B68.
- Primary #00782A, hover #005130, border #E2E2DF.
- Card membulat, tombol/pemilih pill, tabel operasional padat, dan jarak antarseksi dari komponen MilkGraph yang ada.
- Menggunakan PageHeading, Card, SectionTitle, Modal, Select, Toggle dan pola tabel existing. Perubahan layout tambahan memakai CSS module; tidak merombak global design system.
- Tidak menambahkan hero, gradient baru, glow, animasi dekoratif, logo baru, atau seed data untuk menyamarkan kegagalan API.

## 2. Halaman dan endpoint yang digunakan

Base URL backend: https://api.milkgraph.web.id/api/v1.
NEXT_PUBLIC_API_URL berisi host saja, https://api.milkgraph.web.id; shared client menambahkan /api/v1. Default host diperbarui, tetapi override environment tetap dihormati. API_MODE tetap mengikuti NEXT_PUBLIC_DATA_MODE=api; mode mock existing tidak dihapus.

| Halaman | Implementasi | Endpoint utama |
| --- | --- | --- |
| /produk | Halaman baru Master Produk; pencarian produk/finished SKU, filter keluarga, modal detail kemasan, pasar dan relasi SKU; hanya baca | GET /production/products |
| /alat | Halaman baru Alat; katalog canonical, opsi pipa, pencarian/filter jenis/status, detail konfigurasi, pencatatan status backend | GET /production/assets, GET /master/assets, GET /session, POST /production/assets/{id}/status |
| /produksi | Batch/produksi harian existing dipertahankan; tab campuran aset-produk diganti Konfigurasi lini; Alur pabrik membaca topologi backend | GET /master/lines, GET /master/topology, GET /production/assets; daily/schedule dan form batch existing tetap ada |
| /aturan-produksi | API-mode menampilkan master changeover, CIP, constraint dan satuan; classifier memakai finished SKU canonical; mode mock tetap lewat aturan lokal existing | GET /master/rules, GET /production/products, POST /master/changeover/classify |
| /rencana/alur | Usulan mingguan, filter tanggal/batch, penugasan alat dan diagram bersama dengan Produksi | GET /production/plans, GET /production/daily, GET /production/schedule, GET /master/topology, GET /production/assets |
| /rencana/upgrade | Prediksi dan rekomendasi terstruktur, fakta/target alat/gain, aksi analisis dan keputusan | GET /production/predictions, GET /production/recommendations, POST /production/predictions/run, PATCH /production/recommendations/{id}, GET /session |
| /rencana | Kelayakan berbasis hasil backend, batch, rekomendasi dan konfirmasi status keputusan | Endpoint production planning yang sama; tidak menyamakan /production/plans dengan /plans skenario lama |
| /master-data | Route lama tetap bisa dibuka sebagai pengarah ke jenis data masing-masing dan ringkasan sumber dataset; bukan lagi editor campuran | GET /master |

Downtime di detail Alat memakai ulang DowntimeApi: daftar/catat downtime, prediksi downtime per resource dan rekomendasi maintenance mengikuti endpoint existing. Adapter menggunakan asset_id canonical, bukan nama alat simulasi.

Navigasi:
- Master Alat menjadi Master Produk (/produk).
- Kondisi Alat menjadi Alat (/alat).
- /kondisi-alat diarahkan permanen 308 ke /alat, termasuk query string.
- Alias /alur ke /produksi tetap dipertahankan.
- Menu tersimpan lama untuk /kondisi-alat tetap dikenali melalui normalisasi alias.

## 3. Integritas data dan tindakan

- Produk, kemasan, varian pasar dan finished SKU berasal dari satu katalog API, bukan daftar terpisah buatan FE.
- Alat dan rute di Produksi serta Rencana memakai PlantTopology yang sama, bersumber dari /master/topology. Posisi diagram hanya presentasi; ID, arah, koneksi dan batas aliran tidak direkayasa.
- Tersedia diagram yang bisa digeser/diperbesar, daftar rute, pencarian ID alat/rute/pipa ketika tercatat, filter jenis, serta inspector spesifikasi dan koneksi.
- Status belum termuat, gagal dimuat, dan belum tercatat dibedakan. Nilai N/A, X dan null tidak diubah menjadi angka nol atau status Jalan.
- Status alat memeriksa permission backend, menahan submit ganda, melakukan POST lalu GET dan mencocokkan ID/status/alasan sebelum mengumumkan tersimpan. Jika readback gagal setelah POST, pengulangan verifikasi hanya GET, bukan mengirim ulang status.
- Prediksi menggunakan body production_date dan batch_id opsional. Keputusan memakai PATCH dengan body status saja, disertai konfirmasi dan GET readback ID/status.
- Status accepted/applied dijelaskan sebagai pencatatan keputusan, bukan klaim kapasitas alat atau jadwal otomatis berubah.
- Daftar prediksi/rekomendasi kosong ditampilkan sebagai belum ada data, bukan diisi rekomendasi simulasi.
- API-mode Rencana tidak lagi mengirim POST /plans/{id}/check saat halaman dibuka. Context skenario tetap tersedia untuk komponen global dan mode demo, tanpa mengambil daftar legacy sebagai proposal produksi.
- Tidak menambahkan CRUD produk karena endpoint tulis katalog tidak didokumentasikan. Halaman master produk dibuat read-only sesuai kontrak yang tersedia.

## 4. Verifikasi yang benar-benar dijalankan

### Gates kode

- pnpm test: 174 test lulus, 0 gagal.
- pnpm lint: lulus.
- pnpm typecheck: lulus.
- git diff --check: lulus.
- Build production API-mode dengan NEXT_PUBLIC_API_URL=https://api.milkgraph.web.id: lulus.
- Standalone server dijalankan dengan struktur asset seperti Dockerfile (server.js, public, .next/static). Docker image sendiri tidak dibangun pada task ini.
- tests/deployment.mjs terhadap server production: health identity, 24 halaman, 20 asset, 404 dan redirect lama lulus.

### Browser terhadap build production, bukan hanya dev server

Runner: tests/image-one-browser.mjs.

- Katalog live 8 produk dan 44 finished SKU: pencarian, detail relasi, hasil kosong.
- Katalog alat: ID canonical, detail N/A asli, opsi pipa.
- Diagram bersama: 63 node dan 118 koneksi; pencarian rute, inspector dan konfigurasi lini.
- Rencana: 88 usulan mingguan, pemilihan tanggal/batch dan state prediksi/rekomendasi kosong.
- Form status, classifier, analisis dan keputusan diuji memakai transport mock lokal yang eksplisit. Body request, satu submit, konfirmasi, readback dan izin diverifikasi.
- Error katalog 503 yang di-mock ditampilkan, lalu retry berhasil kembali ke data live.
- Permission kosong yang di-mock meniadakan aksi status alat dan menonaktifkan analisis.
- Keyboard Enter membuka detail produk/alat; Escape menutup modal; fokus kembali ke pemicu.
- Delapan halaman diperiksa pada 1440, 768 dan 390 piksel: tidak ada overflow dokumen.
- 0 browser runtime error dan 0 operasi tulis tanpa mock yang lolos.

GET browser diteruskan melalui proxy read-only ke host API baru agar QA localhost tidak disalahartikan sebagai pengujian whitelist Origin deployment. Mutasi operasional tidak diteruskan ke backend produksi. SSE pada proxy hanya komentar lokal: pengiriman event live/reconnect bukan bagian pembuktian suite ini.

### Tampilan dan antislop

- R02/R03/R17/R18: teks fitur baru menggunakan label operasional, tidak menggunakan dekorasi tanda baca, kata pemasaran atau pola visual generik baru.
- R25: kombinasi token utama diperiksa secara numerik: teks utama/putih 18.42:1; muted/putih 5.35:1; muted/canvas 4.86:1; primary/putih 5.65:1. Ini bukti untuk token tersebut, bukan klaim audit WCAG menyeluruh seluruh halaman lama.
- R26/R27: layout mobile dan keyboard/modal diperiksa dengan browser. Header tabel Rencana tetap terlihat dalam area scroll, bukan membuat tabel panjang menutupi flow utama.
- R28/R29/R30: tidak menambah kartuisasi dekoratif atau modal berlebihan. Modal digunakan untuk detail/transaksi, bukan sebagai pengganti halaman utama.
- R32/R33/R34: kontrol fitur baru terhubung; loading, empty, error, retry, izin dan readback dibuktikan. Error tidak disamarkan sebagai data valid.
- R37: bahasa visual situs existing dipertahankan sesuai arahan pengguna. Grid titik di diagram adalah penunjuk koordinat canvas interaktif, bukan dekorasi latar halaman.
- R38: screenshot akhir diambil setelah data selesai dimuat, bukan saat skeleton/loading. Credit React Flow tidak disembunyikan.

## 5. Artefak

- Laporan ini: docs/audits/2026-11-27-image-1-frontend-delivery.md.
- Bukti browser production dan 24 screenshot: /home/lain/.hermes/cache/scratch/milkgraph-image-one-production-qa/.
- Ringkasan hasil/request browser: report.json pada direktori tersebut. POST/PATCH di log adalah request yang diintersep mock lokal, bukan bukti penulisan server produksi.
- Log unit test akhir: /home/lain/.hermes/cache/scratch/milkgraph-fe-final-test.log.
- Proxy QA yang dapat dijalankan ulang: scripts/readonly-api-proxy.py. POST/PUT/PATCH/DELETE telah diperiksa dan seluruhnya ditolak 403 QA_READ_ONLY sebelum forwarding.

Contoh menjalankan ulang browser QA, dengan server production lokal di port 3100 dan proxy pada terminal lain:

    python scripts/readonly-api-proxy.py
    env BASE_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium-browser node tests/image-one-browser.mjs

QA_API_URL, QA_PROXY_PORT, QA_UPSTREAM, QA_ARTIFACT_DIR dan executable browser dapat diatur sesuai lingkungan. Proxy hanya mengikat 127.0.0.1 dan tidak digunakan sebagai gateway production. Untuk preview GET lokal dengan dev server, gunakan NEXT_PUBLIC_DATA_MODE=api dan NEXT_PUBLIC_API_URL=http://127.0.0.1:8081; aksi tulis sengaja ditolak oleh proxy, sehingga transaksi diuji lewat runner yang memasang mock lokal.

## 6. Catatan handoff

- Next.js 16.4.3 mengeluarkan peringatan kerentanan keamanan. Build pertama berhenti untuk reminder; pengulangan build berhasil, tetapi ini tidak memperbaiki kerentanannya. Upgrade dependency belum dilakukan karena di luar perubahan fitur ini.
- Backend domain baru sempat 502 sekitar 17.34 WIB, lalu kembali 200. Suite browser production terakhir lulus setelah pemulihan, dan /api/v1/meta dicek kembali 200 pada sekitar 17.41 WIB. FE tidak dialihkan diam-diam ke host lama.
- Masalah hidrasi dev sebelumnya terisolasi ke blokir Origin resource Next development ketika dibuka lewat 127.0.0.1. Konfigurasi allowedDevOrigins ditambahkan hanya untuk loopback tersebut; localhost tetap memakai izin default framework.
- Belum melakukan pengujian transaksi pada data produksi, load test, live JWT, perubahan backend, push, maupun deployment publik.
- File desain/export untracked yang sudah ada sebelum pengerjaan tidak dihapus atau diubah.
