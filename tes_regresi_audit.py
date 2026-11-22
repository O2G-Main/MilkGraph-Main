"""Tes regresi untuk tiga temuan audit layanan AI (K1, S1, S2).

K1: putus koneksi di tengah respons (reset oleh server palsu) wajib jatuh
ke fallback template pada klien Jev dan klien LLM, bukan error.
S1: tanpa penilaian Jev, sumber tetap "template" walaupun teks ditulis LLM.
S2: pada jalur selisih, catatan perbedaan wajib selalu ada pada narasi dan
penyebab_utama tetap peringkat 1 BE.
Jalankan: .venv/bin/python tes_regresi_audit.py
"""

import json
import os
import socket
import struct
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from app import jev, layanan, llm, templates
from app.schemas import RepairPriorityRequest, RootCauseRequest

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
TEKS_SELISIH_MENYEBUT = (
    "Batch FG-1013-07 keluar spesifikasi QC kemungkinan besar karena "
    "holding terlalu lama, tertahan 70 menit di Holding RT-26 dengan "
    "suhu sampai 12,4 derajat melewati batas 8 derajat. Penilaian Jev "
    "berbeda dari ranking backend dan perbedaan ini perlu ditinjau "
    "manusia."
)
USAGE = {
    "prompt_tokens": 245,
    "completion_tokens": 1133,
    "completion_tokens_details": {"reasoning_tokens": 1036},
    "total_tokens": 1378,
}


# --- Server LLM palsu yang patuh, dengan mode teks selisih ---
class ServerPalsu:
    mode = "patuh"


class HandlerPalsu(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        user = ""
        for pesan in body.get("messages", []):
            if pesan.get("role") == "user":
                user = pesan.get("content", "")
        if "prioritas perbaikan" in user:
            teks = TEKS_PENJELASAN
        elif ServerPalsu.mode == "selisih_menyebut":
            teks = TEKS_SELISIH_MENYEBUT
        else:
            teks = TEKS_NARASI
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


# --- Server palsu yang me-reset koneksi di tengah respons ---
class HandlerReset(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        body = b'{"model": "palsu", "answers": {'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body) + 100))
        self.end_headers()
        self.wfile.write(body)
        self.wfile.flush()
        # Linger 0: penutupan soket menjadi RST, sisa body tidak pernah
        # sampai dan klien membaca koneksi yang ter-reset di tengah baca.
        self.connection.setsockopt(
            socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0)
        )
        self.close_connection = True
        self.connection.close()

    def log_message(self, *args):
        pass


def jalankan_server(handler):
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, server.server_address[1]


server_llm, port_llm = jalankan_server(HandlerPalsu)
server_reset, port_reset = jalankan_server(HandlerReset)
URL_LLM = f"http://127.0.0.1:{port_llm}"
URL_RESET = f"http://127.0.0.1:{port_reset}"

os.environ["LLM_BASE_URL"] = URL_LLM
os.environ["LLM_API_KEY"] = "kunci-tes-llm"


def muat(nama, model):
    return model.model_validate(json.loads((DIR / nama).read_text(encoding="utf-8")))


req_rc = muat("root_cause.json", RootCauseRequest)
req_rp = muat("repair_priority.json", RepairPriorityRequest)
narasi_template = templates.narasi_akar_masalah(req_rc).narasi

# --- K1a: koneksi Jev ter-reset di tengah respons mengembalikan None ---
os.environ["JEV_API_KEY"] = "kunci-tes"
os.environ["JEV_BASE_URL"] = URL_RESET
assert jev.panggil("state", {"q": {"type": "noul"}}) is None
print("PASS: K1 jev.panggil jatuh ke None saat koneksi ter-reset")

# --- K1b: koneksi LLM ter-reset di tengah respons mengembalikan None ---
os.environ["LLM_BASE_URL"] = URL_RESET
assert llm.tulis("acuan", "instruksi") is None
os.environ["LLM_BASE_URL"] = URL_LLM
print("PASS: K1 llm.tulis jatuh ke None saat koneksi ter-reset")

# --- K1c: reset di tingkat layanan tidak melempar, fallback template ---
os.environ["LLM_BASE_URL"] = URL_RESET
r = layanan.narasi_akar_masalah(req_rc)
assert r.sumber == "template" and r.narasi == narasi_template
assert r.jev is None and r.llm_usage is None
os.environ["LLM_BASE_URL"] = URL_LLM
print("PASS: K1 layanan tetap menjawab template saat Jev dan LLM ter-reset")


# --- Jev stub lewat monkeypatch ---
def jev_panggil_sepakat(state, questions):
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
    else:
        answers = {}
    return {"model": "jev-1.14.0", "answers": answers}


def jev_panggil_selisih(state, questions):
    if "penyebab_utama" in questions:
        answers = {
            "penyebab_utama": {
                "choice": "RANTAI_DINGIN_PUTUS",
                "probabilities": {"HOLDING_LAMA": 0.0, "RANTAI_DINGIN_PUTUS": 1.0},
                "confidence": 1.0,
            },
            "keyakinan_diagnosis": {"score": 2.67},
            "perlu_eskalasi": {"noul": 0.61},
        }
    else:
        answers = {}
    return {"model": "jev-1.14.0", "answers": answers}


# --- S1: Jev tidak tersedia, LLM aktif, sumber tetap "template" ---
jev.tersedia = lambda: False
ServerPalsu.mode = "patuh"
r = layanan.narasi_akar_masalah(req_rc)
assert r.jev is None
assert r.narasi == TEKS_NARASI  # teks memang ditulis LLM
assert r.sumber == "template", r.sumber  # tetapi label tidak mengklaim Jev
print("PASS: S1 narrate tanpa Jev berlabel template walau teks dari LLM")

r = layanan.penjelasan_prioritas(req_rp)
assert r.jev is None
assert r.penjelasan == TEKS_PENJELASAN
assert r.sumber == "template", r.sumber
print("PASS: S1 explain tanpa Jev berlabel template walau teks dari LLM")

# --- S2: selisih, LLM diam soal perbedaan, kode menambahkan catatan ---
jev.tersedia = lambda: True
jev.panggil = jev_panggil_selisih
ServerPalsu.mode = "patuh"  # TEKS_NARASI tidak memuat penanda perbedaan
r = layanan.narasi_akar_masalah(req_rc)
assert r.selisih_dengan_be is True
assert r.jev is not None and r.jev.pilihan == "RANTAI_DINGIN_PUTUS"
assert r.penyebab_utama == "HOLDING_LAMA"  # peringkat 1 BE tidak berubah
assert r.sumber == "jev+llm"
assert r.narasi.startswith(TEKS_NARASI)
assert "berbeda dari ranking backend" in r.narasi
assert "ditinjau manusia" in r.narasi
print("PASS: S2 catatan selisih ditambahkan kode, penyebab utama tetap BE")

# --- S2b: LLM sudah menyebut perbedaan, catatan tidak digandakan ---
ServerPalsu.mode = "selisih_menyebut"
r = layanan.narasi_akar_masalah(req_rc)
assert r.selisih_dengan_be is True and r.penyebab_utama == "HOLDING_LAMA"
assert r.narasi == TEKS_SELISIH_MENYEBUT
assert "Catatan:" not in r.narasi
print("PASS: S2 catatan tidak digandakan bila LLM sudah menyebut perbedaan")

server_llm.shutdown()
server_reset.shutdown()
print("tes_regresi_audit: OK")
