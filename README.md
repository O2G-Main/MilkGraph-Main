# milkgraph-ai

Service AI untuk MilkGraph. Menerima fakta yang sudah dihitung Backend, lalu mengembalikan teks narasi. Stateless: tidak menyimpan data, tidak mengakses database.

Kontrak antarmuka: dokumen "Kontrak API AI MilkGraph" v2, 18 November 2026. Kalau kontrak dan kode berbeda, kontrak yang benar.

## Status

Jev (TypeSafe System One) terintegrasi sebagai penilai: fakta dari Backend dipetakan menjadi pertanyaan bertipe (choice, score, noul), jawaban terstruktur Jev dilampirkan pada respons (field `jev`), dan narasi tetap disusun template dari fakta. Penyebab utama selalu peringkat 1 dari Backend; kalau pilihan Jev berbeda, field `selisih_dengan_be` berisi true dan narasi mencatat perbedaan itu untuk ditinjau manusia.

Kalau `JEV_API_KEY` belum terpasang atau Jev tidak terjangkau, service jatuh ke mode template murni: field `jev` berisi null dan `sumber` berisi `"template"`. `/health` mengembalikan `"llm": "jev"` bila key terpasang, `"template"` bila belum.

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

`JEV_BASE_URL` kosong berarti default `https://api.typesafe.ai`; `JEV_MODEL` kosong berarti default `jev-latest`.

## Jalan lokal

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8090
```

Uji dengan payload contoh dari kontrak di `contoh_payload/`:

```sh
curl -s http://127.0.0.1:8090/health
curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate \
  -H "Content-Type: application/json" \
  -H "X-Service-Token: <token-dari-env>" \
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

Port internal 8090. Container berada di docker network yang sama dengan Backend. Jangan publish port ke publik.

## Struktur

```
app/main.py        endpoint dan cek token
app/schemas.py     skema request dan respons sesuai kontrak
app/jev.py         client Jev System One (HTTP, tanpa dependensi baru)
app/layanan.py     orkestrasi: fakta BE -> pertanyaan Jev -> narasi template
app/templates.py   penyusun narasi template dan fallback
cek_kontrak.py     self-check payload kontrak
contoh_payload/    payload contoh dari kontrak
```

## Berikutnya

- `POST /ai/predict/volume`, skemanya dirinci setelah v1 jalan.
