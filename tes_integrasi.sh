#!/usr/bin/env bash
# Tes integrasi lokal milkgraph-ai + stub Jev. Bukan bagian dari service.
set -u
cd "$(dirname "$0")"
PY=.venv/bin/python
PASS=0; FAIL=0
cek() { # nama, kondisi(0/1)
  if [ "$2" -eq 0 ]; then echo "PASS: $1"; PASS=$((PASS+1)); else echo "FAIL: $1"; FAIL=$((FAIL+1)); fi
}
contains() { case "$1" in *"$2"*) return 0;; *) return 1;; esac }

pkill -f "uvicorn app.main" 2>/dev/null; pkill -f stub_jev 2>/dev/null; pkill -f stub_llm 2>/dev/null; sleep 1

# --- Sesi 1: stub agree + key terpasang ---
STUB_MODE=agree $PY stub_jev.py & STUB=$!
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 JEV_MODEL=jev-latest \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi1.log 2>&1 & UVI=$!
sleep 3

H=$(curl -s http://127.0.0.1:8090/health)
contains "$H" '"llm":"jev"'; cek "health llm jev saat key terpasang" $?

R=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R" '"sumber":"template"'; cek "narrate tanpa LLM: sumber template (v3), Jev tetap menilai" $?
contains "$R" '"llm_usage":null'; cek "narrate tanpa LLM: llm_usage null" $?
contains "$R" '"pilihan":"HOLDING_LAMA"'; cek "narrate pilihan Jev HOLDING_LAMA" $?
contains "$R" '"keyakinan_skor":67'; cek "narrate keyakinan_skor 67 (2.67/4)" $?
contains "$R" '"perlu_eskalasi":0.61'; cek "narrate perlu_eskalasi 0.61" $?
contains "$R" '"selisih_dengan_be":false'; cek "narrate selisih false" $?
contains "$R" '"penyebab_utama":"HOLDING_LAMA"'; cek "narrate penyebab utama tetap BE" $?

P=$(curl -s -X POST http://127.0.0.1:8090/ai/repair-priority/explain -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/repair_priority.json)
contains "$P" '"sumber":"template"'; cek "explain tanpa LLM: sumber template (v3)" $?
contains "$P" '"keyakinan_skor":75'; cek "explain keyakinan_skor 75 (3.0/4)" $?
contains "$P" '"risiko_jika_ditunda":0.83'; cek "explain risiko 0.83" $?

C=$(curl -s -X POST http://127.0.0.1:8090/ai/chat -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/chat.json)
contains "$C" '"sumber":"template"'; cek "chat tanpa LLM: sumber template (v3)" $?
contains "$C" 'Berdasarkan fakta yang tersedia: Suhu maksimal selama holding 12,4 derajat'; cek "chat fakta terpilih Jev di depan" $?

K=$(curl -s -X POST http://127.0.0.1:8090/ai/chat -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/chat_tanpa_fakta.json)
contains "$K" 'belum tersedia'; cek "chat tanpa fakta: belum tersedia" $?
contains "$K" '"sumber":"template"'; cek "chat tanpa fakta: sumber template (Jev tidak dipanggil)" $?

S=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8090/ai/chat -H "Content-Type: application/json" -H "X-Service-Token: salah" --data-binary @contoh_payload/chat.json)
[ "$S" = "401" ]; cek "token salah ditolak 401" $?

kill $UVI $STUB 2>/dev/null; sleep 1

# --- Sesi 2: stub disagree ---
STUB_MODE=disagree $PY stub_jev.py & STUB2=$!
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi2.log 2>&1 & UVI=$!
sleep 3
R2=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R2" '"selisih_dengan_be":true'; cek "disagree: selisih true" $?
contains "$R2" 'penilaian Jev berbeda dari ranking backend'; cek "disagree: narasi mencatat perbedaan" $?
contains "$R2" '"penyebab_utama":"HOLDING_LAMA"'; cek "disagree: penyebab utama tetap peringkat 1 BE" $?
kill $UVI $STUB2 2>/dev/null; sleep 1

# --- Sesi 3: key terpasang tapi Jev mati (fallback) ---
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi3.log 2>&1 & UVI=$!
sleep 3
R3=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R3" '"sumber":"template"'; cek "fallback: Jev mati -> sumber template" $?
contains "$R3" '"jev":null'; cek "fallback: field jev null" $?
kill $UVI 2>/dev/null; sleep 1

# --- Sesi 4: tanpa key sama sekali ---
SERVICE_TOKEN=tokentes $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi4.log 2>&1 & UVI=$!
sleep 3
H4=$(curl -s http://127.0.0.1:8090/health)
contains "$H4" '"llm":"template"'; cek "tanpa key: health llm template" $?
kill $UVI 2>/dev/null

# --- Sesi 5: Jev + LLM patuh (lapisan narasi v3 aktif) ---
STUB_MODE=agree $PY stub_jev.py & STUB=$!
STUB_LLM_MODE=patuh $PY stub_llm.py & STUBL=$!
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 \
  LLM_API_KEY=kunci-tes-llm LLM_BASE_URL=http://127.0.0.1:8098 \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi5.log 2>&1 & UVI=$!
sleep 3
H5=$(curl -s http://127.0.0.1:8090/health)
contains "$H5" '"llm":"jev+llm"'; cek "health llm jev+llm saat Jev dan LLM terpasang" $?
R5=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R5" '"sumber":"jev+llm"'; cek "LLM patuh: narrate sumber jev+llm" $?
contains "$R5" 'skor kandidat utama 0,82'; cek "LLM patuh: teks LLM dipakai sebagai narasi" $?
contains "$R5" '"prompt_tokens":245'; cek "LLM patuh: llm_usage prompt_tokens 245" $?
contains "$R5" '"reasoning_tokens":1036'; cek "LLM patuh: llm_usage reasoning_tokens 1036" $?
contains "$R5" '"penyebab_utama":"HOLDING_LAMA"'; cek "LLM patuh: penyebab utama tetap BE" $?
P5=$(curl -s -X POST http://127.0.0.1:8090/ai/repair-priority/explain -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/repair_priority.json)
contains "$P5" '"sumber":"jev+llm"'; cek "LLM patuh: explain sumber jev+llm" $?
C5=$(curl -s -X POST http://127.0.0.1:8090/ai/chat -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/chat.json)
contains "$C5" '"sumber":"jev+llm"'; cek "LLM patuh: chat sumber jev+llm" $?
contains "$C5" 'suhu maksimalnya 12,4 derajat'; cek "LLM patuh: teks LLM dipakai sebagai jawaban chat" $?
kill $UVI $STUB $STUBL 2>/dev/null; sleep 1

# --- Sesi 6: LLM menjawab dengan angka asing -> fallback template ---
STUB_MODE=agree $PY stub_jev.py & STUB=$!
STUB_LLM_MODE=asing $PY stub_llm.py & STUBL=$!
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 \
  LLM_API_KEY=kunci-tes-llm LLM_BASE_URL=http://127.0.0.1:8098 \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi6.log 2>&1 & UVI=$!
sleep 3
R6=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R6" '"sumber":"template"'; cek "LLM asing: narrate fallback template" $?
contains "$R6" 'kemungkinan besar karena holding terlalu lama'; cek "LLM asing: narasi template dipakai" $?
kill $UVI $STUB $STUBL 2>/dev/null; sleep 1

# --- Sesi 7: server LLM error -> fallback template ---
STUB_MODE=agree $PY stub_jev.py & STUB=$!
STUB_LLM_MODE=error $PY stub_llm.py & STUBL=$!
SERVICE_TOKEN=tokentes JEV_API_KEY=kunci-tes JEV_BASE_URL=http://127.0.0.1:8099 \
  LLM_API_KEY=kunci-tes-llm LLM_BASE_URL=http://127.0.0.1:8098 \
  $PY -m uvicorn app.main:app --port 8090 >/tmp/uvi7.log 2>&1 & UVI=$!
sleep 3
R7=$(curl -s -X POST http://127.0.0.1:8090/ai/root-cause/narrate -H "Content-Type: application/json" -H "X-Service-Token: tokentes" --data-binary @contoh_payload/root_cause.json)
contains "$R7" '"sumber":"template"'; cek "LLM error: narrate fallback template" $?
contains "$R7" '"llm_usage":null'; cek "LLM error: llm_usage null" $?
kill $UVI $STUB $STUBL 2>/dev/null

kill $STUB 2>/dev/null
echo "== HASIL: $PASS pass, $FAIL fail =="
