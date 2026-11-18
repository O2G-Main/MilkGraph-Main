"""Client Jev (TypeSafe System One) untuk Service AI MilkGraph.

Jev bukan model chat: ia menjawab pertanyaan bertipe (choice, score, noul)
terhadap satu state fakta dan mengembalikan jawaban terstruktur. Modul ini
hanya membungkus pemanggilan HTTP-nya memakai pustaka standar, tanpa
dependensi baru. Semua kegagalan (key kosong, timeout, respons tidak valid)
mengembalikan None supaya pemanggil jatuh ke mode template.
Desain mengikuti Kontrak API AI MilkGraph v2.
"""

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("milkgraph-ai.jev")

TIMEOUT_DETIK = 10

# Rubrik standar pertanyaan score: level deskriptif terurut rendah ke tinggi.
RUBRIK_SCORE = [
    "0 - Bukti sangat lemah; tidak ada fakta yang mendukung satu kesimpulan yang konsisten",
    "25 - Bukti lemah; hanya sedikit fakta yang mendukung satu kesimpulan",
    "50 - Bukti cukup; beberapa fakta mendukung, tetapi masih ada keraguan",
    "75 - Bukti kuat; sebagian besar fakta mendukung satu kesimpulan yang konsisten",
    "100 - Bukti sangat kuat; semua fakta mendukung satu kesimpulan yang konsisten",
]


def _base_url() -> str:
    return (os.environ.get("JEV_BASE_URL") or "https://api.typesafe.ai").rstrip("/")


def _model() -> str:
    return os.environ.get("JEV_MODEL") or "jev-latest"


def tersedia() -> bool:
    """True bila JEV_API_KEY terpasang. Inilah arti llm "jev" pada /health."""
    return bool(os.environ.get("JEV_API_KEY"))


def panggil(state: str, questions: dict) -> dict | None:
    """Kirim satu request System One. Kembalikan dict respons utuh atau None."""
    key = os.environ.get("JEV_API_KEY")
    if not key:
        return None
    body = json.dumps(
        {"model": _model(), "state": state, "questions": questions}
    ).encode("utf-8")
    req = urllib.request.Request(
        _base_url() + "/v1/systemone",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_DETIK) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        log.warning("Jev tidak terjangkau atau respons tidak valid: %s", exc)
        return None
    if not isinstance(data, dict) or not isinstance(data.get("answers"), dict):
        log.warning("Respons Jev tidak berbentuk System One yang diharapkan")
        return None
    usage = data.get("usage") or {}
    log.info(
        "Jev menjawab: model=%s input_tokens=%s output_tokens=%s",
        data.get("model"),
        usage.get("input_tokens"),
        usage.get("output_tokens"),
    )
    return data


def skor_ke_100(score: float, jumlah_level: int) -> int:
    """Konversi posisi score Jev (0 sampai jumlah_level - 1) ke skala 0-100."""
    if jumlah_level <= 1:
        return 0
    return round(score / (jumlah_level - 1) * 100)
