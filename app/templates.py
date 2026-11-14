"""Narasi template deterministik, disusun hanya dari fakta yang dikirim BE."""

from .schemas import (
    ChatRequest,
    ChatResponse,
    RepairPriorityRequest,
    RepairPriorityResponse,
    RootCauseRequest,
    RootCauseResponse,
)

SUMBER = "template"

LABEL_AKAR_MASALAH = {
    "HOLDING_LAMA": "holding terlalu lama",
    "RANTAI_DINGIN_PUTUS": "rantai dingin putus",
}

REKOMENDASI_AKAR_MASALAH = {
    "HOLDING_LAMA": [
        "Periksa antrean dan kapasitas titik holding pada jam kejadian",
        "Prioritaskan pelepasan batch dari holding yang suhunya mulai naik",
    ],
    "RANTAI_DINGIN_PUTUS": [
        "Periksa segmen perjalanan yang tidak punya catatan suhu",
    ],
}

ALASAN_PRIORITAS = {
    "SUHU_DILUAR_BATAS_TERLAMA": "di titik itulah suhu berada di luar batas paling lama",
    "SUMBER_PELANGGARAN": "titik itu adalah sumber pelanggaran",
}


def _angka(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def _durasi(menit: float) -> str:
    total = round(menit)
    jam, sisa = divmod(total, 60)
    if jam and sisa:
        return f"{jam} jam {sisa} menit"
    if jam:
        return f"{jam} jam"
    return f"{sisa} menit"


def _label_kode(kode: str) -> str:
    return LABEL_AKAR_MASALAH.get(kode, kode.replace("_", " ").lower())


def _akhiri(teks: str) -> str:
    return teks.strip().rstrip(".") + "."


def narasi_akar_masalah(req: RootCauseRequest) -> RootCauseResponse:
    utama = req.kandidat_akar_masalah[0]
    qc = req.konteks.qc_status
    status = "keluar spesifikasi QC" if qc == "out-of-spec" else f"berstatus QC {qc}"

    kalimat = [
        f"Batch {req.batch_id} {status} kemungkinan besar karena {_label_kode(utama.kode)}."
    ]
    if utama.bukti:
        kalimat.append("Buktinya: " + "; ".join(b.strip().rstrip(".") for b in utama.bukti) + ".")

    for p in req.konteks.pelanggaran_batas:
        satuan = " derajat" if p.parameter == "suhu" else ""
        teks = (
            f"Parameter {p.parameter} melewati batas {_angka(p.batas)}{satuan}, "
            f"aktual maksimum {_angka(p.aktual_maks)}{satuan}"
        )
        if p.durasi_diluar_batas_menit is not None:
            teks += f", selama {_durasi(p.durasi_diluar_batas_menit)} di luar batas"
        kalimat.append(teks + ".")

    lain = req.kandidat_akar_masalah[1:]
    if lain:
        daftar = ", ".join(f"{_label_kode(k.kode)} (skor {_angka(k.skor)})" for k in lain)
        kalimat.append(f"Kandidat lain: {daftar}, dengan skor lebih rendah dari penyebab utama.")

    rekomendasi = REKOMENDASI_AKAR_MASALAH.get(
        utama.kode,
        [f"Telusuri bukti untuk kandidat {utama.kode} bersama tim terkait"],
    )

    return RootCauseResponse(
        batch_id=req.batch_id,
        penyebab_utama=utama.kode,
        narasi=" ".join(kalimat),
        rekomendasi=list(rekomendasi),
        sumber=SUMBER,
        label_data=req.label_data,
    )


def penjelasan_prioritas(req: RepairPriorityRequest) -> RepairPriorityResponse:
    urutan = sorted(req.urutan_prioritas, key=lambda t: t.rank)
    pertama = urutan[0]
    alasan = ALASAN_PRIORITAS.get(pertama.alasan_kode, f"alasannya tercatat dengan kode {pertama.alasan_kode}")

    kalimat = [f"Prioritas pertama adalah \"{pertama.tindakan.rstrip('.')}\" karena {alasan}."]
    if len(urutan) > 1:
        sisa = "; ".join(f"{t.rank}. {t.tindakan.rstrip('.')}" for t in urutan[1:])
        kalimat.append(f"Urutan berikutnya: {sisa}.")

    sebelum, sesudah, total = req.pelanggaran_sebelum, req.pelanggaran_sesudah, req.jumlah_constraint
    if sesudah == 0:
        hasil = f"Urutan ini menutup semua pelanggaran constraint, dari {sebelum} pelanggaran menjadi 0"
    elif sesudah < sebelum:
        hasil = f"Urutan ini mengurangi pelanggaran constraint dari {sebelum} menjadi {sesudah}"
    else:
        hasil = f"Urutan ini tidak mengurangi pelanggaran constraint (sebelum {sebelum}, sesudah {sesudah})"
    kalimat.append(f"{hasil} dari total {total} constraint yang dicek solver.")

    return RepairPriorityResponse(
        batch_id=req.batch_id,
        penjelasan=" ".join(kalimat),
        sumber=SUMBER,
        label_data=req.label_data,
    )


def jawaban_chat(req: ChatRequest) -> ChatResponse:
    # ponytail: BE sudah menyaring fakta relevan (Graph RAG), template hanya menyusunnya.
    # Pemilihan fakta per pertanyaan baru masuk akal saat mode Jev ditambahkan.
    fakta = [f.strip().rstrip(".") for f in req.konteks_fakta if f.strip()]

    if fakta:
        jawaban = "Berdasarkan fakta yang tersedia: " + "; ".join(fakta) + "."
    else:
        jawaban = "Data untuk menjawab pertanyaan ini belum tersedia."

    return ChatResponse(jawaban=jawaban, sumber=SUMBER, label_data=req.label_data)
