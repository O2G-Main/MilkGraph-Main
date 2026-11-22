package api

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
)

// Neraca volume harian (Langkah 4 pemetaan Greenfields): agregat per hari
// produksi (jendela 06.00 s.d. 06.00) dari data historis mitra, dihitung
// ETL luring dari file 01 (filling), 02 (snapshot stok), dan 03
// (penerimaan), lalu disimpan sebagai seed/neraca-harian.json. Endpoint di
// sini hanya menyajikan agregat itu; transaksi mentah tidak pernah masuk
// Backend. Seluruh keluaran berlabel "historis".
//
// Definisi komponen mengikuti Bagian 6 dokumen pemetaan dan metode yang
// tertulis di berkas seed: masuk dari received_volume_l menurut
// actual_arrival_time, output dari baris stage Filling beraktivitas
// Running (output bagus ditambah reject dan sampling sebagai susut
// terukur; baris Packing dikeluarkan agar tidak dobel hitung). Selisih
// adalah masuk dikurangi output total. Stok harian tidak terukur di
// paket (snapshot hanya 1 Nov 2026 06.00; level transaksi processing
// adalah level per siklus batch), jadi stok_awal_l dan stok_akhir_l
// bernilai nil kecuali stok akhir 31 Okt 2026 yang terukur dari snapshot,
// dan setiap hari membawa penanda kualitas_data yang menyatakannya.

// HariNeraca adalah satu hari produksi pada agregat neraca harian.
// StokAwalL dan StokAkhirL berupa pointer: nil berarti tidak terukur di
// paket data, bukan nol.
type HariNeraca struct {
	Tanggal       string   `json:"tanggal"`
	MasukL        float64  `json:"masuk_l"`
	OutputBagusL  float64  `json:"output_bagus_l"`
	RejectL       float64  `json:"reject_l"`
	SamplingL     float64  `json:"sampling_l"`
	OutputTotalL  float64  `json:"output_total_l"`
	StokAwalL     *float64 `json:"stok_awal_l"`
	StokAkhirL    *float64 `json:"stok_akhir_l"`
	SelisihL      float64  `json:"selisih_l"`
	SelisihPersen float64  `json:"selisih_persen"`
	KualitasData  string   `json:"kualitas_data"`
	Catatan       string   `json:"catatan,omitempty"`
}

// StokSnapshot adalah satu-satunya stok terukur di paket: snapshot
// Opening Inventory 1 Nov 2026 06.00 dari file 02.
type StokSnapshot struct {
	Waktu        string             `json:"waktu"`
	TotalL       float64            `json:"total_l"`
	JumlahTangki int                `json:"jumlah_tangki"`
	PerTipeL     map[string]float64 `json:"per_tipe_l"`
}

// NeracaHarian adalah bentuk bertipe seed neraca-harian.json.
type NeracaHarian struct {
	ID           string       `json:"id"`
	LabelData    string       `json:"label_data"`
	Sumber       string       `json:"sumber"`
	Jendela      string       `json:"jendela"`
	Metode       string       `json:"metode"`
	StokSnapshot StokSnapshot `json:"stok_snapshot"`
	Hari         []HariNeraca `json:"hari"`
}

// neracaHarian mengubah seed mentah NeracaHarian (map hasil LoadAllSeeds)
// menjadi bentuk bertipe. Kesalahan bentuk dilaporkan sebagai error,
// mengikuti pola skenarioNov.
func (s *Server) neracaHarian() (NeracaHarian, error) {
	raw, err := json.Marshal(s.seeds.NeracaHarian)
	if err != nil {
		return NeracaHarian{}, fmt.Errorf("marshal seed neraca: %w", err)
	}
	var n NeracaHarian
	if err := json.Unmarshal(raw, &n); err != nil {
		return NeracaHarian{}, fmt.Errorf("unmarshal seed neraca: %w", err)
	}
	if n.LabelData != "historis" || len(n.Hari) == 0 {
		return NeracaHarian{}, fmt.Errorf("seed neraca tidak lengkap: label %q, %d hari", n.LabelData, len(n.Hari))
	}
	return n, nil
}

// EkstremSelisih menunjuk hari dengan selisih persen terkecil atau
// terbesar pada rentang agregat.
type EkstremSelisih struct {
	Tanggal       string  `json:"tanggal"`
	SelisihL      float64 `json:"selisih_l"`
	SelisihPersen float64 `json:"selisih_persen"`
}

// RingkasanNeraca merangkum seluruh rentang agregat: total tiap komponen,
// selisih keseluruhan, dan hari ekstrem. Dihitung dari agregat seed saat
// request, bukan disimpan terpisah, supaya tidak bisa berbeda dari data
// hariannya.
type RingkasanNeraca struct {
	TanggalAwal            string         `json:"tanggal_awal"`
	TanggalAkhir           string         `json:"tanggal_akhir"`
	JumlahHari             int            `json:"jumlah_hari"`
	TotalMasukL            float64        `json:"total_masuk_l"`
	TotalOutputBagusL      float64        `json:"total_output_bagus_l"`
	TotalRejectL           float64        `json:"total_reject_l"`
	TotalSamplingL         float64        `json:"total_sampling_l"`
	TotalOutputL           float64        `json:"total_output_l"`
	TotalSelisihL          float64        `json:"total_selisih_l"`
	SelisihPersenTotal     float64        `json:"selisih_persen_total"`
	RataRataSelisihPersen  float64        `json:"rata_rata_selisih_persen"`
	SelisihPersenTerendah  EkstremSelisih `json:"selisih_persen_terendah"`
	SelisihPersenTertinggi EkstremSelisih `json:"selisih_persen_tertinggi"`
	SelisihAbsolutTerbesar EkstremSelisih `json:"selisih_absolut_terbesar"`
}

func bulat2(v float64) float64 { return math.Round(v*100) / 100 }

// ringkasanNeraca menghitung RingkasanNeraca dari daftar hari. Fungsi
// murni supaya bisa diuji pada data kecil buatan tangan.
func ringkasanNeraca(hari []HariNeraca) RingkasanNeraca {
	r := RingkasanNeraca{JumlahHari: len(hari)}
	if len(hari) == 0 {
		return r
	}
	r.TanggalAwal = hari[0].Tanggal
	r.TanggalAkhir = hari[len(hari)-1].Tanggal
	minP := hari[0]
	maxP := hari[0]
	maxA := hari[0]
	var jumlahPersen float64
	for _, h := range hari {
		r.TotalMasukL += h.MasukL
		r.TotalOutputBagusL += h.OutputBagusL
		r.TotalRejectL += h.RejectL
		r.TotalSamplingL += h.SamplingL
		r.TotalOutputL += h.OutputTotalL
		r.TotalSelisihL += h.SelisihL
		jumlahPersen += h.SelisihPersen
		if h.SelisihPersen < minP.SelisihPersen {
			minP = h
		}
		if h.SelisihPersen > maxP.SelisihPersen {
			maxP = h
		}
		if math.Abs(h.SelisihL) > math.Abs(maxA.SelisihL) {
			maxA = h
		}
	}
	if r.TotalMasukL > 0 {
		r.SelisihPersenTotal = bulat2(r.TotalSelisihL / r.TotalMasukL * 100)
	}
	r.RataRataSelisihPersen = bulat2(jumlahPersen / float64(len(hari)))
	r.SelisihPersenTerendah = EkstremSelisih{minP.Tanggal, minP.SelisihL, minP.SelisihPersen}
	r.SelisihPersenTertinggi = EkstremSelisih{maxP.Tanggal, maxP.SelisihL, maxP.SelisihPersen}
	r.SelisihAbsolutTerbesar = EkstremSelisih{maxA.Tanggal, maxA.SelisihL, maxA.SelisihPersen}
	return r
}

// ResponsNeraca adalah bentuk respons GET /api/v1/balance/daily tanpa
// parameter tanggal: metadata metode, jangkar stok terukur, ringkasan
// rentang, dan daftar hari.
type ResponsNeraca struct {
	LabelData    string          `json:"label_data"`
	Sumber       string          `json:"sumber"`
	Jendela      string          `json:"jendela"`
	Metode       string          `json:"metode"`
	StokSnapshot StokSnapshot    `json:"stok_snapshot"`
	Ringkasan    RingkasanNeraca `json:"ringkasan"`
	Hari         []HariNeraca    `json:"hari"`
}

// ResponsNeracaHari adalah bentuk respons GET /api/v1/balance/daily
// dengan parameter ?date=: satu hari beserta label dan metode yang sama,
// supaya angka tunggal tidak pernah tampil tanpa konteks kejujurannya.
type ResponsNeracaHari struct {
	LabelData string     `json:"label_data"`
	Jendela   string     `json:"jendela"`
	Metode    string     `json:"metode"`
	Hari      HariNeraca `json:"hari"`
}

func (s *Server) registerNeraca(register func(string, string, endpoint)) {
	register("GET /api/v1/balance/daily", "", func(r *http.Request) (any, error) {
		n, err := s.neracaHarian()
		if err != nil {
			return nil, err
		}
		if tgl := r.URL.Query().Get("date"); tgl != "" {
			for _, h := range n.Hari {
				if h.Tanggal == tgl {
					return ResponsNeracaHari{
						LabelData: n.LabelData,
						Jendela:   n.Jendela,
						Metode:    n.Metode,
						Hari:      h,
					}, nil
				}
			}
			return nil, missing()
		}
		return ResponsNeraca{
			LabelData:    n.LabelData,
			Sumber:       n.Sumber,
			Jendela:      n.Jendela,
			Metode:       n.Metode,
			StokSnapshot: n.StokSnapshot,
			Ringkasan:    ringkasanNeraca(n.Hari),
			Hari:         n.Hari,
		}, nil
	})
}
