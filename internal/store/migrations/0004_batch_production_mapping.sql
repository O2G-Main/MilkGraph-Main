-- Migrasi 0004: relational mapping Produksi berbasis batch di schema milkgraph.
-- Baseline: 18 tabel existing dari migrasi 0001-0003.
-- Sifat: aditif dan idempotent. Tabel state, audit, events, audit_seeds,
-- schema_migrations tidak diubah.
-- Foreign key finished_skus dibuat NOT VALID agar file bisa jalan sebelum
-- products dan pack_size_codes terisi; divalidasi di migrasi 0005.

CREATE SCHEMA IF NOT EXISTS milkgraph;

-- ============================================================
-- 1. Master produk
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.products (
    sku_id text PRIMARY KEY,
    product_name text NOT NULL,
    product_family text NOT NULL,
    flavour text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.products IS 'Master produk cair; sumber: product_catalog.csv.';
COMMENT ON COLUMN milkgraph.products.sku_id IS 'Liquid SKU, contoh ESL-FC, UHT-FC.';

CREATE TABLE IF NOT EXISTS milkgraph.pack_size_codes (
    pack_size_code text PRIMARY KEY,
    description text,
    exact_size_ml numeric CHECK (exact_size_ml IS NULL OR exact_size_ml > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.pack_size_codes IS 'Master kode ukuran pak; sumber: pack_size_codes.csv.';

CREATE TABLE IF NOT EXISTS milkgraph.product_pack_sizes (
    sku_id text NOT NULL REFERENCES milkgraph.products(sku_id),
    pack_size_code text NOT NULL REFERENCES milkgraph.pack_size_codes(pack_size_code),
    PRIMARY KEY (sku_id, pack_size_code)
);
COMMENT ON TABLE milkgraph.product_pack_sizes IS 'Relasi produk cair ke pack size yang diizinkan; sumber: product_catalog.csv allowed_pack_size_codes.';

CREATE TABLE IF NOT EXISTS milkgraph.product_market_variants (
    sku_id text NOT NULL REFERENCES milkgraph.products(sku_id),
    market_variant text NOT NULL,
    PRIMARY KEY (sku_id, market_variant)
);
COMMENT ON TABLE milkgraph.product_market_variants IS 'Relasi produk cair ke varian market; sumber: product_catalog.csv market_variants.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'finished_skus_liquid_sku_fk'
          AND conrelid = 'milkgraph.finished_skus'::regclass
    ) THEN
        ALTER TABLE milkgraph.finished_skus
            ADD CONSTRAINT finished_skus_liquid_sku_fk
            FOREIGN KEY (liquid_sku_id) REFERENCES milkgraph.products(sku_id)
            NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'finished_skus_pack_size_fk'
          AND conrelid = 'milkgraph.finished_skus'::regclass
    ) THEN
        ALTER TABLE milkgraph.finished_skus
            ADD CONSTRAINT finished_skus_pack_size_fk
            FOREIGN KEY (pack_size_code) REFERENCES milkgraph.pack_size_codes(pack_size_code)
            NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS finished_skus_liquid_sku_idx
    ON milkgraph.finished_skus(liquid_sku_id);
CREATE INDEX IF NOT EXISTS finished_skus_pack_size_idx
    ON milkgraph.finished_skus(pack_size_code);

-- ============================================================
-- 2. Master alat, rute proses, dan status alat
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.production_routes (
    connection_id text PRIMARY KEY,
    source_asset_id text NOT NULL REFERENCES milkgraph.assets(asset_id),
    destination_asset_id text NOT NULL REFERENCES milkgraph.assets(asset_id),
    via_asset_id text REFERENCES milkgraph.assets(asset_id),
    max_flow_lph numeric CHECK (max_flow_lph IS NULL OR max_flow_lph >= 0),
    flow_type text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_asset_id <> destination_asset_id)
);
COMMENT ON TABLE milkgraph.production_routes IS 'Rute proses antar aset; sumber: asset_connections.csv.';

CREATE INDEX IF NOT EXISTS production_routes_source_idx
    ON milkgraph.production_routes(source_asset_id);
CREATE INDEX IF NOT EXISTS production_routes_destination_idx
    ON milkgraph.production_routes(destination_asset_id);
CREATE INDEX IF NOT EXISTS production_routes_via_idx
    ON milkgraph.production_routes(via_asset_id);

CREATE TABLE IF NOT EXISTS milkgraph.asset_status_events (
    id bigserial PRIMARY KEY,
    asset_id text NOT NULL REFERENCES milkgraph.assets(asset_id),
    status text NOT NULL,
    status_reason text,
    source text NOT NULL DEFAULT 'manual',
    observed_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.asset_status_events IS 'Riwayat status atau kondisi alat. Status terbaru dibaca lewat asset_current_status_view.';

CREATE INDEX IF NOT EXISTS asset_status_events_asset_observed_idx
    ON milkgraph.asset_status_events(asset_id, observed_at DESC, id DESC);

CREATE OR REPLACE VIEW milkgraph.asset_current_status_view AS
SELECT
    a.asset_id,
    a.asset_type,
    a.asset_name,
    a.node_role,
    a.compatible_product_family,
    latest.status AS current_status,
    latest.status_reason AS current_status_reason,
    latest.source AS current_status_source,
    latest.observed_at AS current_status_observed_at
FROM milkgraph.assets a
LEFT JOIN LATERAL (
    SELECT e.status, e.status_reason, e.source, e.observed_at
    FROM milkgraph.asset_status_events e
    WHERE e.asset_id = a.asset_id
    ORDER BY e.observed_at DESC, e.id DESC
    LIMIT 1
) latest ON true;
COMMENT ON VIEW milkgraph.asset_current_status_view IS 'Status terbaru per aset untuk menu Alat.';

-- ============================================================
-- 3. Rules produksi dan kompatibilitas
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.line_allowed_liquid_skus (
    filling_id text NOT NULL REFERENCES milkgraph.filling_machines(asset_id),
    liquid_sku_id text NOT NULL REFERENCES milkgraph.products(sku_id),
    PRIMARY KEY (filling_id, liquid_sku_id)
);
COMMENT ON TABLE milkgraph.line_allowed_liquid_skus IS 'Liquid SKU yang boleh dijalankan filling line; sumber: line_dedication.csv allowed_sku_ids.';

CREATE TABLE IF NOT EXISTS milkgraph.line_allowed_pack_sizes (
    filling_id text NOT NULL REFERENCES milkgraph.filling_machines(asset_id),
    pack_size_code text NOT NULL REFERENCES milkgraph.pack_size_codes(pack_size_code),
    PRIMARY KEY (filling_id, pack_size_code)
);
COMMENT ON TABLE milkgraph.line_allowed_pack_sizes IS 'Pack size yang boleh dijalankan filling line; sumber: line_dedication.csv pack_size_codes.';

CREATE TABLE IF NOT EXISTS milkgraph.line_product_compatibility (
    filling_id text NOT NULL REFERENCES milkgraph.filling_machines(asset_id),
    liquid_sku_id text NOT NULL REFERENCES milkgraph.products(sku_id),
    pack_size_code text NOT NULL REFERENCES milkgraph.pack_size_codes(pack_size_code),
    eligible boolean NOT NULL,
    PRIMARY KEY (filling_id, liquid_sku_id, pack_size_code)
);
COMMENT ON TABLE milkgraph.line_product_compatibility IS 'Kompatibilitas filling line ke liquid SKU dan pack size; sumber: line_product_compatibility.csv.';

CREATE TABLE IF NOT EXISTS milkgraph.changeover_rules (
    rule_id text PRIMARY KEY,
    precedence integer,
    condition text,
    activity text,
    duration_minutes numeric CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    additional_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.changeover_rules IS 'Aturan changeover produksi; sumber: changeover_rules.csv.';

CREATE TABLE IF NOT EXISTS milkgraph.cip_rules (
    rule_id text PRIMARY KEY,
    trigger_text text,
    asset_scope text,
    requirement text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.cip_rules IS 'Aturan CIP; sumber: cip_rules.csv. Kolom trigger_text memetakan kolom trigger dari sumber.';

-- ============================================================
-- 4. Rencana, pasokan, dan stok awal
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.production_plans (
    proposal_id text PRIMARY KEY,
    week integer,
    week_start_sunday date,
    finished_sku_id text REFERENCES milkgraph.finished_skus(finished_sku_id),
    product_name text,
    pack_size_ml numeric CHECK (pack_size_ml IS NULL OR pack_size_ml > 0),
    market text,
    target_packs numeric CHECK (target_packs IS NULL OR target_packs >= 0),
    target_volume_l numeric CHECK (target_volume_l IS NULL OR target_volume_l >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.production_plans IS 'Rencana produksi mingguan; sumber: 06_Future_Production_Planning.xlsx. sku_id sumber adalah finished SKU.';

CREATE INDEX IF NOT EXISTS production_plans_week_idx
    ON milkgraph.production_plans(week_start_sunday, week);
CREATE INDEX IF NOT EXISTS production_plans_finished_sku_idx
    ON milkgraph.production_plans(finished_sku_id);

CREATE TABLE IF NOT EXISTS milkgraph.receiving_plans (
    delivery_id text PRIMARY KEY,
    delivery_note_no text,
    farm_id text REFERENCES milkgraph.farms(farm_id),
    planned_departure_time timestamptz,
    planned_volume_l numeric CHECK (planned_volume_l IS NULL OR planned_volume_l >= 0),
    eta_delivery_note timestamptz,
    eta_historical timestamptz,
    historical_prior_trip_count integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.receiving_plans IS 'Rencana penerimaan susu; sumber: 04_Milk_Receiving_Plan.xlsx sheet Receiving Plan.';

CREATE INDEX IF NOT EXISTS receiving_plans_farm_time_idx
    ON milkgraph.receiving_plans(farm_id, planned_departure_time);

CREATE TABLE IF NOT EXISTS milkgraph.future_supply (
    delivery_id text PRIMARY KEY,
    delivery_note_no text,
    farm_id text REFERENCES milkgraph.farms(farm_id),
    planned_departure_time timestamptz,
    planned_volume_l numeric CHECK (planned_volume_l IS NULL OR planned_volume_l >= 0),
    eta_delivery_note timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.future_supply IS 'Pasokan susu masa depan; sumber: 04_Milk_Receiving_Plan.xlsx sheet Future Supply.';

CREATE INDEX IF NOT EXISTS future_supply_farm_time_idx
    ON milkgraph.future_supply(farm_id, planned_departure_time);

CREATE TABLE IF NOT EXISTS milkgraph.receiving_actual (
    delivery_id text PRIMARY KEY,
    delivery_note_no text,
    farm_id text REFERENCES milkgraph.farms(farm_id),
    tanker_id text,
    plate_no text,
    actual_departure_time timestamptz,
    actual_arrival_time timestamptz,
    weigh_in_time timestamptz,
    gross_weight_kg numeric,
    sampling_start_time timestamptz,
    sampling_end_time timestamptz,
    lab_release_time timestamptz,
    bay_id text REFERENCES milkgraph.assets(asset_id),
    bay_entry_time timestamptz,
    weigh_out_time timestamptz,
    tare_weight_kg numeric,
    received_volume_l numeric CHECK (received_volume_l IS NULL OR received_volume_l >= 0),
    degassing_id text REFERENCES milkgraph.assets(asset_id),
    degassing_active_hours numeric,
    status text,
    degassing_start_time timestamptz,
    degassing_end_time timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.receiving_actual IS 'Realisasi penerimaan susu; sumber: 03_Milk_Receiving_History.xlsx.';

CREATE INDEX IF NOT EXISTS receiving_actual_farm_arrival_idx
    ON milkgraph.receiving_actual(farm_id, actual_arrival_time);
CREATE INDEX IF NOT EXISTS receiving_actual_arrival_idx
    ON milkgraph.receiving_actual(actual_arrival_time);

CREATE TABLE IF NOT EXISTS milkgraph.opening_inventory (
    opening_inventory_id text PRIMARY KEY,
    snapshot_time timestamptz NOT NULL,
    storage_id text REFERENCES milkgraph.assets(asset_id),
    storage_type text,
    liquid_sku_id text REFERENCES milkgraph.products(sku_id),
    product_name text,
    opening_volume_l numeric CHECK (opening_volume_l IS NULL OR opening_volume_l >= 0),
    capacity_l numeric CHECK (capacity_l IS NULL OR capacity_l >= 0),
    opening_level_pct numeric,
    filled_time timestamptz,
    material_age_hours numeric,
    holding_limit_hours numeric,
    holding_deadline timestamptz,
    last_cip_end_time timestamptz,
    inventory_status text,
    fresh_milk_fraction numeric,
    fresh_milk_equivalent_l numeric,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.opening_inventory IS 'Stok awal per storage; sumber: 02_Processing_Transactions.xlsx sheet Opening Inventory. liquid_sku_id kosong dari sumber harus dimapping menjadi NULL untuk raw milk.';

CREATE INDEX IF NOT EXISTS opening_inventory_snapshot_idx
    ON milkgraph.opening_inventory(snapshot_time, storage_id);
CREATE INDEX IF NOT EXISTS opening_inventory_liquid_sku_idx
    ON milkgraph.opening_inventory(liquid_sku_id);

-- ============================================================
-- 5. Batch produksi dan jadwal
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.batch_code_rules (
    id bigserial PRIMARY KEY,
    prefix text NOT NULL,
    sequence_format text NOT NULL DEFAULT 'YYYYMMDD-SEQ',
    sequence_scope text NOT NULL DEFAULT 'production_date',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.batch_code_rules IS 'Aturan prefix dan format kode batch produksi. Prefix adalah konfigurasi advanced.';

CREATE UNIQUE INDEX IF NOT EXISTS batch_code_rules_one_active_idx
    ON milkgraph.batch_code_rules(active)
    WHERE active;

CREATE TABLE IF NOT EXISTS milkgraph.production_batches (
    batch_id text PRIMARY KEY,
    batch_code text NOT NULL UNIQUE,
    production_date date NOT NULL,
    sequence_no integer NOT NULL CHECK (sequence_no > 0),
    production_group_id text,
    status text NOT NULL DEFAULT 'Terjadwal',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (production_date, sequence_no)
);
COMMENT ON TABLE milkgraph.production_batches IS 'Batch produksi harian. production_group_id adalah kunci trace historis.';
COMMENT ON COLUMN milkgraph.production_batches.batch_code IS 'Kode batch yang digenerate backend dari batch_code_rules.';

CREATE INDEX IF NOT EXISTS production_batches_date_idx
    ON milkgraph.production_batches(production_date, sequence_no);
CREATE INDEX IF NOT EXISTS production_batches_group_idx
    ON milkgraph.production_batches(production_group_id);
CREATE INDEX IF NOT EXISTS production_batches_status_idx
    ON milkgraph.production_batches(status);

CREATE TABLE IF NOT EXISTS milkgraph.production_batch_lines (
    batch_id text NOT NULL REFERENCES milkgraph.production_batches(batch_id),
    line_no integer NOT NULL CHECK (line_no > 0),
    production_order_id text,
    finished_sku_id text NOT NULL REFERENCES milkgraph.finished_skus(finished_sku_id),
    product_name text,
    flavour text,
    pack_size_ml numeric CHECK (pack_size_ml IS NULL OR pack_size_ml > 0),
    market text,
    processing_type text,
    filling_line_id text REFERENCES milkgraph.filling_machines(asset_id),
    aseptic_tank_id text REFERENCES milkgraph.assets(asset_id),
    sterilizer_id text REFERENCES milkgraph.assets(asset_id),
    planned_start_time timestamptz,
    planned_end_time timestamptz,
    due_time timestamptz,
    target_packs numeric CHECK (target_packs IS NULL OR target_packs >= 0),
    target_volume_l numeric CHECK (target_volume_l IS NULL OR target_volume_l >= 0),
    rescheduled_to_po_id text,
    rescheduled_sequence_no integer,
    rescheduled_planned_start_time timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (batch_id, line_no)
);
COMMENT ON TABLE milkgraph.production_batch_lines IS 'Baris batch produksi; sumber kandidat: 05_Production_Fulfillment.xlsx. sku_id sumber adalah finished SKU.';

CREATE INDEX IF NOT EXISTS production_batch_lines_finished_sku_idx
    ON milkgraph.production_batch_lines(finished_sku_id);
CREATE INDEX IF NOT EXISTS production_batch_lines_filling_line_idx
    ON milkgraph.production_batch_lines(filling_line_id);
CREATE INDEX IF NOT EXISTS production_batch_lines_order_idx
    ON milkgraph.production_batch_lines(production_order_id);

-- ============================================================
-- 6. Transaksi historis dan trace
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.processing_transactions (
    transaction_id text PRIMARY KEY,
    machine_id text REFERENCES milkgraph.assets(asset_id),
    machine_type text,
    production_group_id text,
    product_name text,
    processing_type text,
    filling_line_ids text,
    activity text,
    required_ready_time timestamptz,
    start_time timestamptz,
    end_time timestamptz,
    duration_hours numeric,
    running_hours numeric,
    volume_l numeric,
    start_level_pct numeric,
    end_level_pct numeric,
    holding_hours numeric,
    downtime_type text,
    source_asset_id text,
    destination_asset_id text,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.processing_transactions IS 'Transaksi proses historis; sumber: 02_Processing_Transactions.xlsx. source_asset_id dan destination_asset_id dipertahankan sebagai teks karena sumber dapat berisi daftar aset dipisah titik koma.';

CREATE INDEX IF NOT EXISTS processing_transactions_group_idx
    ON milkgraph.processing_transactions(production_group_id);
CREATE INDEX IF NOT EXISTS processing_transactions_machine_time_idx
    ON milkgraph.processing_transactions(machine_id, start_time);
CREATE INDEX IF NOT EXISTS processing_transactions_time_idx
    ON milkgraph.processing_transactions(start_time, end_time);

CREATE TABLE IF NOT EXISTS milkgraph.filling_transactions (
    transaction_id text PRIMARY KEY,
    machine_id text REFERENCES milkgraph.filling_machines(asset_id),
    stage text,
    production_order_id text,
    production_group_id text,
    finished_sku_id text REFERENCES milkgraph.finished_skus(finished_sku_id),
    product_name text,
    pack_size_ml numeric,
    market text,
    activity text,
    start_time timestamptz,
    end_time timestamptz,
    duration_hours numeric,
    running_hours numeric,
    output_good_packs numeric,
    output_reject_packs numeric,
    output_volume_l numeric,
    actual_speed_packph numeric,
    related_asset_id text,
    source_asset_id text,
    destination_asset_id text,
    downtime_type text,
    output_sampling_packs numeric,
    output_sampling_volume_l numeric,
    output_reject_volume_l numeric,
    total_output_pcs numeric,
    total_output_volume_l numeric,
    sampling_minutes numeric,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.filling_transactions IS 'Transaksi filling historis; sumber: 01_Filling_Machine_Transactions.xlsx. source_asset_id dan destination_asset_id dipertahankan sebagai teks karena sumber dapat berisi daftar aset dipisah titik koma.';

CREATE INDEX IF NOT EXISTS filling_transactions_group_idx
    ON milkgraph.filling_transactions(production_group_id);
CREATE INDEX IF NOT EXISTS filling_transactions_machine_time_idx
    ON milkgraph.filling_transactions(machine_id, start_time);
CREATE INDEX IF NOT EXISTS filling_transactions_order_idx
    ON milkgraph.filling_transactions(production_order_id);
CREATE INDEX IF NOT EXISTS filling_transactions_time_idx
    ON milkgraph.filling_transactions(start_time, end_time);

CREATE OR REPLACE VIEW milkgraph.batch_trace_view AS
SELECT
    b.batch_id,
    b.batch_code,
    b.production_date,
    b.sequence_no,
    b.production_group_id,
    bl.line_no,
    bl.production_order_id,
    bl.finished_sku_id,
    bl.filling_line_id,
    bl.aseptic_tank_id,
    bl.sterilizer_id,
    bl.target_packs,
    bl.target_volume_l,
    'processing'::text AS trace_source,
    pt.transaction_id,
    pt.machine_id,
    pt.activity,
    pt.start_time,
    pt.end_time,
    pt.volume_l,
    NULL::numeric AS output_good_packs,
    NULL::numeric AS output_volume_l,
    pt.source_asset_id,
    pt.destination_asset_id,
    pt.downtime_type
FROM milkgraph.production_batches b
LEFT JOIN milkgraph.production_batch_lines bl
    ON bl.batch_id = b.batch_id
LEFT JOIN milkgraph.processing_transactions pt
    ON pt.production_group_id = b.production_group_id
UNION ALL
SELECT
    b.batch_id,
    b.batch_code,
    b.production_date,
    b.sequence_no,
    b.production_group_id,
    bl.line_no,
    bl.production_order_id,
    bl.finished_sku_id,
    bl.filling_line_id,
    bl.aseptic_tank_id,
    bl.sterilizer_id,
    bl.target_packs,
    bl.target_volume_l,
    'filling'::text AS trace_source,
    ft.transaction_id,
    ft.machine_id,
    ft.activity,
    ft.start_time,
    ft.end_time,
    NULL::numeric AS volume_l,
    ft.output_good_packs,
    ft.output_volume_l,
    ft.source_asset_id,
    ft.destination_asset_id,
    ft.downtime_type
FROM milkgraph.production_batches b
LEFT JOIN milkgraph.production_batch_lines bl
    ON bl.batch_id = b.batch_id
LEFT JOIN milkgraph.filling_transactions ft
    ON ft.production_group_id = b.production_group_id;
COMMENT ON VIEW milkgraph.batch_trace_view IS 'Trace batch sebagai daftar event proses dan filling lewat production_group_id, tanpa menggandakan baris transaksi.';

-- ============================================================
-- 7. Prediksi pemenuhan dan rekomendasi
-- ============================================================

CREATE TABLE IF NOT EXISTS milkgraph.fulfillment_predictions (
    id bigserial PRIMARY KEY,
    production_date date NOT NULL,
    batch_id text REFERENCES milkgraph.production_batches(batch_id),
    fulfill_status text NOT NULL CHECK (fulfill_status IN ('terpenuhi', 'berisiko', 'tidak_terpenuhi', 'data_tidak_cukup')),
    shortage_l numeric CHECK (shortage_l IS NULL OR shortage_l >= 0),
    bottleneck_asset_id text REFERENCES milkgraph.assets(asset_id),
    risk_reason text,
    input_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    calculated_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.fulfillment_predictions IS 'Hasil prediksi pemenuhan batch. input_facts menyimpan fakta backend yang dipakai perhitungan.';

CREATE INDEX IF NOT EXISTS fulfillment_predictions_date_batch_idx
    ON milkgraph.fulfillment_predictions(production_date, batch_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS fulfillment_predictions_status_idx
    ON milkgraph.fulfillment_predictions(fulfill_status);

CREATE TABLE IF NOT EXISTS milkgraph.recommendations (
    id bigserial PRIMARY KEY,
    production_date date NOT NULL,
    batch_id text REFERENCES milkgraph.production_batches(batch_id),
    prediction_id bigint REFERENCES milkgraph.fulfillment_predictions(id),
    recommendation_type text NOT NULL CHECK (recommendation_type IN ('upgrade_kapasitas', 'naikkan_speed', 'pindahkan_alat', 'geser_jadwal')),
    target_asset_id text REFERENCES milkgraph.assets(asset_id),
    expected_gain numeric,
    reason_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE milkgraph.recommendations IS 'Rekomendasi yang bisa dibuka frontend. reason_facts adalah fakta terstruktur untuk audit dan penjelasan.';

CREATE INDEX IF NOT EXISTS recommendations_date_batch_idx
    ON milkgraph.recommendations(production_date, batch_id);
CREATE INDEX IF NOT EXISTS recommendations_prediction_idx
    ON milkgraph.recommendations(prediction_id);
CREATE INDEX IF NOT EXISTS recommendations_status_idx
    ON milkgraph.recommendations(status);

CREATE OR REPLACE VIEW milkgraph.fulfillment_risk_view AS
SELECT
    b.production_date,
    b.batch_id,
    b.batch_code,
    b.sequence_no,
    b.production_group_id,
    b.status AS batch_status,
    p.id AS prediction_id,
    p.fulfill_status,
    p.shortage_l,
    p.bottleneck_asset_id,
    p.risk_reason,
    p.calculated_at,
    s.asset_name AS bottleneck_asset_name,
    s.current_status AS bottleneck_current_status
FROM milkgraph.production_batches b
LEFT JOIN LATERAL (
    SELECT fp.id, fp.fulfill_status, fp.shortage_l, fp.bottleneck_asset_id, fp.risk_reason, fp.calculated_at
    FROM milkgraph.fulfillment_predictions fp
    WHERE fp.batch_id = b.batch_id
    ORDER BY fp.calculated_at DESC, fp.id DESC
    LIMIT 1
) p ON true
LEFT JOIN milkgraph.asset_current_status_view s
    ON s.asset_id = p.bottleneck_asset_id;
COMMENT ON VIEW milkgraph.fulfillment_risk_view IS 'Risiko pemenuhan terbaru per batch untuk menu Produksi.';

CREATE OR REPLACE VIEW milkgraph.production_daily_view AS
SELECT
    b.production_date,
    b.batch_id,
    b.batch_code,
    b.sequence_no,
    b.production_group_id,
    b.status AS batch_status,
    bl.line_no,
    bl.production_order_id,
    bl.finished_sku_id,
    fs.liquid_sku_id,
    bl.product_name,
    bl.filling_line_id,
    bl.aseptic_tank_id,
    bl.sterilizer_id,
    bl.planned_start_time,
    bl.planned_end_time,
    bl.due_time,
    bl.target_packs,
    bl.target_volume_l,
    r.fulfill_status,
    r.shortage_l,
    r.bottleneck_asset_id,
    r.risk_reason
FROM milkgraph.production_batches b
LEFT JOIN milkgraph.production_batch_lines bl
    ON bl.batch_id = b.batch_id
LEFT JOIN milkgraph.finished_skus fs
    ON fs.finished_sku_id = bl.finished_sku_id
LEFT JOIN milkgraph.fulfillment_risk_view r
    ON r.batch_id = b.batch_id;
COMMENT ON VIEW milkgraph.production_daily_view IS 'Read model Produksi harian berbasis batch.';
