"""Self-check: payload contoh kontrak v2 menghasilkan respons dengan field kontrak. Jalankan: python cek_kontrak.py"""

import json
from pathlib import Path

from app import templates
from app.schemas import ChatRequest, RepairPriorityRequest, RootCauseRequest

DIR = Path(__file__).parent / "contoh_payload"


def muat(nama, model):
    return model.model_validate(json.loads((DIR / nama).read_text(encoding="utf-8")))


rc = templates.narasi_akar_masalah(muat("root_cause.json", RootCauseRequest)).model_dump()
assert set(rc) == {"batch_id", "penyebab_utama", "narasi", "rekomendasi", "sumber", "label_data", "jev", "selisih_dengan_be", "llm_usage"}
assert rc["penyebab_utama"] == "HOLDING_LAMA"  # kandidat pertama dari BE, urutan tidak diubah
assert rc["jev"] is None and rc["selisih_dengan_be"] is False  # mode template: belum ada penilaian Jev
assert rc["llm_usage"] is None  # mode template: lapisan LLM tidak dipanggil

rp = templates.penjelasan_prioritas(muat("repair_priority.json", RepairPriorityRequest)).model_dump()
assert set(rp) == {"batch_id", "penjelasan", "sumber", "label_data", "jev", "llm_usage"}
assert "dari 3 pelanggaran menjadi 0 dari total 6 constraint" in rp["penjelasan"]
assert rp["jev"] is None and rp["llm_usage"] is None

ch = templates.jawaban_chat(muat("chat.json", ChatRequest)).model_dump()
assert set(ch) == {"jawaban", "sumber", "label_data", "llm_usage"}
assert "12,4 derajat" in ch["jawaban"]
assert ch["llm_usage"] is None

kosong = templates.jawaban_chat(muat("chat_tanpa_fakta.json", ChatRequest)).model_dump()
assert "belum tersedia" in kosong["jawaban"]

for r in (rc, rp, ch, kosong):
    assert r["sumber"] == "template" and r["label_data"] == "simulasi"

print("cek_kontrak: OK")
