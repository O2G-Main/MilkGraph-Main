# milkgraph-ai

Service AI untuk MilkGraph. Menerima fakta yang sudah dihitung Backend, lalu mengembalikan teks narasi. Stateless: tidak menyimpan data, tidak mengakses database.

Kontrak antarmuka: dokumen "Kontrak API AI MilkGraph" v1, 14 November 2026. Kalau kontrak dan kode berbeda, kontrak yang benar.

## Status

Mode template deterministik. Jev belum dipanggil, jadi `sumber` selalu `"template"` dan `/health` mengembalikan `"llm": "template"`.

## Endpoint

| Method | Path | Fungsi |
| --- | --- | --- |
| GET | `/health` | cek hidup |
| POST | `/ai/root-cause/narrate` | narasi akar masalah |
| POST | `/ai/repair-priority/explain` | penjelasan urutan prioritas perbaikan |
| POST | `/ai/chat` | jawaban dari `konteks_fakta` |

Semua endpoint `/ai/*` butuh header `X-Service-Token` yang cocok dengan env `SERVICE_TOKEN`. Kalau `SERVICE_TOKEN` kosong, pengecekan dimatikan, hanya untuk tes lokal.

`label_data` diteruskan apa adanya dari Backend dan wajib ikut tampil di FE. Selama data belum hasil lapangan, nilainya `"simulasi"`.

## Env

Salin `.env.example` ke `.env` lalu isi. Jangan commit `.env`.

```env
JEV_API_KEY=
JEV_BASE_URL=
JEV_MODEL=
SERVICE_TOKEN=
```

## Jalan lokal

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
SERVICE_TOKEN=token-tes-lokal .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8090
```

Uji dengan payload contoh dari kontrak di `contoh_payload/`:

```sh
curl -s http://127.0.0.1:8090/health
curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: token-tes-lokal" \
  --data-binary @contoh_payload/root_cause.json
```

Self-check skema tanpa server:

```sh
.venv/Scripts/python cek_kontrak.py
```

## Docker

```sh
docker build -t milkgraph-ai .
docker run -d --name milkgraph-ai --env-file .env --network <network-backend> milkgraph-ai
```

Port internal 8090. Container berada di docker network yang sama dengan Backend, dan Backend memanggil `http://milkgraph-ai:8090`. Jangan publish port ke publik.

## Struktur

```
app/main.py        endpoint dan cek token
app/schemas.py     skema request dan respons sesuai kontrak
app/templates.py   penyusun narasi template
cek_kontrak.py     self-check payload kontrak
contoh_payload/    payload contoh dari kontrak
```

## Berikutnya

- Integrasi Jev, dengan template tetap dipakai sebagai fallback saat Jev error atau tidak terjangkau.
- `POST /ai/predict/volume`, skemanya dirinci setelah v1 jalan.
