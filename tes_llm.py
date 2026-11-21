"""Tes lapisan narasi LLM (kontrak v3) dengan server LLM palsu lokal.

Jev di-monkeypatch dengan jawaban stub, LLM dilayani server HTTP palsu di
proses yang sama (mode patuh, asing, error, lambat). Tanpa kunci asli.
Jalankan: .venv/bin/python tes_llm.py
"""

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from app import jev, layanan, llm, main, templates
from app.schemas import ChatRequest, RepairPriorityRequest, RootCauseRequest

DIR = Path(__file__).parent / "contoh_payload"

TEKS_NARASI = (
    "Batch FG-1013-07 keluar spesifikasi QC kemungkinan besar karena "
    "holding terlalu lama. Batch tertahan 70 menit di Holding RT-26 dan "
    "suhu naik sampai 12,4 derajat, melewati batas 8 derajat, dengan "
    "skor kandidat utama 0,82 berbanding 0,41 untuk kandidat lainnya."
)
TEKS_PENJELASAN = (
    "Prioritas pertama adalah melepas batch dari Holding RT-26, dan "
    "urutan ini menutup semua pelanggaran constraint, dari 3 pelanggaran "
    "menjadi 0 dari total 6 constraint yang dicek solver."
)
TEKS_CHAT = (
    "Batch FG-1013-07 ditolak QC karena tertahan 70 menit di Holding "
    "RT-26 dan suhu maksimalnya 12,4 derajat, melewati batas aman "
    "8 derajat."
)
TEKS_ASING = (
    "Suhu batch mencapai 99,9 derajat dan kerugian diperkirakan mencapai "
    "250 juta rupiah sehingga perlu tindakan segera."
)
USAGE = {
    "prompt_tokens": 245,
    "completion_tokens": 1133,
    "completion_tokens_details": {"reasoning_tokens": 1036},
    "total_tokens": 1378,
}


class ServerPalsu:
    mode = "patuh"
    panggilan = 0
    jeda = 0.0


class HandlerPalsu(BaseHTTPRequestHandler):
    def do_POST(self):
        ServerPalsu.panggilan += 1
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if ServerPalsu.mode == "error":
            self.send_response(500)
            self.end_headers()
            return
        if ServerPalsu.jeda:
            time.sleep(ServerPalsu.jeda)
        user = ""
        for pesan in body.get("messages", []):
            if pesan.get("role") == "user":
                user = pesan.get("content", "")
        if ServerPalsu.mode == "asing":
            teks = TEKS_ASING
        elif "narasi akar masalah" in user:
            teks = TEKS_NARASI
        elif "prioritas perbaikan" in user:
            teks = TEKS_PENJELASAN
        else:
            teks = TEKS_CHAT
        data = json.dumps(
            {
                "model": "muse-wonder-1.0",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": teks},
                        "finish_reason": "stop",
                    }
                ],
                "usage": USAGE,
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), HandlerPalsu)
port = server.server_address[1]
threading.Thread(target=server.serve_forever, daemon=True).start()

os.environ["LLM_BASE_URL"] = f"http://127.0.0.1:{port}"
os.environ["LLM_API_KEY"] = "kunci-tes-llm"


def muat(nama, model):
    return model.model_validate(json.loads((DIR / nama).read_text(encoding="utf-8")))


# --- /health: kombinasi konfigurasi Jev dan LLM ---
os.environ.pop("JEV_API_KEY", None)
assert main.health().llm == "llm"  # hanya LLM
os.environ["JEV_API_KEY"] = "kunci-tes"
assert main.health().llm == "jev+llm"  # keduanya
del os.environ["LLM_API_KEY"]
assert main.health().llm == "jev"  # hanya Jev
del os.environ["JEV_API_KEY"]
assert main.health().llm == "template"  # keduanya kosong
os.environ["LLM_API_KEY"] = "kunci-tes-llm"
print("PASS: health mencerminkan kombinasi Jev dan LLM")


# --- Jev stub lewat monkeypatch ---
def jev_panggil_palsu(state, questions):
    if "penyebab_utama" in questions:
        answers = {
            "penyebab_utama": {
                "choice": "HOLDING_LAMA",
                "probabilities": {"HOLDING_LAMA": 1.0, "RANTAI_DINGIN_PUTUS": 0.0},
                "confidence": 1.0,
            },
            "keyakinan_diagnosis": {"score": 2.67},
            "perlu_eskalasi": {"noul": 0.61},
        }
    elif "keyakinan_prioritas" in questions:
        answers = {
            "keyakinan_prioritas": {"score": 3.0},
            "risiko_jika_ditunda": {"noul": 0.83},
        }
    elif "konteks_menjawab" in questions:
        answers = {
            "konteks_menjawab": {"noul": 0.92},
            "fakta_paling_relevan": {"choice": "2"},
        }
    else:
        answers = {}
    return {"model": "jev-1.14.0", "answers": answers}


jev.tersedia = lambda: True
jev.panggil = jev_panggil_palsu

req_rc = muat("root_cause.json", RootCauseRequest)
req_rp = muat("repair_priority.json", RepairPriorityRequest)
req_chat = muat("chat.json", ChatRequest)
narasi_template = templates.narasi_akar_masalah(req_rc).narasi

# --- (a) jalur sukses dan (f) llm_usage terisi ---
ServerPalsu.mode = "patuh"
r = layanan.narasi_akar_masalah(req_rc)
assert r.sumber == "jev+llm", r.sumber
assert r.narasi == TEKS_NARASI
assert r.jev is not None and r.jev.pilihan == "HOLDING_LAMA"
assert r.llm_usage is not None
assert r.llm_usage.prompt_tokens == 245
assert r.llm_usage.completion_tokens == 1133
assert r.llm_usage.reasoning_tokens == 1036
print("PASS: (a)(f) narrate sukses, sumber jev+llm, llm_usage dari usage provider")

r = layanan.penjelasan_prioritas(req_rp)
assert r.sumber == "jev+llm" and r.penjelasan == TEKS_PENJELASAN
assert r.llm_usage is not None and r.llm_usage.prompt_tokens == 245
print("PASS: (a) explain sukses, sumber jev+llm")

r = layanan.jawaban_chat(req_chat)
assert r.sumber == "jev+llm" and r.jawaban == TEKS_CHAT
assert r.llm_usage is not None
print("PASS: (a) chat sukses, sumber jev+llm")

# --- (b) angka asing: fallback template, usage tetap dilaporkan ---
ServerPalsu.mode = "asing"
r = layanan.narasi_akar_masalah(req_rc)
assert r.sumber == "template", r.sumber
assert r.narasi == narasi_template
assert r.llm_usage is not None  # token sudah terbakar walau teks dibuang
print("PASS: (b) angka asing LLM dibuang, fallback template")

# --- (c) server LLM error: fallback template ---
ServerPalsu.mode = "error"
r = layanan.narasi_akar_masalah(req_rc)
assert r.sumber == "template" and r.narasi == narasi_template
assert r.llm_usage is None
print("PASS: (c) LLM error, fallback template")

# --- (c2) timeout: fallback template ---
ServerPalsu.mode = "patuh"
ServerPalsu.jeda = 3.0
llm.TIMEOUT_DETIK = 1
try:
    r = layanan.narasi_akar_masalah(req_rc)
finally:
    llm.TIMEOUT_DETIK = 15
    ServerPalsu.jeda = 0.0
assert r.sumber == "template" and r.narasi == narasi_template
assert r.llm_usage is None
print("PASS: (c) LLM timeout, fallback template")

# --- (d) tanpa LLM_API_KEY: perilaku v2, LLM tidak dipanggil ---
del os.environ["LLM_API_KEY"]
sebelum = ServerPalsu.panggilan
r = layanan.narasi_akar_masalah(req_rc)
assert r.narasi == narasi_template and r.llm_usage is None
assert ServerPalsu.panggilan == sebelum
os.environ["LLM_API_KEY"] = "kunci-tes-llm"
print("PASS: (d) tanpa key LLM, perilaku template dan LLM tidak dipanggil")

# --- (e) chat di bawah ambang relevansi: LLM tidak dipanggil sama sekali ---
def jev_panggil_gerbang(state, questions):
    return {
        "model": "jev-1.14.0",
        "answers": {
            "konteks_menjawab": {"noul": 0.2},
            "fakta_paling_relevan": {"choice": "1"},
        },
    }


jev.panggil = jev_panggil_gerbang
sebelum = ServerPalsu.panggilan
r = layanan.jawaban_chat(req_chat)
assert "belum tersedia" in r.jawaban
assert r.llm_usage is None
assert ServerPalsu.panggilan == sebelum
print("PASS: (e) gerbang relevansi chat berhenti sebelum LLM")

server.shutdown()
print("tes_llm: OK")
