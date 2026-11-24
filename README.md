# 🥛 MilkGraph

> **Context Graph System for Liquid Food & Dairy Processing Operations**  
> *Dikembangkan untuk PLAY IT PLUS Deeptech Hackathon 2026*

---

[![Architecture](https://img.shields.io/badge/Architecture-Multi--Branch-blue.svg)](#-arsitektur-multi-branch)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2016%20%7C%20React%2019%20%7C%20Three.js-black.svg)](https://github.com/O2G-Main/MilkGraph-Main/tree/FE)
[![Backend](https://img.shields.io/badge/Backend-Go%201.24%20%7C%20PostgreSQL-00ADD8.svg)](https://github.com/O2G-Main/MilkGraph-Main/tree/BE)
[![AI Service](https://img.shields.io/badge/AI%20Service-FastAPI%20%7C%20Jev%20System%20One-3776AB.svg)](https://github.com/O2G-Main/MilkGraph-Main/tree/AI)

---

## 📌 Gambaran Umum

**MilkGraph** adalah sistem operasional cerdas dan *digital twin* berbasis **Context Graph** untuk industri pengolahan susu cair dan minuman (*liquid food & beverage / FMCG dairy*). 

Dalam operasional pabrik susu skala besar, data truk tangki susu (*road tanker*), antrean *unloading bay*, hasil laboratorium (*LIMS*), level tangki silo/transit, jadwal pembersihan pipa (*CIP - Clean-In-Place*), hingga mesin pengemasan (*filling line*) kerap terisolasi dalam silo-silo data yang terpisah. Ketika terjadi kontaminasi, *downtime*, atau penumpukan antrean, investigasi manual membutuhkan waktu lama dan memicu efek domino operasional yang merugikan.

MilkGraph menyatukan seluruh aliran fisik, status peralatan, dan data kualitas ke dalam satu grafik konteks digital interaktif yang mampu melakukan:
1. **End-to-End Batch Traceability:** Pelacakan silsilah batch maju & mundur (*genealogy trace*) secara instan dari truk tangki hingga produk jadi.
2. **Dynamic Scheduling & What-If Simulator:** Rekomendasi urutan produksi dan penanganan antrean berbasis batasan fisik (*CIP, holding time, perishability, mixer compatibility*) dan dampak finansial.
3. **Root-Cause Analysis & Explainable AI:** Penjelasan kausalitas gangguan operasional secara transparan dan berlandaskan fakta backend (*grounded facts*).
4. **3D Plant Digital Twin:** Pemantauan kondisi spasial pabrik secara langsung (*realtime isometric/perspective 3D plant scene*).

---

## 🌿 Arsitektur Multi-Branch

Repositori ini menggunakan strategi **Modular Multi-Branch Isolation**. Branch `main` sengaja dipertahankan bersih (*clean*) hanya berisi dokumentasi arsitektur dan panduan navigasi sistem, sedangkan seluruh basis kode implementasi dipisahkan secara independen ke dalam masing-masing branch spesifik:

```mermaid
gitGraph
   commit id: "Init Portal"
   branch FE
   checkout FE
   commit id: "Next.js 16 + Three.js + Flow"
   checkout main
   branch BE
   checkout BE
   commit id: "Go 1.24 REST API + SSE + Store"
   checkout main
   branch AI
   checkout AI
   commit id: "FastAPI + Jev AI Narrator"
   checkout main
```

| Branch | Modul & Lingkup | Teknologi Utama | Tanggung Jawab Utama |
|---|---|---|---|
| [`main`](https://github.com/O2G-Main/MilkGraph-Main) | **Repository Entrypoint** | Markdown | Portal dokumentasi arsitektur, panduan navigasi antar-cabang, dan standar proyek. |
| [`FE`](https://github.com/O2G-Main/MilkGraph-Main/tree/FE) | **Frontend Web Application** | Next.js 16 (App Router), React 19, TypeScript, Three.js, `@xyflow/react`, Tailwind CSS v4, Motion | 14 Halaman operasional, 3D Plant Digital Twin visualizer, grafik topologi interaktif, manajemen alur kerja shift, antarmuka chat asisten operasional. |
| [`BE`](https://github.com/O2G-Main/MilkGraph-Main/tree/BE) | **Core Backend & Graph Engine** | Go 1.24, PostgreSQL 16 (`pgx/v5`), SSE Hub, REST JSON `/api/v1` | Mesin bisnis utama, validasi 6 golden constraint operasional, audit log *append-only*, Server-Sent Events (SSE) realtime dispatcher, kalkulasi silsilah transfer batch, dan master data catalog. |
| [`AI`](https://github.com/O2G-Main/MilkGraph-Main/tree/AI) | **AI Narrative Service** | Python 3.11+, FastAPI, Uvicorn, Jev TypeSafe System One | Layanan *stateless* untuk merangkai narasi akar masalah (*root cause*), penjelasan prioritas perbaikan mesin (*repair priority*), dan chat interaktif yang berlandaskan fakta yang telah dihitung backend. |

---

## 🏗️ Topologi & Arsitektur Sistem

Sistem MilkGraph didesain dengan prinsip **Strict Separation of Concerns**:
> *"Graph menyimpan fakta, Solver mengambil keputusan, AI menjelaskan."*

AI **tidak pernah** mengarang nilai batas atau keputusan kuantitatif. Semua kalkulasi kelayakan dan biaya ditangani secara deterministik oleh backend sebelum dijelaskan ke operator.

```mermaid
flowchart TD
    subgraph Client ["Client Layer"]
        UI["Next.js 16 Frontend App\n(React 19 · Three.js 3D · @xyflow/react)"]
    end

    subgraph CoreBackend ["Core Backend Layer (Go 1.24)"]
        API["REST JSON /api/v1 & SSE Hub"]
        Rules["Deterministic Rules Engine\n(Golden Rules & Constraints)"]
        TraceSvc["Traceability & Graph Engine\n(Batch Genealogy & Mixture Traversal)"]
        Store["PostgreSQL Store\n(State, Decisions, Audit Log, SSE Outbox)"]
    end

    subgraph AIService ["AI Narrative Layer (Python FastAPI)"]
        AINarration["FastAPI /ai/* Endpoints"]
        JevLLM["Jev TypeSafe System One\n(Structured Validator)"]
        TemplateFallback["Deterministic Narrative Templates\n(Safe Fallback)"]
    end

    subgraph DataSources ["Data Ingestion & Master"]
        MasterCSV["13 Master Data Schemas\n(Assets, Lines, SKUs, CIP, Compatibility)"]
        SensorSim["Telemetry & Tank Level Simulator\n(RT Arrivals, Lab Status, Line Speed)"]
    end

    DataSources --> API
    UI <-->|HTTP REST / SSE Stream| API
    API --> Rules
    API --> TraceSvc
    API <--> Store
    API -->|Payload Fakta Terkalkulasi| AINarration
    AINarration --> JevLLM
    AINarration --> TemplateFallback
    AINarration -.->|Narasi Kausalitas Terstruktur| API
```

---

## ⚡ Fitur Utama

### 1. 🔍 End-to-End Batch Genealogy & Traceability
- **Backward Trace (Lot ke Truk):** Lacak asal muasal produk cacat dari kemasan akhir (*Finished Goods*) kembali melewati jalur pengisian, tangki pasteurisasi/aging, hingga truk tangki susu mentah (*Road Tanker*) yang mengirimkannya.
- **Forward Trace (Truk ke Seluruh Pasar):** Deteksi seluruh lot produk yang berpotensi tercemar bila suatu truk susu mentah dinyatakan *out-of-spec* di lab.
- **Perhitungan Fraksi Campuran (*Mixture Share*):** Menghitung proporsi persentase volume bahan yang tercampur di dalam tangki berdasarkan jendela waktu transfer.

### 2. 🏭 3D Plant Digital Twin & Simulation
- Visualisasi spasial pabrik pengolahan susu secara 3 dimensi (*Three.js*) dengan sudut pandang isometrik, bird-eye, dan fokus per zona.
- Pemantauan visual langsung terhadap:
  - Antrean truk di *Receiving Yard*.
  - Aktivitas pembongkaran di *Unloading Bays* (Bay 1 & Bay 2).
  - Level kapasitas tangki *Raw Milk Silo*, *Buffer Tank*, dan *Finished Milk Tank*.
  - Status aktif/downtime pada *Filling Lines* (Tetra Pak / Combibloc).

### 3. 🕸️ Interactive Context Graph Visualizer
- Topologi graf relasional interaktif menggunakan `@xyflow/react`.
- Merepresentasikan hubungan fisik: `(Truk Tanker) -> (Unloading Bay) -> (Silo) -> (Pasteurizer) -> (Aseptic Tank) -> (Filling Line) -> (Finished Goods)`.
- Menandai simpul (*node*) dan jalur (*edge*) yang mengalami gangguan, botol leher (*bottleneck*), atau pelanggaran batasan operasional (*constraint violation*).

### 4. ⏱️ Dynamic Scheduling & What-If Simulator
- Penjadwalan ulang otomatis saat terjadi anomali (misal: *CIP* molor, truk datang terlambat, atau pengujian lab membutuhkan waktu lebih lama).
- Mempertimbangkan 6 batasan operasional utama (*Golden Rules*):
  - Kesiapan pengujian mikrobiologi & antibiotik lab.
  - Batas waktu simpan susu mentah sebelum diproses (*residence time / perishability limit*).
  - Ketersediaan tangki penampung kosong (*no starvation / no overflow*).
  - Kompatibilitas varian rasa produk dengan jalur pipa (*line dedikasi*).
  - Waktu jeda dan persiapan pembersihan sanitasi (*CIP & changeover*).
  - Dampak finansial: minimalisasi biaya *downtime*, penalti keterlambatan, dan pemborosan bahan.

### 5. 🧠 Root Cause Analysis & Factual AI Assistant
- Analisis sebab-akibat insiden produksi berantai (*domino effect analysis*).
- Integrasi **Jev TypeSafe System One** dengan fallback template deterministik untuk memberikan narasi logis kepada operator pabrik tanpa risiko halusinasi.

### 6. 🛡️ Quality Gate & Hold Management
- Alur kerja persetujuan peran (*Role-Based Access Control*): Operator Lapangan, Supervisor, Lab QA, dan Plant Planner.
- Aksi terarah untuk menaruh status **HOLD** pada lot tertentu, isolasi produk di gudang, serta penerbitan instruksi penanganan darurat yang tercatat permanen di audit log (*append-only*).

---

## 🚀 Panduan Menjalankan Tiap Branch

### 1. Kloning Repositori

Untuk mengkloning branch tertentu secara langsung:

```bash
# Kloning branch Frontend
git clone -b FE https://github.com/O2G-Main/MilkGraph-Main.git milkgraph-frontend

# Kloning branch Backend
git clone -b BE https://github.com/O2G-Main/MilkGraph-Main.git milkgraph-backend

# Kloning branch AI
git clone -b AI https://github.com/O2G-Main/MilkGraph-Main.git milkgraph-ai
```

---

### 2. Menjalankan Frontend (`FE`)

```bash
cd milkgraph-frontend

# Pasang dependensi
pnpm install

# Salin konfigurasi environment
cp .env.example .env.local

# Jalankan server pengembangan
pnpm dev
```
Akses antarmuka di: `http://localhost:3000`

---

### 3. Menjalankan Backend (`BE`)

**Prasyarat:** Go 1.24+ dan PostgreSQL 16+.

```bash
cd milkgraph-backend

# Salin environment
cp .env.example .env

# Jalankan via Docker Compose (Backend + PostgreSQL)
docker compose up --build
```

Atau jalankan secara native:
```bash
export DATABASE_URL="postgres://postgres:password@127.0.0.1:5432/milkgraph?sslmode=disable"
go run ./cmd/server
```
Endpoint REST API berjalan di: `http://127.0.0.1:8080/api/v1`  
Cek kesehatan server: `curl http://127.0.0.1:8080/api/v1/meta`

---

### 4. Menjalankan AI Service (`AI`)

**Prasyarat:** Python 3.11+.

```bash
cd milkgraph-ai

# Buat virtual environment
python -m venv .venv
source .venv/bin/activate  # Di Windows: .venv\Scripts\activate

# Pasang dependensi
pip install -r requirements.txt

# Salin konfigurasi environment
cp .env.example .env

# Jalankan service Uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8090
```
Cek status layanan AI: `curl http://127.0.0.1:8090/health`

---

## 🧪 Validasi & Pengujian

Setiap cabang dilengkapi dengan rangkaian unit testing dan validasi skema otomatis:

- **Frontend:**
  ```bash
  pnpm lint
  pnpm typecheck
  pnpm test
  ```
- **Backend:**
  ```bash
  go vet ./...
  go test ./...
  ```
- **AI Service:**
  ```bash
  python cek_kontrak.py
  python tes_llm.py
  python tes_regresi_audit.py
  ```

---

## 📦 Pemetaan Port Operasional

| Komponen | Host Port | Protokol | Keterangan |
|---|---|---|---|
| **Frontend** | `3000` | HTTP | Next.js Web UI & Visualizer |
| **Backend** | `8080` | HTTP / SSE | Go Core REST API `/api/v1` |
| **AI Service** | `8090` | HTTP | FastAPI Internal AI Service |
| **PostgreSQL** | `5432` | TCP | Relational DB & Audit Store |

---

## 👥 Tim Pengembang

Proyek ini dirancang dan dikembangkan oleh tim **O2G** untuk **PLAY IT PLUS Deeptech Hackathon 2026**.

---

<p align="center">
  <sub>MilkGraph · Precision Manufacturing Intelligence for Liquid Food Operations</sub>
</p>
