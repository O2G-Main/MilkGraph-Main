package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
)

// Skenario demo 1 November 2026 (Langkah 3 pemetaan Greenfields): keadaan
// awal pabrik dari data historis mitra. Sejak migrasi skenario aktif,
// snapshot ini adalah basis operasional (tangki scheduler dan konteks
// stok), sementara skenario lama 14 Okt 2026 (scenario.json dan
// ops.json) dipertahankan utuh sebagai berkas kasus. Sumbernya
// snapshot Opening Inventory pada file 02_Processing_Transactions.xlsx
// paket "MVP-Greenfields-Historical-PlayIT!": stok 28 tangki pada
// 1 Nov 2026 06.00 WIB. Seluruh keluaran skenario ini berlabel "historis".
//
// Berkas seed-nya (seed/scenario-2026-11-01.json) termuat lewat
// LoadAllSeeds seperti seed lain. File ini menyediakan bentuk bertipe dan
// dua akses: seluruh tangki sebagai konteks stok, dan subset tangki
// aseptik sebagai TangkiJadwal untuk scheduler. Keputusan 10 Aditya:
// semua tangki tampil sebagai konteks, yang masuk perhitungan scheduler
// hanya tangki aseptik, sesuai model scheduler saat ini (tangki sumber
// scheduler memang hanya tangki aseptik, lihat paramsJadwal).

// TangkiNov adalah satu tangki pada snapshot stok 1 Nov 2026 06.00 WIB.
// Field waktu yang tidak ada di sumber (tangki kosong belum pernah diisi)
// bernilai nil, mengikuti nilai null pada berkas seed.
type TangkiNov struct {
	ID               string  `json:"id"`
	Tipe             string  `json:"tipe"`
	SKUCair          *string `json:"sku_cair"`
	Produk           *string `json:"produk"`
	VolumeL          float64 `json:"volume_l"`
	KapasitasL       float64 `json:"kapasitas_l"`
	LevelPersen      float64 `json:"level_persen"`
	TerisiPada       *string `json:"terisi_pada"`
	UmurBahanJam     float64 `json:"umur_bahan_jam"`
	BatasHoldingJam  float64 `json:"batas_holding_jam"`
	DeadlineHolding  *string `json:"deadline_holding"`
	CIPterakhirPada  *string `json:"cip_terakhir_pada"`
	Status           string  `json:"status"`
	FraksiSusuSegar  float64 `json:"fraksi_susu_segar"`
	SusuSegarSetaraL float64 `json:"susu_segar_setara_l"`
}

// SkenarioNov adalah bentuk bertipe seed scenario-2026-11-01.json.
type SkenarioNov struct {
	ID           string      `json:"id"`
	LabelData    string      `json:"label_data"`
	Sumber       string      `json:"sumber"`
	Jangkar      string      `json:"jangkar"`
	SnapshotTime string      `json:"snapshot_time"`
	Catatan      []string    `json:"catatan"`
	Tanks        []TangkiNov `json:"tanks"`
}

// skenarioNov mengubah seed mentah SkenarioNov (map hasil LoadAllSeeds)
// menjadi bentuk bertipe. Kesalahan bentuk dilaporkan sebagai error,
// bukan ditelan, supaya seed yang rusak ketahuan saat server start
// (Handler dan Bootstrap memanggil LoadAllSeeds lebih dulu).
func (s *Server) skenarioNov() (SkenarioNov, error) {
	if s.seeds == nil || s.seeds.SkenarioNov == nil {
		return SkenarioNov{}, fmt.Errorf("seed skenario 1 Nov belum termuat")
	}
	mentah, e := json.Marshal(s.seeds.SkenarioNov)
	if e != nil {
		return SkenarioNov{}, fmt.Errorf("seed skenario 1 Nov: %w", e)
	}
	var sk SkenarioNov
	if e := json.Unmarshal(mentah, &sk); e != nil {
		return SkenarioNov{}, fmt.Errorf("seed skenario 1 Nov tidak valid: %w", e)
	}
	return sk, nil
}

// registerSkenarioNov menyajikan snapshot skenario November lewat API.
// Sebelum migrasi, seed ini hanya termuat tanpa endpoint (celah audit
// butir 6); sekarang snapshot 28 tangki adalah konteks stok skenario
// aktif dan kartu volume tangki FE membacanya dari sini. Keluaran
// selalu bentuk bertipe SkenarioNov apa adanya, berlabel historis.
func (s *Server) registerSkenarioNov(register func(string, string, endpoint)) {
	register("GET /api/v1/scenario/november", "", func(r *http.Request) (any, error) {
		sk, e := s.skenarioNov()
		if e != nil {
			return nil, e
		}
		return sk, nil
	})
	register("GET /api/v1/scenario/november/tanks", "", func(r *http.Request) (any, error) {
		sk, e := s.skenarioNov()
		if e != nil {
			return nil, e
		}
		return map[string]any{
			"label_data":    sk.LabelData,
			"snapshot_time": sk.SnapshotTime,
			"jangkar":       sk.Jangkar,
			"tanks":         sk.Tanks,
		}, nil
	})
}

// TangkiScheduler mengekstrak tangki aseptik snapshot sebagai parameter
// scheduler. ID tangki pada snapshot sudah berbentuk resmi dua digit
// (AT-01 s.d. AT-05, sama dengan asset_configuration), jadi tidak perlu
// normalisasi seperti ID gaya ops.json ("AT-1"). Batas holding diambil
// dari snapshot per tangki, bukan batas global limits.
func (sk SkenarioNov) TangkiScheduler() []TangkiJadwal {
	out := []TangkiJadwal{}
	for _, t := range sk.Tanks {
		if t.Tipe != "Aseptic Tank" {
			continue
		}
		out = append(out, TangkiJadwal{
			ID:              t.ID,
			CapacityL:       t.KapasitasL,
			LevelL:          t.VolumeL,
			MaxHoldingHours: t.BatasHoldingJam,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}
