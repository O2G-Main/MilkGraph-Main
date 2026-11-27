# Konfigurasi numerik per alat

`GET /api/v1/production/assets/{id}/configuration` menyediakan identitas alat, version, updated_at, fields dan values. Fields diturunkan dari keanggotaan subtipe relational:

- storage_tanks: capacity_l, holding_time_limit_hours, cip_duration_minutes;
- production_machines: input_flow_lph, output_flow_lph, process_speed_lph, cip_duration_minutes;
- filling_machines: speed_packph.

Field nullable berarti parameter belum ditetapkan, bukan angka nol. Durasi CIP menerima nol dan bilangan bulat; laju filling menerima bilangan bulat positif; kapasitas/laju proses/holding menerima angka positif dengan presisi 0,01. Batas server 1e9 dan whitelist field divalidasi lagi pada PATCH. Pipa/boundary tanpa subtipe mendapat fields kosong.

`PATCH /api/v1/production/assets/{id}/configuration` membutuhkan izin constraint.edit dari registri sesi yang sudah ada. Payload: `{"version":1,"changes":{"speed_packph":15000}}`. Field tidak berlaku menghasilkan 422, asset tidak ditemukan 404, versi basi 409. Parameter yang tidak dikirim tidak berubah. Hanya tabel/kolom schema server yang dipakai dalam SQL; input pengguna tidak dapat mengubah identifier SQL.

Migrasi 0007 menambahkan configuration_version dan configuration_updated_at pada assets secara aditif. Transaksi mengunci row assets, membandingkan versi, memperbarui nilai tabel subtipe, lalu menyimpan revisi, audit before/after, dan event asset.configuration.updated. Shared reset lock mengikuti mekanisme persistensi repo. Nilai tidak ditaruh pada state browser atau CSV sementara.

Master assets/topology/lines mengoverlay nilai relational pada salinan katalog per request, tanpa mengubah map seed bersama. paramsJadwal memakai katalog yang sama: speed filling dan holding per tangki terbaca pada generate berikutnya. Angka desimal di salinan katalog diformat sesuai ParseAngkaID (koma desimal), sehingga 6,5 jam tidak menjadi 65 jam. Nilai kapasitas/laju lain tersedia bagi pembaca relational yang sudah ada; perubahan ini tidak menambahkan algoritme throughput baru atau menghitung ulang hasil historis.

Verifikasi: `go test ./...`, dan `TEST_DATABASE_URL=... go test ./internal/api -run TestAssetConfiguration -count=1 -v` dengan PostgreSQL terisolasi. Tes integrasi membuktikan simpan/restart, schema per subtipe, permission, versi basi, validasi atomik, NULL/nol, overlay master/lini, parameter scheduler (termasuk holding desimal), audit dan event. Tes browser pada repo FE menghubungkan UI ke backend ini dengan database uji; API produksi tidak diberi nilai uji.
