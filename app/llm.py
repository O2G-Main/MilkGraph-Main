"""Klien LLM OpenAI-compatible untuk lapisan narasi Service AI MilkGraph.

Lapisan ini hanya menuliskan fakta dan keputusan yang sudah dihitung BE dan
dinilai Jev menjadi Bahasa Indonesia yang luwes; ia tidak memutuskan apa pun
dan tidak mengganti ranking BE atau penilaian Jev. Semua kegagalan (key
kosong, timeout, respons tidak valid) mengembalikan None supaya pemanggil
jatuh ke narasi template. Angka pada keluaran LLM wajib lolos validasi
terhadap teks fakta acuan sebelum dipakai (lihat angka_valid): satu angka
asing saja membuang teks LLM. Pemanggilan HTTP memakai pustaka standar,
mengikuti pola klien Jev. Desain mengikuti Kontrak API AI MilkGraph v3.
"""

import http.client
import json
import logging
import os
import re
import urllib.error
import urllib.request

log = logging.getLogger("milkgraph-ai.llm")

TIMEOUT_DETIK = 15

PESAN_SISTEM = (
    "Kamu menuliskan jawaban untuk pengguna aplikasi MilkGraph dalam Bahasa "
    "Indonesia yang luwes dan ringkas. Aturan mutlak: hanya boleh memakai "
    "fakta dan keputusan yang diberikan, dilarang menambah angka, nama, "
    "tempat, atau kejadian baru. Jika fakta tidak menjawab pertanyaan, "
    "tulis: Data belum tersedia."
)


def _base_url() -> str:
    return (os.environ.get("LLM_BASE_URL") or "https://api.meta.ai/v1").rstrip("/")


def _model() -> str:
    return os.environ.get("LLM_MODEL") or "muse-wonder-1.0"


def _temperature() -> float:
    try:
        return float(os.environ.get("LLM_TEMPERATURE") or 0.3)
    except ValueError:
        return 0.3


def _max_tokens() -> int:
    try:
        return int(os.environ.get("LLM_MAX_TOKENS") or 512)
    except ValueError:
        return 512


def tersedia() -> bool:
    """True bila LLM_API_KEY terpasang; tanpa key lapisan narasi nonaktif."""
    return bool(os.environ.get("LLM_API_KEY"))


def _token(nilai) -> int | None:
    return int(nilai) if isinstance(nilai, (int, float)) else None


def tulis(teks_acuan: str, instruksi: str) -> tuple[str, dict] | None:
    """Minta LLM menuliskan jawaban dari teks acuan.

    Kembalikan (teks, usage) atau None. usage berisi prompt_tokens,
    completion_tokens, dan reasoning_tokens (None bila provider tidak
    melaporkannya); angka-angkanya berasal dari objek usage provider apa
    adanya, bukan estimasi.
    """
    key = os.environ.get("LLM_API_KEY")
    if not key:
        return None
    body = json.dumps(
        {
            "model": _model(),
            "messages": [
                {"role": "system", "content": PESAN_SISTEM},
                {
                    "role": "user",
                    "content": instruksi + "\n\nFakta dan keputusan:\n" + teks_acuan,
                },
            ],
            "temperature": _temperature(),
            "max_tokens": _max_tokens(),
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        _base_url() + "/chat/completions",
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
    except (
        urllib.error.URLError,
        TimeoutError,
        ValueError,
        OSError,
        http.client.HTTPException,
    ) as exc:
        # OSError menampung putus koneksi di tengah respons
        # (ConnectionResetError dan keluarganya) dan HTTPException
        # menampung respons HTTP yang terpotong; keduanya mode gagal
        # jaringan biasa dan wajib jatuh ke fallback, bukan error 500.
        log.warning("LLM tidak terjangkau atau respons tidak valid: %s", exc)
        return None
    try:
        teks = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        log.warning("Respons LLM tidak berbentuk chat completion yang diharapkan")
        return None
    if not isinstance(teks, str) or not teks.strip():
        log.warning("Respons LLM kosong")
        return None
    mentah = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    detail = mentah.get("completion_tokens_details")
    if not isinstance(detail, dict):
        detail = {}
    usage = {
        "prompt_tokens": _token(mentah.get("prompt_tokens")),
        "completion_tokens": _token(mentah.get("completion_tokens")),
        "reasoning_tokens": _token(
            detail.get("reasoning_tokens", mentah.get("reasoning_tokens"))
        ),
    }
    log.info(
        "LLM menulis: model=%s prompt_tokens=%s completion_tokens=%s "
        "reasoning_tokens=%s",
        data.get("model"),
        usage["prompt_tokens"],
        usage["completion_tokens"],
        usage["reasoning_tokens"],
    )
    return teks.strip(), usage


# Pola angka: ribuan berpisah titik (1.133), desimal koma atau titik (0,78
# atau 0.78), dan bilangan bulat biasa. Angka di dalam kode seperti
# LAB-8812 atau FG-1013-07 tertangkap sebagai bilangan tersendiri, sama di
# kedua sisi perbandingan.
_POLA_ANGKA = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?")
_POLA_RIBUAN = re.compile(r"\d{1,3}(?:\.\d{3})+")


def _nilai(token: str) -> float:
    if "." in token and "," in token:
        token = token.replace(".", "").replace(",", ".")
    elif _POLA_RIBUAN.fullmatch(token):
        token = token.replace(".", "")
    elif "," in token:
        token = token.replace(",", ".")
    return float(token)


def ekstrak_angka(teks: str) -> set[float]:
    """Semua nilai angka pada teks, dinormalkan lintas format ID dan EN."""
    return {_nilai(m.group(0)) for m in _POLA_ANGKA.finditer(teks)}


def angka_valid(teks_llm: str, teks_acuan: str) -> bool:
    """True bila setiap angka pada teks LLM muncul juga pada teks acuan."""
    asing = ekstrak_angka(teks_llm) - ekstrak_angka(teks_acuan)
    if asing:
        log.warning(
            "Narasi LLM dibuang, angka asing terhadap fakta: %s", sorted(asing)
        )
        return False
    return True
