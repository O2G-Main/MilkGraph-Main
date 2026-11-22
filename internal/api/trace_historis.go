package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"milkgraph/internal/trace"
)

// Traceability historis (Langkah 5 pemetaan Greenfields): genealogy
// produksi yang direkonstruksi ETL luring dari file 02 (Processing
// Transactions) dan file 01 (Filling Machine Transactions) paket
// "MVP-Greenfields-Historical-PlayIT!", disimpan sebagai
// seed/trace-historis.json. Yang disimpan hanya irisan demo 3 production
// group hasil olahan beserta statistik agregat cakupan seluruh data;
// transaksi mentah tidak pernah masuk Backend. Seluruh keluaran
// berlabel "historis".
//
// Berbeda dari layanan trace skenario (internal/trace.Service, yang
// menjawab lot FG-1013-07 dari jawaban terkalibrasi scenario.json dan
// tidak diubah di sini), trace historis menghitung komposisi lot saat
// request dengan mesin campuran trace.Propagate yang sama, di atas
// daftar transfer hasil ETL. Aturan mesin itu (campuran sempurna:
// pencampuran menggabungkan proporsi sumber, pemisahan membagi proporsi
// yang sama ke semua tujuan) adalah aturan mixing dan splitting pada
// PDF briefing resmi, sesuai temuan Bagian 7 dokumen pemetaan.
//
// Batas kejujuran yang dibawa respons: proporsi campuran adalah hasil
// perhitungan model di atas volume dan waktu historis, bukan pengukuran
// laboratorium; komposisi hulu produk persiapan tidak tercatat di file
// 02, jadi telusur berhenti di batas hulu "Prepared Product Release"
// dan sumber komposisi lot adalah tangki persiapan.

// PengisianTangki adalah aliran masuk satu tangki SFP dari batas hulu
// pada satu production group.
type PengisianTangki struct {
	TankID        string  `json:"tank_id"`
	TransactionID string  `json:"transaction_id"`
	Waktu         string  `json:"waktu"`
	VolumeL       float64 `json:"volume_l"`
	SumberLabel   string  `json:"sumber_label"`
}

// SterilisasiGrup adalah satu peristiwa Sterilizing: volume berpindah
// dari kumpulan tangki SFP ke tangki aseptik melewati sterilizer.
type SterilisasiGrup struct {
	TransactionID string   `json:"transaction_id"`
	Waktu         string   `json:"waktu"`
	Selesai       string   `json:"selesai"`
	VolumeL       float64  `json:"volume_l"`
	DariTangki    []string `json:"dari_tangki"`
	KeTangki      string   `json:"ke_tangki"`
}

// CampuranLot adalah kontribusi satu sumber (tangki persiapan) ke satu
// lot: liter dan persen hasil model campuran sempurna.
type CampuranLot struct {
	Sumber  string  `json:"sumber"`
	VolumeL float64 `json:"volume_l"`
	Persen  float64 `json:"persen"`
}

// LotHistoris adalah satu production order hasil run filling satu
// group, beserta campuran harapan hasil hitung ETL (reimplementasi
// Python) yang dipakai tes untuk memeriksa keluaran trace.Propagate.
type LotHistoris struct {
	POID            string        `json:"po_id"`
	SKUID           string        `json:"sku_id"`
	LineID          string        `json:"line_id"`
	TransactionID   string        `json:"transaction_id"`
	Mulai           string        `json:"mulai"`
	Selesai         string        `json:"selesai"`
	VolumeBagusL    float64       `json:"volume_bagus_l"`
	VolumeRejectL   float64       `json:"volume_reject_l"`
	VolumeSamplingL float64       `json:"volume_sampling_l"`
	VolumeTotalL    float64       `json:"volume_total_l"`
	PakBagus        float64       `json:"pak_bagus"`
	CampuranHarapan []CampuranLot `json:"campuran_harapan"`
}

// TransferGrup adalah satu transfer siap Propagate hasil ETL. Untuk
// tahap sterilisasi, volume peristiwa sudah dibagi ETL ke tiap tangki
// sumber sebanding isi tangki saat itu; kolom Lewat mencatat sterilizer
// yang dilewati. Untuk tahap pengisian, transfer adalah run filling
// dari tangki aseptik ke wadah lot, ditempatkan pada end_time run.
type TransferGrup struct {
	Waktu   string  `json:"waktu"`
	Dari    string  `json:"dari"`
	Ke      string  `json:"ke"`
	VolumeL float64 `json:"volume_l"`
	Tahap   string  `json:"tahap"`
	Ref     string  `json:"ref"`
	Lewat   string  `json:"lewat,omitempty"`
}

// TotalGrup adalah total volume tiga tahap satu group.
type TotalGrup struct {
	PersiapanL   float64 `json:"persiapan_l"`
	SterilisasiL float64 `json:"sterilisasi_l"`
	PengisianL   float64 `json:"pengisian_l"`
}

// GrupTrace adalah genealogy lengkap satu production group historis.
type GrupTrace struct {
	GroupID           string            `json:"group_id"`
	ProductName       string            `json:"product_name"`
	ProcessingType    string            `json:"processing_type"`
	SterilizerID      string            `json:"sterilizer_id"`
	ATTankID          string            `json:"at_tank_id"`
	JendelaMulai      string            `json:"jendela_mulai"`
	JendelaSelesai    string            `json:"jendela_selesai"`
	PengisianTangki   []PengisianTangki `json:"pengisian_tangki"`
	Sterilisasi       []SterilisasiGrup `json:"sterilisasi"`
	ATTerisiTercatatL float64           `json:"at_terisi_tercatat_l"`
	Lots              []LotHistoris     `json:"lots"`
	Total             TotalGrup         `json:"total"`
	Transfer          []TransferGrup    `json:"transfer"`
}

// StatistikTrace adalah statistik cakupan genealogy atas seluruh data
// sumber, dihitung ETL: berapa group yang rantainya lengkap dan
// seimbang, distribusi kedalaman dan ukuran rantai, dan hasil validasi
// tepi transaksi terhadap topologi asset_connections (keterjangkauan
// jalur, karena topologi memakai simpul header).
type StatistikTrace struct {
	TotalGroup                         int            `json:"total_group"`
	BarisTanpaGroup                    int            `json:"baris_tanpa_group"`
	GroupLengkapSeimbang               int            `json:"group_lengkap_seimbang"`
	DeviasiMaksFillKeSterilisasiL      float64        `json:"deviasi_maks_fill_ke_sterilisasi_l"`
	DeviasiMaksSterilisasiKePengisianL float64        `json:"deviasi_maks_sterilisasi_ke_pengisian_l"`
	KedalamanTahap                     map[string]int `json:"kedalaman_tahap"`
	TangkiSFPPerGroup                  map[string]int `json:"tangki_sfp_per_group"`
	PeristiwaSterilisasiPerGroup       map[string]int `json:"peristiwa_sterilisasi_per_group"`
	POPerGroup                         map[string]int `json:"po_per_group"`
	RunFillingPerGroup                 map[string]int `json:"run_filling_per_group"`
	CekTepiTopologi                    int            `json:"cek_tepi_topologi"`
	TepiTopologiGagal                  int            `json:"tepi_topologi_gagal"`
	GroupOvershootFloat                int            `json:"group_overshoot_float"`
	OvershootFloatMaksL                float64        `json:"overshoot_float_maks_l"`
}

// TraceHistoris adalah bentuk bertipe seed trace-historis.json.
type TraceHistoris struct {
	ID             string         `json:"id"`
	LabelData      string         `json:"label_data"`
	Sumber         string         `json:"sumber"`
	Metode         string         `json:"metode"`
	KriteriaIrisan string         `json:"kriteria_irisan"`
	Statistik      StatistikTrace `json:"statistik_cakupan"`
	Catatan        []string       `json:"catatan"`
	Groups         []GrupTrace    `json:"groups"`
}

// traceHistoris mengubah seed mentah TraceHistoris (map hasil
// LoadAllSeeds) menjadi bentuk bertipe, mengikuti pola neracaHarian.
func (s *Server) traceHistoris() (TraceHistoris, error) {
	raw, err := json.Marshal(s.seeds.TraceHistoris)
	if err != nil {
		return TraceHistoris{}, fmt.Errorf("marshal seed trace historis: %w", err)
	}
	var th TraceHistoris
	if err := json.Unmarshal(raw, &th); err != nil {
		return TraceHistoris{}, fmt.Errorf("unmarshal seed trace historis: %w", err)
	}
	if th.LabelData != "historis" || len(th.Groups) == 0 {
		return TraceHistoris{}, fmt.Errorf("seed trace historis tidak lengkap: label %q, %d group", th.LabelData, len(th.Groups))
	}
	return th, nil
}

// wadahLot adalah nama wadah Propagate untuk satu lot.
func wadahLot(poID string) string { return "LOT-" + poID }

// propagate menjalankan trace.Propagate atas daftar transfer group:
// sumber adalah tangki persiapan, vektor awal tiap tangki adalah
// volumenya sendiri dari baris pengisian, tangki aseptik dan wadah lot
// mulai kosong.
func (g GrupTrace) propagate() (map[string]trace.Vector, error) {
	sources := make([]string, 0, len(g.PengisianTangki))
	initial := map[string]trace.Vector{}
	for _, f := range g.PengisianTangki {
		sources = append(sources, f.TankID)
		initial[f.TankID] = trace.Vector{f.TankID: f.VolumeL}
	}
	initial[g.ATTankID] = trace.Vector{}
	for _, l := range g.Lots {
		initial[wadahLot(l.POID)] = trace.Vector{}
	}
	transfers := make([]trace.Transfer, 0, len(g.Transfer))
	for _, t := range g.Transfer {
		at, err := time.Parse(time.RFC3339, t.Waktu)
		if err != nil {
			return nil, fmt.Errorf("waktu transfer %s tidak sah: %w", t.Ref, err)
		}
		transfers = append(transfers, trace.Transfer{At: at, From: t.Dari, To: t.Ke, Volume: t.VolumeL})
	}
	return trace.Propagate(sources, initial, transfers)
}

// campuranDariVektor mengubah vektor sumber satu wadah menjadi daftar
// campuran terurut dengan liter dan persen terbundar dua desimal.
func campuranDariVektor(v trace.Vector, total float64) []CampuranLot {
	out := []CampuranLot{}
	for sumber, vol := range v {
		if vol <= 1e-9 {
			continue
		}
		persen := 0.0
		if total > 0 {
			persen = bulat2(vol / total * 100)
		}
		out = append(out, CampuranLot{Sumber: sumber, VolumeL: bulat2(vol), Persen: persen})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Sumber < out[j].Sumber })
	return out
}

// RingkasanGrupTrace adalah ringkasan satu group pada daftar irisan.
type RingkasanGrupTrace struct {
	GroupID         string    `json:"group_id"`
	ProductName     string    `json:"product_name"`
	ProcessingType  string    `json:"processing_type"`
	SterilizerID    string    `json:"sterilizer_id"`
	ATTankID        string    `json:"at_tank_id"`
	JendelaMulai    string    `json:"jendela_mulai"`
	JendelaSelesai  string    `json:"jendela_selesai"`
	JumlahTangkiSFP int       `json:"jumlah_tangki_sfp"`
	JumlahLot       int       `json:"jumlah_lot"`
	Total           TotalGrup `json:"total"`
}

// ResponsTraceHistoris adalah bentuk respons GET /api/v1/trace/history:
// metadata metode, kriteria irisan, statistik cakupan, dan ringkasan
// group yang tersedia untuk telusur balik.
type ResponsTraceHistoris struct {
	LabelData      string               `json:"label_data"`
	Sumber         string               `json:"sumber"`
	Metode         string               `json:"metode"`
	KriteriaIrisan string               `json:"kriteria_irisan"`
	Statistik      StatistikTrace       `json:"statistik_cakupan"`
	Catatan        []string             `json:"catatan"`
	Groups         []RingkasanGrupTrace `json:"groups"`
}

// SimpulTrace adalah satu simpul graf genealogy.
type SimpulTrace struct {
	ID    string `json:"id"`
	Jenis string `json:"jenis"`
	Label string `json:"label"`
}

// TepiTrace adalah satu tepi graf genealogy hasil agregasi transfer:
// pengisian tangki per tangki, sterilisasi per tangki sumber (dengan
// sterilizer yang dilewati), dan pengisian per lot.
type TepiTrace struct {
	Dari    string  `json:"dari"`
	Ke      string  `json:"ke"`
	VolumeL float64 `json:"volume_l"`
	Lewat   string  `json:"lewat,omitempty"`
	Tahap   string  `json:"tahap"`
}

// LangkahTrace adalah satu langkah telusur balik, dari lot menyusuri
// ke hulu sampai batas "Prepared Product Release".
type LangkahTrace struct {
	Urut       int     `json:"urut"`
	Tahap      string  `json:"tahap"`
	Waktu      string  `json:"waktu"`
	Dari       string  `json:"dari"`
	Ke         string  `json:"ke"`
	VolumeL    float64 `json:"volume_l"`
	Ref        string  `json:"ref"`
	Keterangan string  `json:"keterangan"`
}

// LotTrace adalah satu lot pada respons telusur balik, dengan campuran
// hasil trace.Propagate.
type LotTrace struct {
	POID            string        `json:"po_id"`
	SKUID           string        `json:"sku_id"`
	LineID          string        `json:"line_id"`
	VolumeBagusL    float64       `json:"volume_bagus_l"`
	VolumeRejectL   float64       `json:"volume_reject_l"`
	VolumeSamplingL float64       `json:"volume_sampling_l"`
	VolumeTotalL    float64       `json:"volume_total_l"`
	Campuran        []CampuranLot `json:"campuran"`
}

// ResponsTraceBackward adalah bentuk respons
// GET /api/v1/trace/history/backward?groupId=: genealogy satu group
// dengan simpul, tepi, langkah telusur balik, dan komposisi lot.
// Serumpun dengan jawaban trace skenario (title, nodes, edges, mix,
// note), tetapi terstruktur penuh dan berlabel historis.
type ResponsTraceBackward struct {
	LabelData         string         `json:"label_data"`
	GroupID           string         `json:"group_id"`
	Title             string         `json:"title"`
	ProductName       string         `json:"product_name"`
	ProcessingType    string         `json:"processing_type"`
	Sumber            string         `json:"sumber"`
	Metode            string         `json:"metode"`
	Note              string         `json:"note"`
	Nodes             []SimpulTrace  `json:"nodes"`
	Edges             []TepiTrace    `json:"edges"`
	Steps             []LangkahTrace `json:"steps"`
	Lots              []LotTrace     `json:"lots"`
	Total             TotalGrup      `json:"total"`
	ATTerisiTercatatL float64        `json:"at_terisi_tercatat_l"`
}

// bangunBackward menyusun ResponsTraceBackward satu group, termasuk
// menjalankan Propagate untuk komposisi lot.
func bangunBackward(th TraceHistoris, g GrupTrace) (ResponsTraceBackward, error) {
	hasil, err := g.propagate()
	if err != nil {
		return ResponsTraceBackward{}, fmt.Errorf("propagate %s: %w", g.GroupID, err)
	}

	nodes := []SimpulTrace{{ID: "Prepared Product Release", Jenis: "batas_hulu", Label: "Prepared Product Release (batas hulu data)"}}
	for _, f := range g.PengisianTangki {
		nodes = append(nodes, SimpulTrace{ID: f.TankID, Jenis: "tangki_persiapan", Label: "Tangki persiapan " + f.TankID})
	}
	nodes = append(nodes,
		SimpulTrace{ID: g.SterilizerID, Jenis: "sterilizer", Label: "Sterilizer " + g.SterilizerID},
		SimpulTrace{ID: g.ATTankID, Jenis: "tangki_aseptik", Label: "Tangki aseptik " + g.ATTankID},
	)
	for _, l := range g.Lots {
		nodes = append(nodes, SimpulTrace{ID: l.POID, Jenis: "lot_produksi", Label: "Lot " + l.POID + " (" + l.SKUID + ")"})
	}

	edges := []TepiTrace{}
	for _, f := range g.PengisianTangki {
		edges = append(edges, TepiTrace{Dari: f.SumberLabel, Ke: f.TankID, VolumeL: bulat2(f.VolumeL), Tahap: "pengisian_tangki"})
	}
	agregatSter := map[string]float64{}
	urutanTank := []string{}
	for _, t := range g.Transfer {
		if t.Tahap != "sterilisasi" {
			continue
		}
		kunci := t.Dari + ">" + t.Ke
		if _, ok := agregatSter[kunci]; !ok {
			urutanTank = append(urutanTank, kunci)
		}
		agregatSter[kunci] += t.VolumeL
	}
	sort.Strings(urutanTank)
	for _, kunci := range urutanTank {
		bagian := strings.SplitN(kunci, ">", 2)
		edges = append(edges, TepiTrace{Dari: bagian[0], Ke: bagian[1], VolumeL: bulat2(agregatSter[kunci]), Lewat: g.SterilizerID, Tahap: "sterilisasi"})
	}
	for _, l := range g.Lots {
		edges = append(edges, TepiTrace{Dari: g.ATTankID, Ke: l.POID, VolumeL: bulat2(l.VolumeTotalL), Tahap: "pengisian"})
	}

	// Langkah telusur balik: mulai dari lot, mundur ke sterilisasi
	// (peristiwa terakhir lebih dulu), lalu ke pengisian tangki.
	steps := []LangkahTrace{}
	urut := 0
	for _, l := range g.Lots {
		urut++
		steps = append(steps, LangkahTrace{
			Urut: urut, Tahap: "pengisian", Waktu: l.Selesai,
			Dari: g.ATTankID, Ke: l.POID, VolumeL: bulat2(l.VolumeTotalL), Ref: l.TransactionID,
			Keterangan: fmt.Sprintf("Run filling %s mengisi lot %s (%s): %.2f L total, terdiri dari %.2f L bagus, %.2f L reject, %.2f L sampling.",
				l.LineID, l.POID, l.SKUID, l.VolumeTotalL, l.VolumeBagusL, l.VolumeRejectL, l.VolumeSamplingL),
		})
	}
	for i := len(g.Sterilisasi) - 1; i >= 0; i-- {
		s := g.Sterilisasi[i]
		urut++
		steps = append(steps, LangkahTrace{
			Urut: urut, Tahap: "sterilisasi", Waktu: s.Waktu,
			Dari: strings.Join(s.DariTangki, ";"), Ke: s.KeTangki, VolumeL: bulat2(s.VolumeL), Ref: s.TransactionID,
			Keterangan: fmt.Sprintf("Sterilisasi lewat %s memindahkan %.2f L dari kumpulan tangki persiapan %s ke %s.",
				g.SterilizerID, s.VolumeL, strings.Join(s.DariTangki, ", "), s.KeTangki),
		})
	}
	for _, f := range g.PengisianTangki {
		urut++
		steps = append(steps, LangkahTrace{
			Urut: urut, Tahap: "pengisian_tangki", Waktu: f.Waktu,
			Dari: f.SumberLabel, Ke: f.TankID, VolumeL: bulat2(f.VolumeL), Ref: f.TransactionID,
			Keterangan: fmt.Sprintf("Produk persiapan mengisi %s sebesar %.2f L. Komposisi hulu produk persiapan tidak tercatat di data, telusur berhenti di batas ini.",
				f.TankID, f.VolumeL),
		})
	}

	lots := []LotTrace{}
	for _, l := range g.Lots {
		lots = append(lots, LotTrace{
			POID: l.POID, SKUID: l.SKUID, LineID: l.LineID,
			VolumeBagusL: l.VolumeBagusL, VolumeRejectL: l.VolumeRejectL,
			VolumeSamplingL: l.VolumeSamplingL, VolumeTotalL: l.VolumeTotalL,
			Campuran: campuranDariVektor(hasil[wadahLot(l.POID)], l.VolumeTotalL),
		})
	}

	note := fmt.Sprintf("Proporsi campuran adalah hasil perhitungan model campuran sempurna di atas data volume dan waktu historis, bukan pengukuran laboratorium. "+
		"Baris Storage Filled tangki aseptik pada data sumber hanya mencatat batch sterilisasi pertama (%.2f L); aliran masuk %s yang dipakai adalah jumlah seluruh peristiwa sterilisasi (%.2f L).",
		g.ATTerisiTercatatL, g.ATTankID, g.Total.SterilisasiL)

	return ResponsTraceBackward{
		LabelData:   th.LabelData,
		GroupID:     g.GroupID,
		Title:       fmt.Sprintf("Telusur balik %s (%s)", g.GroupID, g.ProductName),
		ProductName: g.ProductName, ProcessingType: g.ProcessingType,
		Sumber: th.Sumber, Metode: th.Metode, Note: note,
		Nodes: nodes, Edges: edges, Steps: steps, Lots: lots,
		Total: g.Total, ATTerisiTercatatL: g.ATTerisiTercatatL,
	}, nil
}

func (s *Server) registerTraceHistoris(register func(string, string, endpoint)) {
	register("GET /api/v1/trace/history", "", func(r *http.Request) (any, error) {
		th, err := s.traceHistoris()
		if err != nil {
			return nil, err
		}
		groups := make([]RingkasanGrupTrace, 0, len(th.Groups))
		for _, g := range th.Groups {
			groups = append(groups, RingkasanGrupTrace{
				GroupID: g.GroupID, ProductName: g.ProductName, ProcessingType: g.ProcessingType,
				SterilizerID: g.SterilizerID, ATTankID: g.ATTankID,
				JendelaMulai: g.JendelaMulai, JendelaSelesai: g.JendelaSelesai,
				JumlahTangkiSFP: len(g.PengisianTangki), JumlahLot: len(g.Lots),
				Total: g.Total,
			})
		}
		return ResponsTraceHistoris{
			LabelData: th.LabelData, Sumber: th.Sumber, Metode: th.Metode,
			KriteriaIrisan: th.KriteriaIrisan, Statistik: th.Statistik,
			Catatan: th.Catatan, Groups: groups,
		}, nil
	})
	register("GET /api/v1/trace/history/backward", "", func(r *http.Request) (any, error) {
		th, err := s.traceHistoris()
		if err != nil {
			return nil, err
		}
		gid := r.URL.Query().Get("groupId")
		for _, g := range th.Groups {
			if g.GroupID == gid {
				return bangunBackward(th, g)
			}
		}
		return nil, missing()
	})
}
