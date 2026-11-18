from pydantic import BaseModel, Field


class KakiPerjalanan(BaseModel):
    dari: str
    ke: str
    durasi_menit: float
    suhu_rata: float | None = None
    suhu_maks: float | None = None


class PelanggaranBatas(BaseModel):
    parameter: str
    batas: float
    aktual_maks: float
    durasi_diluar_batas_menit: float | None = None


class Konteks(BaseModel):
    qc_status: str
    total_pack: int | None = None
    kaki_perjalanan: list[KakiPerjalanan] = Field(default_factory=list)
    pelanggaran_batas: list[PelanggaranBatas] = Field(default_factory=list)


class KandidatAkarMasalah(BaseModel):
    kode: str
    skor: float
    bukti: list[str] = Field(default_factory=list)


class RootCauseRequest(BaseModel):
    batch_id: str
    komoditas: str
    konteks: Konteks
    kandidat_akar_masalah: list[KandidatAkarMasalah] = Field(min_length=1)
    label_data: str


class JevPenilaianAkarMasalah(BaseModel):
    pilihan: str
    probabilitas: dict[str, float] = Field(default_factory=dict)
    confidence: float | None = None
    keyakinan_skor: int | None = None
    perlu_eskalasi: float | None = None
    model: str | None = None


class RootCauseResponse(BaseModel):
    batch_id: str
    penyebab_utama: str
    narasi: str
    rekomendasi: list[str]
    sumber: str
    label_data: str
    jev: JevPenilaianAkarMasalah | None = None
    selisih_dengan_be: bool = False


class TindakanPrioritas(BaseModel):
    rank: int
    tindakan: str
    alasan_kode: str


class RepairPriorityRequest(BaseModel):
    batch_id: str
    urutan_prioritas: list[TindakanPrioritas] = Field(min_length=1)
    pelanggaran_sebelum: int
    pelanggaran_sesudah: int
    jumlah_constraint: int
    label_data: str


class JevPenilaianPrioritas(BaseModel):
    keyakinan_skor: int | None = None
    risiko_jika_ditunda: float | None = None
    model: str | None = None


class RepairPriorityResponse(BaseModel):
    batch_id: str
    penjelasan: str
    sumber: str
    label_data: str
    jev: JevPenilaianPrioritas | None = None


class ChatRequest(BaseModel):
    pertanyaan: str = Field(min_length=1)
    konteks_fakta: list[str] = Field(default_factory=list)
    label_data: str


class ChatResponse(BaseModel):
    jawaban: str
    sumber: str
    label_data: str


class HealthResponse(BaseModel):
    status: str
    llm: str
