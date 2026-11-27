"""Tes pilihan rekomendasi Jev: pilihan valid dipakai, kegagalan jatuh ke BE.

Jalankan: python tes_rekomendasi.py
"""

import os

from app import jev, layanan
from app.schemas import RecommendationChoiceRequest

REQ = RecommendationChoiceRequest(
    batch_id="BATCH-20261101-001",
    production_date="2026-11-01",
    fakta=["Kebutuhan batch 50000 L, tersedia 20000 L, kurang 30000 L"],
    kandidat=[
        {"kode": "geser_jadwal", "deskripsi": "Geser jadwal batch", "skor_be": 90},
        {"kode": "naikkan_speed", "deskripsi": "Naikkan speed alat", "skor_be": 60},
        {"kode": "upgrade_kapasitas", "deskripsi": "Upgrade kapasitas alat", "skor_be": 40},
        {"kode": "pindahkan_alat", "deskripsi": "Pindahkan alat", "skor_be": 20},
    ],
    label_data="historis",
)


def main() -> None:
    os.environ["JEV_API_KEY"] = "uji"

    jev.panggil = lambda state, questions: {
        "model": "jev-uji",
        "answers": {
            "solusi_terbaik": {
                "choice": "naikkan_speed",
                "probabilities": {"naikkan_speed": 0.7},
                "confidence": 0.7,
            },
            "keyakinan_pilihan": {"score": 3},
        },
    }
    hasil = layanan.pilih_rekomendasi(REQ)
    assert hasil.pilihan == "naikkan_speed", hasil
    assert hasil.sumber == "jev", hasil
    assert hasil.selisih_dengan_be is True, hasil
    assert hasil.jev is not None and hasil.jev.keyakinan_skor == 75, hasil

    jev.panggil = lambda state, questions: None
    hasil = layanan.pilih_rekomendasi(REQ)
    assert hasil.pilihan == "geser_jadwal", hasil
    assert hasil.sumber == "template", hasil

    jev.panggil = lambda state, questions: {
        "model": "jev-uji",
        "answers": {"solusi_terbaik": {"choice": "kode_asing"}},
    }
    hasil = layanan.pilih_rekomendasi(REQ)
    assert hasil.pilihan == "geser_jadwal", hasil
    assert hasil.sumber == "template", hasil

    print("tes rekomendasi lolos")


if __name__ == "__main__":
    main()
