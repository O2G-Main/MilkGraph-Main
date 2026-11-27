# Analisis Mendalam Endpoint MilkGraph Backend (`milkgraph-back`)

Dokumen ini memetakan seluruh endpoint API pada `milkgraph-back` (basis branch `deployment` + pemetaan relasional PostgreSQL batch production) beserta sumber data, kontrak otorisasi, sinkronisasi dengan `milkgraph-front` (`deployment`), dan ketahanan konkurensi.

---

## 1. Ringkasan Arsitektur & Ketahanan Server

- **Database:** PostgreSQL (`schema: milkgraph`) melalui `pgxpool` (`MaxConns` configurable via `DATABASE_POOL_MAX`, default `20`, `statement_timeout=5000ms`, `lock_timeout=5000ms`, `idle_in_transaction_session_timeout=15000ms`).
- **Query Timeout:** Setiap query relasional dibungkus `context.WithTimeout(ctx, 10*time.Second)` sehingga request hang tidak menahan koneksi pool pada beban 1000 concurrent users.
- **Autentikasi & Otorisasi:**
  - `MODE=demo`: menerima `X-Demo-Role` atau `Authorization: Bearer <JWT>`.
  - `MODE=live`: wajib `Authorization: Bearer <JWT>` (HS256) dan menolak `X-Demo-Role` (400).
  - Endpoint publik dokumentasi & health: `GET /healthz`, `GET /readyz`, `GET /docs`, `GET /openapi.yaml`, `GET /api/v1/meta`.

---

## 2. Endpoint Produksi Berbasis Batch (PostgreSQL Relasional)

| Endpoint | Method | Permission | Sumber Tabel / View | Perilaku & Kontrak Kunci |
|---|---|---|---|---|
| `/api/v1/production/daily` | `GET` | - | `production_daily_view` | Parameter `date` opsional; jika kosong memakai tanggal operasional aktif `2026-11-01`. Mengembalikan batch, SKU, line, aseptic tank, sterilizer, status prediksi, dan bottleneck. |
| `/api/v1/production/schedule` | `GET` | - | `production_batches`, `production_batch_lines` | Urut berdasarkan `(production_date, sequence_no, line_no)`. Terpisah dari `pos` (demand). |
| `/api/v1/production/batches` | `POST` | `plan.decide` | `batch_code_rules`, `production_batches`, `production_batch_lines` | Validasi `filling_line_sku_compatibility` & `production_routes` dalam satu transaksi, lalu generate `batch_code` dari `batch_code_rules` aktif. |
| `/api/v1/production/batches/{id}/trace` | `GET` | - | `batch_trace_view` | Trace via `production_group_id` ke `processing_transactions` & `filling_transactions`; menandai `incomplete_sections` bila ada tahap kosong. |
| `/api/v1/production/trace` | `GET` | - | `batch_trace_view` | Menerima query `batch_id` atau `production_group_id`. |
| `/api/v1/production/assets` | `GET` | - | `asset_current_status_view`, `storage_tanks`, `production_machines`, `filling_machines` | Default mengecualikan `node_role = 'physical_pipe'` (`PIPE-01`..`PIPE-10`) sehingga mengembalikan tepat **63 aset operasional**. Parameter `include_pipes=true` menampilkan semua. |
| `/api/v1/production/assets/{id}/status` | `POST` | `downtime.record` | `asset_status_events` | Menambahkan event status terbaru alat (append-only, otomatis tercermin di `asset_current_status_view`). |
| `/api/v1/production/products` | `GET` | - | `products`, `pack_size_codes`, `product_pack_sizes`, `product_market_variants`, `finished_skus` | Memisahkan master produk cair dan finished SKU dari master alat & rules. |
| `/api/v1/production/plans` | `GET` | - | `production_plans`, `production_batch_lines`, `production_batches` | Menampilkan rencana mingguan beserta relasi batch harian yang sudah diturunkan. |
| `/api/v1/production/predictions` | `GET` | - | `fulfillment_predictions` | Mengembalikan hasil prediksi terbaru per tanggal/batch. |
| `/api/v1/production/predictions/run` | `POST` | `plan.decide` | `opening_inventory`, `receiving_plans`, `production_batches`, `fulfillment_predictions`, `recommendations` | Menghitung pemenuhan secara deterministik. Jika snapshot `opening_inventory` belum ada → `data_tidak_cukup` (tanpa angka karangan). Jika kurang pasokan → `tidak_terpenuhi` + `shortage_l` + `bottleneck_asset_id` + otomatis membuat record `recommendations`. |
| `/api/v1/production/recommendations` | `GET` | - | `recommendations` | Mengembalikan rekomendasi terstruktur beserta `reason_facts` JSONB yang bisa dibuka FE. |
| `/api/v1/production/recommendations/{id}` | `PATCH` | `plan.decide` | `recommendations` | Memperbarui status (`draft`, `accepted`, `rejected`, `applied`). |

---

## 3. Sinkronisasi dengan `milkgraph-front` (Branch `deployment`)

Seluruh endpoint yang dikonsumsi `milkgraph-front` branch `deployment` dijaga tetap kompatibel 100%:
- `GET /api/v1/assets` dipertahankan untuk `components/tangki/tangki.tsx`, sementara endpoint relasional baru berada di `/api/v1/production/assets`.
- `GET /api/v1/scenario/november` & `/api/v1/scenario/november/tanks` tetap melayani snapshot 28 tangki (`lib/api/scenario-nov.ts`).
- `GET /api/v1/trace/history` & `/api/v1/trace/history/backward` tetap melayani `lib/api/trace-historis.ts`.
- `GET /api/v1/schedules/latest`, `/api/v1/pos`, `/api/v1/dashboard/executive` tetap konsisten dengan `lib/api/radar-jadwal.ts` dan `lib/api/contract.ts`.
- `GET /api/v1/supply/rt-arrivals`, `/api/v1/trace/transfers`, `/api/v1/downtime-events`, `/api/v1/maintenance/recommendation`, `/api/v1/roles`, `/api/v1/notifications` seluruhnya tetap aktif tanpa breaking change.
