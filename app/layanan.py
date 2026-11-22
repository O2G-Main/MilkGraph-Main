"""Orkestrasi endpoint: fakta dari BE dinilai Jev, narasi ditulis LLM.

Keputusan akhir tetap di BE (ranking graph dan solver CP-SAT) dan di manusia.
Jev hanya menilai lewat pertanyaan bertipe (choice, score, noul); ia tidak
menulis narasi dan tidak mengganti urutan atau penyebab utama dari BE.
Lapisan narasi LLM (v3) menuliskan fakta dan penilaian Jev menjadi Bahasa
Indonesia yang luwes, dengan pagar validasi angka terhadap fakta. Kalau LLM
nonaktif, gagal, atau keluarannya mengandung angka asing, narasi template
dipakai apa adanya dengan sumber "template"; sumber "jev+llm" hanya bila
teks LLM lolos validasi dan penilaian Jev benar-benar ada pada respons.
Label itu adalah klaim bahwa Jev ikut menilai, jadi tanpa Jev sumber tetap
"template" walaupun teksnya ditulis LLM. Desain mengikuti Kontrak API AI
MilkGraph v3.
"""

import logging

from . import jev, llm, templates
from .schemas import (
    ChatRequest,
    ChatResponse,
    JevPenilaianAkarMasalah,
    JevPenilaianPrioritas,
    LLMUsage,
    RepairPriorityRequest,
    RepairPriorityResponse,
    RootCauseRequest,
    RootCauseResponse,
)

log = logging.getLogger("milkgraph-ai.layanan")


def _label(kode: str) -> str:
    return templates.LABEL_AKAR_MASALAH.get(kode, kode.replace("_", " ").lower())


def _angka(x: float) -> str:
    return f"{x:g}"


def _parse_choice(jawaban) -> tuple[str | None, dict, float | None]:
    if not isinstance(jawaban, dict):
        return None, {}, None
    pilihan = jawaban.get("choice") or jawaban.get("value")
    probabilitas = jawaban.get("probabilities")
    if not isinstance(probabilitas, dict):
        probabilitas = {}
    confidence = jawaban.get("confidence")
    if not isinstance(pilihan, str):
        return None, probabilitas, confidence
    return pilihan, probabilitas, confidence


def _parse_angka(jawaban, *kunci: str) -> float | None:
    if not isinstance(jawaban, dict):
        return None
    for k in kunci:
        nilai = jawaban.get(k)
        if isinstance(nilai, (int, float)):
            return float(nilai)
    return None


def _tulis_ulang_llm(
    teks_sekarang: str, teks_acuan: str, instruksi: str
) -> tuple[str, LLMUsage | None, bool]:
    """Coba ganti teks narasi dengan tulisan LLM dari teks acuan.

    Kembalikan (teks, llm_usage, berhasil). Lapisan nonaktif atau panggilan
    gagal: teks lama dipertahankan dan llm_usage None. Panggilan berhasil
    tetapi validasi angka gagal: teks lama dipakai, tetapi usage tetap
    dilaporkan karena token provider sudah terbakar.
    """
    if not llm.tersedia():
        return teks_sekarang, None, False
    hasil = llm.tulis(teks_acuan, instruksi)
    if hasil is None:
        return teks_sekarang, None, False
    teks, usage = hasil
    if not llm.angka_valid(teks, teks_acuan):
        return teks_sekarang, LLMUsage(**usage), False
    return teks, LLMUsage(**usage), True


def _state_akar_masalah(req: RootCauseRequest) -> str:
    k = req.konteks
    baris = [
        f"Batch {req.batch_id}, komoditas {req.komoditas}.",
        f"Status QC: {k.qc_status}.",
    ]
    if k.total_pack is not None:
        baris.append(f"Total kemasan: {k.total_pack} pack.")
    for kaki in k.kaki_perjalanan:
        teks = (
            f"Perjalanan {kaki.dari} ke {kaki.ke}: "
            f"durasi {_angka(kaki.durasi_menit)} menit"
        )
        if kaki.suhu_rata is not None:
            teks += f", suhu rata-rata {_angka(kaki.suhu_rata)} derajat"
        if kaki.suhu_maks is not None:
            teks += f", suhu maksimum {_angka(kaki.suhu_maks)} derajat"
        baris.append(teks + ".")
    for p in k.pelanggaran_batas:
        teks = (
            f"Pelanggaran batas: parameter {p.parameter} melewati batas "
            f"{_angka(p.batas)}, aktual maksimum {_angka(p.aktual_maks)}"
        )
        if p.durasi_diluar_batas_menit is not None:
            teks += f", selama {_angka(p.durasi_diluar_batas_menit)} menit di luar batas"
        baris.append(teks + ".")
    baris.append("Kandidat akar masalah dari ranking backend (urutan skor menurun):")
    for kandidat in req.kandidat_akar_masalah:
        teks = f"- {kandidat.kode} ({_label(kandidat.kode)}), skor {_angka(kandidat.skor)}"
        if kandidat.bukti:
            teks += "; bukti: " + "; ".join(kandidat.bukti)
        baris.append(teks)
    return "\n".join(baris)


def _narasi_akar_masalah_v2(req: RootCauseRequest) -> RootCauseResponse:
    dasar = templates.narasi_akar_masalah(req)
    if not jev.tersedia():
        return dasar

    questions = {
        "penyebab_utama": {
            "type": "choice",
            "instructions": (
                "Pilih penyebab akar masalah yang paling didukung oleh fakta "
                "pada state. Nilai hanya dari fakta yang tertulis."
            ),
            "criteria": {
                k.kode: _label(k.kode) for k in req.kandidat_akar_masalah
            },
        },
        "keyakinan_diagnosis": {
            "type": "score",
            "instructions": (
                "Nilai kekuatan bukti pada state untuk satu diagnosis akar "
                "masalah yang konsisten."
            ),
            "criteria": jev.RUBRIK_SCORE,
        },
        "perlu_eskalasi": {
            "type": "noul",
            "instructions": (
                "Apakah batch ini perlu dieskalasi untuk penarikan atau "
                "penahanan lot turunan yang sudah terdistribusi ke hilir?"
            ),
        },
    }
    hasil = jev.panggil(_state_akar_masalah(req), questions)
    if hasil is None:
        return dasar
    answers = hasil["answers"]

    pilihan, probabilitas, confidence = _parse_choice(answers.get("penyebab_utama"))
    kode_valid = {k.kode for k in req.kandidat_akar_masalah}
    if pilihan is None or pilihan not in kode_valid:
        log.warning("Pilihan Jev tidak cocok dengan kandidat BE: %r", pilihan)
        return dasar

    skor = _parse_angka(answers.get("keyakinan_diagnosis"), "score", "value")
    penilaian = JevPenilaianAkarMasalah(
        pilihan=pilihan,
        probabilitas=probabilitas,
        confidence=confidence,
        keyakinan_skor=(
            jev.skor_ke_100(skor, len(jev.RUBRIK_SCORE)) if skor is not None else None
        ),
        perlu_eskalasi=_parse_angka(answers.get("perlu_eskalasi"), "noul", "value"),
        model=hasil.get("model"),
    )

    selisih = pilihan != req.kandidat_akar_masalah[0].kode
    narasi = dasar.narasi
    if selisih:
        narasi += (
            f" Catatan: penilaian Jev berbeda dari ranking backend, Jev memilih "
            f"{_label(pilihan)}; perbedaan ini perlu ditinjau manusia sebelum "
            f"ditindaklanjuti."
        )

    return dasar.model_copy(
        update={
            "sumber": "jev",
            "jev": penilaian,
            "selisih_dengan_be": selisih,
            "narasi": narasi,
        }
    )


def _teks_keputusan_akar(resp: RootCauseResponse) -> str:
    j = resp.jev
    if j is None:
        return ""
    baris = [f"Penilaian Jev: memilih kandidat {j.pilihan} ({_label(j.pilihan)})."]
    if j.confidence is not None:
        baris.append(f"Confidence Jev: {_angka(j.confidence)}.")
    if j.keyakinan_skor is not None:
        baris.append(f"Keyakinan diagnosis Jev: {j.keyakinan_skor} dari 100.")
    if j.perlu_eskalasi is not None:
        baris.append(f"Skor perlu eskalasi Jev: {_angka(j.perlu_eskalasi)}.")
    return " ".join(baris)


def _pastikan_catatan_selisih(teks: str, pilihan_jev: str) -> str:
    """Jamin narasi pada jalur selisih memuat catatan perbedaan wajib.

    Kontrak mewajibkan narasi menyebut adanya perbedaan penilaian Jev
    terhadap ranking backend untuk ditinjau manusia. Instruksi ke LLM
    memintanya, tetapi teks LLM mengganti seluruh narasi template sehingga
    catatan itu bisa hilang; bila penanda perbedaan belum ada pada teks
    LLM, kode menambahkan kalimat catatan baku yang sama dengan yang
    disusun jalur template. Catatan ini tidak memuat angka, jadi tidak
    mengubah hasil validasi angka yang sudah lolos.
    """
    bawah = teks.lower()
    if "berbeda" in bawah or "perbedaan" in bawah:
        return teks
    catatan = (
        f"Catatan: penilaian Jev berbeda dari ranking backend, Jev memilih "
        f"{_label(pilihan_jev)}; perbedaan ini perlu ditinjau manusia "
        f"sebelum ditindaklanjuti."
    )
    return teks.rstrip() + " " + catatan


def narasi_akar_masalah(req: RootCauseRequest) -> RootCauseResponse:
    resp = _narasi_akar_masalah_v2(req)
    acuan = _state_akar_masalah(req)
    keputusan = _teks_keputusan_akar(resp)
    if keputusan:
        acuan += "\n" + keputusan
    instruksi = (
        "Tulis narasi akar masalah untuk pengguna aplikasi dari fakta dan "
        "keputusan berikut, dalam Bahasa Indonesia yang luwes dan ringkas."
    )
    if resp.selisih_dengan_be:
        instruksi += (
            " Sebutkan bahwa penilaian Jev berbeda dari ranking backend dan "
            "perbedaan itu perlu ditinjau manusia."
        )
    teks, usage, ok = _tulis_ulang_llm(resp.narasi, acuan, instruksi)
    # Label "jev+llm" hanya bila Jev benar-benar menilai (field jev
    # terisi); tanpa Jev, sumber "template" walaupun teks ditulis LLM.
    sumber = "jev+llm" if ok and resp.jev is not None else "template"
    update: dict = {"llm_usage": usage, "sumber": sumber}
    if ok:
        if resp.selisih_dengan_be and resp.jev is not None:
            teks = _pastikan_catatan_selisih(teks, resp.jev.pilihan)
        update["narasi"] = teks
    return resp.model_copy(update=update)


def _state_prioritas(req: RepairPriorityRequest) -> str:
    baris = [
        f"Batch {req.batch_id}. Urutan prioritas perbaikan dari solver "
        f"CP-SAT backend:"
    ]
    for t in sorted(req.urutan_prioritas, key=lambda x: x.rank):
        baris.append(f"- Peringkat {t.rank}: {t.tindakan} (alasan: {t.alasan_kode})")
    baris.append(
        f"Pelanggaran constraint sebelum perbaikan: {req.pelanggaran_sebelum}; "
        f"sesudah perbaikan: {req.pelanggaran_sesudah}; total constraint yang "
        f"dicek solver: {req.jumlah_constraint}."
    )
    return "\n".join(baris)


def _penjelasan_prioritas_v2(req: RepairPriorityRequest) -> RepairPriorityResponse:
    dasar = templates.penjelasan_prioritas(req)
    if not jev.tersedia():
        return dasar

    questions = {
        "keyakinan_prioritas": {
            "type": "score",
            "instructions": (
                "Nilai kekuatan fakta pada state dalam mendukung urutan "
                "prioritas perbaikan dari solver."
            ),
            "criteria": jev.RUBRIK_SCORE,
        },
        "risiko_jika_ditunda": {
            "type": "noul",
            "instructions": (
                "Apakah menunda tindakan prioritas pertama berisiko "
                "memperbesar kerugian atau kerusakan batch?"
            ),
        },
    }
    hasil = jev.panggil(_state_prioritas(req), questions)
    if hasil is None:
        return dasar
    answers = hasil["answers"]

    skor = _parse_angka(answers.get("keyakinan_prioritas"), "score", "value")
    risiko = _parse_angka(answers.get("risiko_jika_ditunda"), "noul", "value")
    if skor is None and risiko is None:
        return dasar

    penilaian = JevPenilaianPrioritas(
        keyakinan_skor=(
            jev.skor_ke_100(skor, len(jev.RUBRIK_SCORE)) if skor is not None else None
        ),
        risiko_jika_ditunda=risiko,
        model=hasil.get("model"),
    )
    return dasar.model_copy(update={"sumber": "jev", "jev": penilaian})


def _teks_keputusan_prioritas(resp: RepairPriorityResponse) -> str:
    j = resp.jev
    if j is None:
        return ""
    baris = []
    if j.keyakinan_skor is not None:
        baris.append(
            f"Keyakinan Jev atas urutan prioritas: {j.keyakinan_skor} dari 100."
        )
    if j.risiko_jika_ditunda is not None:
        baris.append(
            f"Skor risiko bila tindakan pertama ditunda: "
            f"{_angka(j.risiko_jika_ditunda)}."
        )
    return " ".join(baris)


def penjelasan_prioritas(req: RepairPriorityRequest) -> RepairPriorityResponse:
    resp = _penjelasan_prioritas_v2(req)
    acuan = _state_prioritas(req)
    keputusan = _teks_keputusan_prioritas(resp)
    if keputusan:
        acuan += "\n" + keputusan
    instruksi = (
        "Tulis penjelasan urutan prioritas perbaikan untuk pengguna aplikasi "
        "dari fakta dan keputusan berikut, dalam Bahasa Indonesia yang luwes "
        "dan ringkas."
    )
    teks, usage, ok = _tulis_ulang_llm(resp.penjelasan, acuan, instruksi)
    # Sama seperti narasi akar masalah: label "jev+llm" hanya bila Jev
    # benar-benar menilai; tanpa Jev sumber tetap "template".
    sumber = "jev+llm" if ok and resp.jev is not None else "template"
    update: dict = {"llm_usage": usage, "sumber": sumber}
    if ok:
        update["penjelasan"] = teks
    return resp.model_copy(update=update)


def jawaban_chat(req: ChatRequest) -> ChatResponse:
    dasar = templates.jawaban_chat(req)
    fakta = [f.strip() for f in req.konteks_fakta if f.strip()]
    if not fakta or not jev.tersedia():
        return dasar

    state = (
        f"Pertanyaan pengguna: {req.pertanyaan}\n\nFakta yang tersedia:\n"
        + "\n".join(f"{i}. {f}" for i, f in enumerate(fakta, 1))
    )
    questions = {
        "konteks_menjawab": {
            "type": "noul",
            "instructions": (
                "Apakah fakta pada state cukup untuk menjawab pertanyaan "
                "pengguna?"
            ),
        },
        "fakta_paling_relevan": {
            "type": "choice",
            "instructions": (
                "Pilih fakta yang paling langsung menjawab pertanyaan pengguna."
            ),
            "criteria": {str(i): f for i, f in enumerate(fakta, 1)},
        },
    }
    hasil = jev.panggil(state, questions)
    if hasil is None:
        return dasar
    answers = hasil["answers"]

    cukup = _parse_angka(answers.get("konteks_menjawab"), "noul", "value")
    if cukup is not None and cukup < 0.5:
        # Gerbang relevansi Jev: berhenti di sini, LLM tidak dipanggil sama
        # sekali dan llm_usage tetap None.
        return ChatResponse(
            jawaban="Data untuk menjawab pertanyaan ini belum tersedia.",
            sumber="template",
            label_data=req.label_data,
        )

    pilihan, _, _ = _parse_choice(answers.get("fakta_paling_relevan"))
    nomor_valid = {str(i) for i in range(1, len(fakta) + 1)}
    if pilihan is None or pilihan not in nomor_valid:
        return dasar

    terpilih = fakta[int(pilihan) - 1].rstrip(".")
    lain = [
        f.rstrip(".")
        for i, f in enumerate(fakta, 1)
        if str(i) != pilihan
    ]
    jawaban = "Berdasarkan fakta yang tersedia: " + "; ".join([terpilih] + lain) + "."
    instruksi = (
        "Jawab pertanyaan pengguna hanya dari fakta berikut, dalam Bahasa "
        "Indonesia yang luwes dan ringkas."
    )
    teks, usage, ok = _tulis_ulang_llm(jawaban, state, instruksi)
    return ChatResponse(
        jawaban=teks if ok else jawaban,
        sumber="jev+llm" if ok else "template",
        label_data=req.label_data,
        llm_usage=usage,
    )
