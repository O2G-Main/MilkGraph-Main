-- Migrasi 0002: tabel relasional untuk master data dan data operasional
-- Tahap 3. Bersifat aditif: tabel generik lama (state, audit, events,
-- audit_seeds) tidak diubah, dan kode yang berjalan saat ini tetap membaca
-- seed file dan state store. Tabel-tabel ini adalah fondasi supaya data
-- yang sekarang hidup di file CSV/JSON dan dokumen JSONB punya rumah
-- relasional; pemindahan bacaan kode ke tabel ini adalah langkah terpisah.
--
-- Aturan pengisian: parameter yang di master data masih bertanda "X"
-- (belum diketahui) atau "N/A" (tidak berlaku) dibuat nullable dan diisi
-- NULL oleh migrasi seed 0003, menunggu data resmi Greenfields. Tidak ada
-- nilai yang dikarang.

-- Farm pemasok susu. farm_id adalah slug dari nama mengikuti fungsi
-- farmID() di Backend (huruf besar, spasi menjadi tanda hubung, awalan
-- FARM- ditambahkan kecuali nama sudah berawalan FARM- atau KUD-), supaya
-- sama persis dengan farm_id pada catatan kedatangan RT.
-- Sumber: seed/ops.json (daftar farms).
CREATE TABLE milkgraph.farms (
 farm_id text PRIMARY KEY,
 name text NOT NULL UNIQUE
);
COMMENT ON TABLE milkgraph.farms IS 'Farm pemasok susu; sumber: daftar farms di seed/ops.json.';

-- Rencana dan realisasi harian per farm untuk satu tanggal skenario.
-- Sumber: seed/ops.json (plannedRt, plannedL, arrived, onTheWay, passRate,
-- finding, coolingC). Kolom tone dari sumber adalah penanda tampilan UI
-- dan sengaja tidak ikut disimpan.
CREATE TABLE milkgraph.farm_daily_plans (
 farm_id text NOT NULL REFERENCES milkgraph.farms(farm_id),
 plan_date date NOT NULL,
 planned_rt integer NOT NULL,
 planned_liters numeric NOT NULL,
 arrived_rt integer NOT NULL,
 on_the_way integer NOT NULL,
 pass_rate numeric,
 finding text,
 cooling_c numeric,
 PRIMARY KEY (farm_id, plan_date)
);
COMMENT ON TABLE milkgraph.farm_daily_plans IS 'Rencana kirim harian per farm; sumber: seed/ops.json untuk tanggal skenario.';

-- Road tanker (RT) yang terdaftar, beserta farm asalnya.
-- Sumber: daftar tankers di seed/scenario.json.
CREATE TABLE milkgraph.rts (
 rt_id text PRIMARY KEY,
 farm_id text NOT NULL REFERENCES milkgraph.farms(farm_id)
);
COMMENT ON TABLE milkgraph.rts IS 'Road tanker terdaftar dan farm asalnya; sumber: tankers di seed/scenario.json.';

-- Tabel induk seluruh aset pabrik dari master data (73 aset): tangki,
-- mesin proses, filling line, pipa, header routing, dan node batas.
-- Sumber: seed/master/asset_configuration.csv.
CREATE TABLE milkgraph.assets (
 asset_id text PRIMARY KEY,
 asset_type text NOT NULL,
 asset_name text NOT NULL,
 node_role text NOT NULL,
 compatible_product_family text
);
COMMENT ON TABLE milkgraph.assets IS 'Seluruh aset master data; sumber: seed/master/asset_configuration.csv.';

-- Subtipe tangki penyimpanan (28 aset): Raw Milk Tank, SFP Storage Tank,
-- Aseptic Tank, Cream Tank, Mixing Tank, Premix Tank.
CREATE TABLE milkgraph.storage_tanks (
 asset_id text PRIMARY KEY REFERENCES milkgraph.assets(asset_id),
 capacity_l numeric,
 holding_time_limit_hours numeric,
 cip_duration_minutes numeric
);
COMMENT ON TABLE milkgraph.storage_tanks IS 'Tangki penyimpanan (subtipe assets); parameter dari seed/master/asset_configuration.csv.';
COMMENT ON COLUMN milkgraph.storage_tanks.capacity_l IS 'Kapasitas tangki (liter). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';
COMMENT ON COLUMN milkgraph.storage_tanks.holding_time_limit_hours IS 'Batas holding time (jam). Di master data masih "X" (belum diketahui); NULL menunggu SOP resmi Greenfields.';
COMMENT ON COLUMN milkgraph.storage_tanks.cip_duration_minutes IS 'Durasi CIP (menit). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';

-- Subtipe mesin produksi (15 aset): Sterilizer, Thermizer, Degassing,
-- Separation / Standardization, Unloading Bay. Perhatian penamaan: kode
-- ST-01 s/d ST-05 di master data adalah Sterilizer, bukan storage tank.
CREATE TABLE milkgraph.production_machines (
 asset_id text PRIMARY KEY REFERENCES milkgraph.assets(asset_id),
 input_flow_lph numeric,
 output_flow_lph numeric,
 process_speed_lph numeric,
 cip_duration_minutes numeric
);
COMMENT ON TABLE milkgraph.production_machines IS 'Mesin proses (subtipe assets); parameter dari seed/master/asset_configuration.csv. ST-01 s/d ST-05 adalah Sterilizer.';
COMMENT ON COLUMN milkgraph.production_machines.input_flow_lph IS 'Laju alir masuk (liter/jam). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';
COMMENT ON COLUMN milkgraph.production_machines.output_flow_lph IS 'Laju alir keluar (liter/jam). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';
COMMENT ON COLUMN milkgraph.production_machines.process_speed_lph IS 'Kecepatan proses (liter/jam). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';
COMMENT ON COLUMN milkgraph.production_machines.cip_duration_minutes IS 'Durasi CIP (menit). Di master data masih "X" (belum diketahui); NULL menunggu data resmi Greenfields.';

-- Subtipe filling line (10 aset): FL-01 s/d FL-10.
CREATE TABLE milkgraph.filling_machines (
 asset_id text PRIMARY KEY REFERENCES milkgraph.assets(asset_id),
 speed_packph numeric
);
COMMENT ON TABLE milkgraph.filling_machines IS 'Filling line (subtipe assets); sumber: seed/master/asset_configuration.csv.';
COMMENT ON COLUMN milkgraph.filling_machines.speed_packph IS 'Kecepatan filling (pak/jam). Di master data masih "X" untuk kesepuluh line (belum diketahui); NULL menunggu data resmi Greenfields.';

-- Katalog finished SKU (44 SKU).
-- Sumber: seed/master/finished_sku_catalog.csv.
CREATE TABLE milkgraph.finished_skus (
 finished_sku_id text PRIMARY KEY,
 liquid_sku_id text NOT NULL,
 pack_size_code text NOT NULL,
 market_variant text NOT NULL
);
COMMENT ON TABLE milkgraph.finished_skus IS 'Katalog finished SKU; sumber: seed/master/finished_sku_catalog.csv.';

-- Dedikasi tiap filling line: keluarga produk dan ukuran pak yang boleh
-- dijalankan, serta tangki aseptik sumbernya. product_families dan
-- pack_sizes disimpan apa adanya dari sumber (daftar dipisah titik koma).
-- Sumber: seed/master/line_dedication.csv.
CREATE TABLE milkgraph.filling_line_dedications (
 filling_id text PRIMARY KEY REFERENCES milkgraph.filling_machines(asset_id),
 product_families text NOT NULL,
 pack_sizes text NOT NULL,
 aseptic_tank_id text REFERENCES milkgraph.assets(asset_id)
);
COMMENT ON TABLE milkgraph.filling_line_dedications IS 'Dedikasi filling line; sumber: seed/master/line_dedication.csv (kolom allowed_sku_ids berisi keluarga produk cair).';

-- Kompatibilitas filling line terhadap finished SKU (116 baris; di sumber
-- kolom eligible "Y" menjadi compatible true).
-- Sumber: seed/master/line_finished_sku_compatibility.csv.
CREATE TABLE milkgraph.filling_line_sku_compatibility (
 filling_id text NOT NULL REFERENCES milkgraph.filling_machines(asset_id),
 sku_id text NOT NULL REFERENCES milkgraph.finished_skus(finished_sku_id),
 compatible boolean NOT NULL,
 PRIMARY KEY (filling_id, sku_id)
);
COMMENT ON TABLE milkgraph.filling_line_sku_compatibility IS 'Kompatibilitas line dan finished SKU; sumber: seed/master/line_finished_sku_compatibility.csv.';

-- Production Order (PO): target produksi. Mencerminkan struct
-- ProductionOrder di Backend (internal/api/scheduler.go): po_id, priority,
-- due_datetime, label_data; baris-barisnya di po_lines.
CREATE TABLE milkgraph.pos (
 po_id text PRIMARY KEY,
 priority integer NOT NULL,
 due_at timestamptz NOT NULL,
 label_data text NOT NULL
);
COMMENT ON TABLE milkgraph.pos IS 'Production Order; mencerminkan entity "po" di state store (struct ProductionOrder).';

-- Baris PO: satu SKU dan volume targetnya (struct POLine: sku, qty_liter).
-- line_no menjaga urutan baris seperti pada dokumen PO.
CREATE TABLE milkgraph.po_lines (
 po_id text NOT NULL REFERENCES milkgraph.pos(po_id),
 line_no integer NOT NULL,
 sku_id text NOT NULL REFERENCES milkgraph.finished_skus(finished_sku_id),
 volume_l numeric NOT NULL,
 PRIMARY KEY (po_id, line_no)
);
COMMENT ON TABLE milkgraph.po_lines IS 'Baris Production Order; mencerminkan POLine (sku, qty_liter) di Backend.';

-- Jadwal kedatangan RT. Mencerminkan persis struct RTArrival di Backend
-- (internal/api/rt_arrivals.go). Status dibatasi ke empat kosakata resmi:
-- Dijadwalkan, Dalam Perjalanan, Sudah Tiba, Dibatalkan. late_minutes
-- dihitung server dari estimated_arrival terhadap target_arrival.
-- farm_name disimpan sebagai snapshot nama saat catatan dibuat, sama
-- seperti pada struct.
CREATE TABLE milkgraph.rt_arrivals (
 id text PRIMARY KEY,
 farm_id text NOT NULL REFERENCES milkgraph.farms(farm_id),
 farm_name text NOT NULL,
 rt_id text NOT NULL REFERENCES milkgraph.rts(rt_id),
 volume_l numeric NOT NULL,
 depart_at timestamptz NOT NULL,
 target_arrival timestamptz NOT NULL,
 estimated_arrival timestamptz NOT NULL,
 actual_arrival timestamptz,
 status text NOT NULL CHECK (status IN ('Dijadwalkan', 'Dalam Perjalanan', 'Sudah Tiba', 'Dibatalkan')),
 late_minutes integer NOT NULL
);
COMMENT ON TABLE milkgraph.rt_arrivals IS 'Jadwal kedatangan RT; mencerminkan entity "rt-arrival" di state store (struct RTArrival).';
