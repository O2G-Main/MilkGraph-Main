"""Stub server LLM OpenAI-compatible untuk tes lokal. Bukan bagian dari service.

Mode lewat env STUB_LLM_MODE: "patuh" (teks hanya memakai angka dari fakta),
"asing" (teks mengandung angka yang tidak ada di fakta, untuk menguji
validasi), atau "error" (selalu balas HTTP 500).
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = os.environ.get("STUB_LLM_MODE", "patuh")

TEKS_PATUH = {
    "narasi": (
        "Batch FG-1013-07 keluar spesifikasi QC kemungkinan besar karena "
        "holding terlalu lama. Batch tertahan 70 menit di Holding RT-26 dan "
        "suhu naik sampai 12,4 derajat, melewati batas 8 derajat, dengan "
        "skor kandidat utama 0,82 berbanding 0,41 untuk kandidat lainnya."
    ),
    "penjelasan": (
        "Prioritas pertama adalah melepas batch dari Holding RT-26, dan "
        "urutan ini menutup semua pelanggaran constraint, dari 3 pelanggaran "
        "menjadi 0 dari total 6 constraint yang dicek solver."
    ),
    "chat": (
        "Batch FG-1013-07 ditolak QC karena tertahan 70 menit di Holding "
        "RT-26 dan suhu maksimalnya 12,4 derajat, melewati batas aman "
        "8 derajat."
    ),
}

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


def teks_untuk(user: str) -> str:
    if MODE == "asing":
        return TEKS_ASING
    if "narasi akar masalah" in user:
        return TEKS_PATUH["narasi"]
    if "prioritas perbaikan" in user:
        return TEKS_PATUH["penjelasan"]
    return TEKS_PATUH["chat"]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if MODE == "error":
            self.send_response(500)
            self.end_headers()
            return
        user = ""
        for pesan in body.get("messages", []):
            if pesan.get("role") == "user":
                user = pesan.get("content", "")
        payload = {
            "model": "muse-wonder-1.0",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": teks_untuk(user)},
                    "finish_reason": "stop",
                }
            ],
            "usage": USAGE,
        }
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8098), Handler).serve_forever()
