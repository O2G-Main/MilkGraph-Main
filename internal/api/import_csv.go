package api

import (
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"

	"milkgraph/internal/store"
)

// Import CSV Tahap 3: input data massal untuk PO dan Jadwal Kedatangan RT
// lewat jalur resmi, menggantikan pengisian form satu-satu untuk data
// berkala (termasuk data Greenfields yang nanti datang sebagai spreadsheet).
// Polanya dua tahap stateless dengan file yang sama:
//   - commit=false (pratinjau): file hanya divalidasi terhadap master data
//     dan data yang sudah ada; tidak ada yang disimpan.
//   - commit=true: baris valid disimpan lewat s.change (pola audit yang
//     sama dengan jalur form), baris gagal dilewati dan tetap dilaporkan.
//
// Laporan selalu berbentuk sama supaya FE bisa menampilkan pratinjau dan
// hasil commit dengan tabel yang sama.

const (
	batasImportBytes = 1 << 20 // 1 MB
	batasImportBaris = 5000
)

type kesalahanBaris struct {
	Baris int    `json:"baris"`
	Pesan string `json:"pesan"`
}

type laporanImport struct {
	Commit     bool             `json:"commit"`
	TotalBaris int              `json:"total_baris"`
	Valid      int              `json:"valid"`
	Gagal      int              `json:"gagal"`
	Dibuat     int              `json:"dibuat"`
	Errors     []kesalahanBaris `json:"errors"`
	Rows       any              `json:"rows"`
}

// ringkasanImportPO adalah ringkasan satu PO hasil grouping baris CSV.
type ringkasanImportPO struct {
	POID        string  `json:"po_id"`
	Priority    int     `json:"priority"`
	DueDatetime string  `json:"due_datetime"`
	JumlahBaris int     `json:"jumlah_baris"`
	TotalLiter  float64 `json:"total_liter"`
	LabelData   string  `json:"label_data"`
}

// bacaCSVImport membaca file multipart field "file", memeriksa header, dan
// mengembalikan baris data mentah beserta peta nama kolom ke indeksnya.
// Header salah total, file kosong, dan file/baris di atas batas ditolak 422.
func bacaCSVImport(r *http.Request, kolomWajib []string) ([][]string, map[string]int, error) {
	if e := r.ParseMultipartForm(batasImportBytes * 2); e != nil {
		return nil, nil, &apiError{400, "BAD_REQUEST", "File CSV wajib diunggah lewat field file.", ""}
	}
	file, _, e := r.FormFile("file")
	if e != nil {
		return nil, nil, &apiError{400, "BAD_REQUEST", "File CSV wajib diunggah lewat field file.", ""}
	}
	defer file.Close()
	mentah, e := io.ReadAll(io.LimitReader(file, batasImportBytes+1))
	if e != nil {
		return nil, nil, &apiError{400, "BAD_REQUEST", "File CSV tidak bisa dibaca.", ""}
	}
	if len(mentah) > batasImportBytes {
		return nil, nil, invalid("File CSV melebihi batas 1 MB.", "file")
	}
	pembaca := csv.NewReader(strings.NewReader(string(mentah)))
	pembaca.TrimLeadingSpace = true
	pembaca.FieldsPerRecord = -1
	records, e := pembaca.ReadAll()
	if e != nil {
		return nil, nil, invalid("File CSV tidak valid: "+e.Error(), "file")
	}
	if len(records) == 0 {
		return nil, nil, invalid("File CSV kosong.", "file")
	}
	kolom := map[string]int{}
	for i, nama := range records[0] {
		nama = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(nama, "\ufeff")))
		if nama == "" {
			continue
		}
		if _, dobel := kolom[nama]; dobel {
			return nil, nil, invalid("Header CSV memuat kolom ganda: "+nama, "file")
		}
		kolom[nama] = i
	}
	for _, wajib := range kolomWajib {
		if _, ok := kolom[wajib]; !ok {
			return nil, nil, invalid("Header CSV tidak sesuai. Kolom wajib: "+strings.Join(kolomWajib, ",")+".", "file")
		}
	}
	if len(kolom) != len(kolomWajib) {
		return nil, nil, invalid("Header CSV memuat kolom yang tidak dikenal. Kolom wajib: "+strings.Join(kolomWajib, ",")+".", "file")
	}
	baris := [][]string{}
	for _, rec := range records[1:] {
		kosong := true
		for _, sel := range rec {
			if strings.TrimSpace(sel) != "" {
				kosong = false
				break
			}
		}
		if !kosong {
			baris = append(baris, rec)
		}
	}
	if len(baris) == 0 {
		return nil, nil, invalid("File CSV tidak memiliki baris data.", "file")
	}
	if len(baris) > batasImportBaris {
		return nil, nil, invalid("File CSV melebihi batas 5000 baris data.", "file")
	}
	return baris, kolom, nil
}

// selImport mengambil satu sel berdasarkan nama kolom; baris yang lebih
// pendek dari header dibaca sebagai kosong.
func selImport(rec []string, kolom map[string]int, nama string) string {
	i, ok := kolom[nama]
	if !ok || i >= len(rec) {
		return ""
	}
	return strings.TrimSpace(rec[i])
}

var headerImportPO = []string{"po_id", "priority", "due_datetime", "sku_id", "qty_liter"}

// validasiImportPO mengelompokkan baris CSV menjadi PO (satu baris CSV =
// satu line; po_id sama digabung) dan memvalidasi tiap baris. Baris yang
// gagal dicatat satu kesalahan per baris (masalah pertama yang ditemukan)
// dan tidak ikut membentuk PO.
func validasiImportPO(baris [][]string, kolom map[string]int, info map[string]InfoSKU, existing []ProductionOrder) (laporanImport, []ProductionOrder) {
	laporan := laporanImport{TotalBaris: len(baris), Errors: []kesalahanBaris{}}
	adaDiSistem := map[string]bool{}
	for _, po := range existing {
		adaDiSistem[po.POID] = true
	}
	type grupPO struct {
		po        ProductionOrder
		prioritas *int
		due       string
	}
	grup := map[string]*grupPO{}
	urutan := []string{}

	for i, rec := range baris {
		no := i + 2 // baris 1 adalah header
		gagalkan := func(pesan string) {
			laporan.Errors = append(laporan.Errors, kesalahanBaris{Baris: no, Pesan: pesan})
		}
		poID := selImport(rec, kolom, "po_id")
		if poID == "" {
			gagalkan("po_id wajib diisi.")
			continue
		}
		if adaDiSistem[poID] {
			gagalkan("po_id sudah ada di sistem: " + poID)
			continue
		}
		sku := selImport(rec, kolom, "sku_id")
		if _, ok := info[sku]; !ok {
			gagalkan("SKU tidak dikenal di master data: " + sku)
			continue
		}
		qty, e := strconv.ParseFloat(selImport(rec, kolom, "qty_liter"), 64)
		if e != nil || qty <= 0 {
			gagalkan("qty_liter harus angka lebih dari 0.")
			continue
		}
		var prioritas *int
		if teks := selImport(rec, kolom, "priority"); teks != "" {
			n, e := strconv.Atoi(teks)
			if e != nil || n < 0 {
				gagalkan("priority harus angka bulat 0 atau lebih.")
				continue
			}
			prioritas = &n
		}
		due := selImport(rec, kolom, "due_datetime")
		if e := validasiWaktuKedatangan(due, "due_datetime"); e != nil {
			gagalkan("due_datetime tidak valid: " + due)
			continue
		}
		g, ok := grup[poID]
		if !ok {
			g = &grupPO{po: ProductionOrder{POID: poID, LabelData: "simulasi"}}
			grup[poID] = g
			urutan = append(urutan, poID)
		}
		if g.due == "" {
			g.due = due
		} else if g.due != due {
			gagalkan("due_datetime tidak konsisten untuk po_id yang sama: " + poID)
			continue
		}
		if prioritas != nil {
			if g.prioritas == nil {
				g.prioritas = prioritas
			} else if *g.prioritas != *prioritas {
				gagalkan("priority tidak konsisten untuk po_id yang sama: " + poID)
				continue
			}
		}
		if len(g.po.Lines) >= 20 {
			gagalkan("PO maksimal 20 baris SKU: " + poID)
			continue
		}
		g.po.Lines = append(g.po.Lines, POLine{SKU: sku, QtyLiter: qty})
	}

	baru := []ProductionOrder{}
	ringkasan := []ringkasanImportPO{}
	for _, poID := range urutan {
		g := grup[poID]
		if len(g.po.Lines) == 0 {
			continue
		}
		g.po.DueDatetime = g.due
		g.po.Priority = 1
		if g.prioritas != nil {
			g.po.Priority = *g.prioritas
		}
		total := 0.0
		for _, line := range g.po.Lines {
			total += line.QtyLiter
		}
		baru = append(baru, g.po)
		ringkasan = append(ringkasan, ringkasanImportPO{
			POID: g.po.POID, Priority: g.po.Priority, DueDatetime: g.po.DueDatetime,
			JumlahBaris: len(g.po.Lines), TotalLiter: total, LabelData: g.po.LabelData,
		})
	}
	laporan.Gagal = len(laporan.Errors)
	laporan.Valid = laporan.TotalBaris - laporan.Gagal
	laporan.Rows = ringkasan
	return laporan, baru
}

var headerImportRT = []string{"rt_id", "farm_name", "volume_l", "depart_at", "target_arrival", "estimated_arrival", "actual_arrival", "status"}

// validasiImportRT memvalidasi baris CSV kedatangan RT mengikuti aturan
// jalur form: rt_id tidak boleh menimpa data lama, waktu lewat
// parseWaktuKedatangan (jam "HH:MM" sah dan dinormalisasi), status enum,
// late_minutes dihitung server.
func validasiImportRT(baris [][]string, kolom map[string]int, existing []RTArrival) (laporanImport, []RTArrival) {
	laporan := laporanImport{TotalBaris: len(baris), Errors: []kesalahanBaris{}}
	rtDiSistem := map[string]bool{}
	idDiSistem := map[string]bool{}
	for _, a := range existing {
		rtDiSistem[a.RTID] = true
		idDiSistem[a.ID] = true
	}
	rtDiFile := map[string]bool{}
	idDipakai := map[string]bool{}
	for id := range idDiSistem {
		idDipakai[id] = true
	}
	baru := []RTArrival{}
	for i, rec := range baris {
		no := i + 2
		gagalkan := func(pesan string) {
			laporan.Errors = append(laporan.Errors, kesalahanBaris{Baris: no, Pesan: pesan})
		}
		rtID := selImport(rec, kolom, "rt_id")
		if rtID == "" {
			gagalkan("rt_id wajib diisi.")
			continue
		}
		if rtDiSistem[rtID] {
			gagalkan("rt_id sudah ada di sistem: " + rtID + ". Import tidak menimpa data lama.")
			continue
		}
		if rtDiFile[rtID] {
			gagalkan("rt_id duplikat di file: " + rtID)
			continue
		}
		farmName := selImport(rec, kolom, "farm_name")
		if farmName == "" {
			gagalkan("farm_name wajib diisi.")
			continue
		}
		volume, e := strconv.ParseFloat(selImport(rec, kolom, "volume_l"), 64)
		if e != nil || volume <= 0 {
			gagalkan("volume_l harus angka lebih dari 0.")
			continue
		}
		depart := selImport(rec, kolom, "depart_at")
		target := selImport(rec, kolom, "target_arrival")
		estimasi := selImport(rec, kolom, "estimated_arrival")
		aktual := selImport(rec, kolom, "actual_arrival")
		salahWaktu := ""
		for _, w := range []struct{ nilai, field string }{
			{depart, "depart_at"}, {target, "target_arrival"}, {estimasi, "estimated_arrival"},
		} {
			if e := validasiWaktuKedatangan(w.nilai, w.field); e != nil {
				salahWaktu = w.field
				break
			}
		}
		if salahWaktu == "" && aktual != "" {
			if e := validasiWaktuKedatangan(aktual, "actual_arrival"); e != nil {
				salahWaktu = "actual_arrival"
			}
		}
		if salahWaktu != "" {
			gagalkan("Format waktu tidak valid pada kolom " + salahWaktu + ".")
			continue
		}
		status := selImport(rec, kolom, "status")
		if status == "" {
			status = "Dijadwalkan"
		}
		if !statusKedatanganValid[status] {
			gagalkan("Status kedatangan tidak valid: " + status)
			continue
		}
		id := "ARR-" + rtID
		for n := 2; idDipakai[id]; n++ {
			id = "ARR-" + rtID + "-" + strconv.Itoa(n)
		}
		idDipakai[id] = true
		rtDiFile[rtID] = true
		a := RTArrival{
			ID: id, FarmID: farmID(farmName), FarmName: farmName, RTID: rtID, VolumeL: volume,
			DepartAt:         normalisasiWaktuKedatangan(depart),
			TargetArrival:    normalisasiWaktuKedatangan(target),
			EstimatedArrival: normalisasiWaktuKedatangan(estimasi),
			Status:           status,
		}
		if aktual != "" {
			v := normalisasiWaktuKedatangan(aktual)
			a.ActualArrival = &v
		}
		a.LateMinutes = hitungLateMenit(a.EstimatedArrival, a.TargetArrival)
		baru = append(baru, a)
	}
	laporan.Gagal = len(laporan.Errors)
	laporan.Valid = laporan.TotalBaris - laporan.Gagal
	laporan.Rows = baru
	return laporan, baru
}

func (s *Server) registerImportCSV(register func(string, string, endpoint)) {
	register("POST /api/v1/pos/import", "plan.decide", func(r *http.Request) (any, error) {
		commit := r.URL.Query().Get("commit") == "true"
		if commit {
			if err := s.dbRequired(); err != nil {
				return nil, err
			}
		}
		baris, kolom, e := bacaCSVImport(r, headerImportPO)
		if e != nil {
			return nil, e
		}
		katalog, e := s.katalogMaster()
		if e != nil {
			return nil, e
		}
		existing, e := s.productionOrders(r.Context())
		if e != nil {
			return nil, e
		}
		laporan, baru := validasiImportPO(baris, kolom, infoSKU(katalog), existing)
		laporan.Commit = commit
		if !commit || len(baru) == 0 {
			return laporan, nil
		}
		_, e = s.change(r.Context(), "po", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list, e := basisPOs(s, raw)
			if e != nil {
				return store.Change{}, e
			}
			ada := map[string]bool{}
			for _, po := range list {
				ada[po.POID] = true
			}
			dibuat := 0
			for _, po := range baru {
				if ada[po.POID] {
					continue
				}
				ada[po.POID] = true
				list = append(list, po)
				dibuat++
			}
			laporan.Dibuat = dibuat
			return store.Change{Value: list, Event: "po.imported"}, nil
		})
		if e != nil {
			return nil, e
		}
		return laporan, nil
	})
	register("POST /api/v1/supply/rt-arrivals/import", "rt.manage", func(r *http.Request) (any, error) {
		commit := r.URL.Query().Get("commit") == "true"
		if commit {
			if err := s.dbRequired(); err != nil {
				return nil, err
			}
		}
		baris, kolom, e := bacaCSVImport(r, headerImportRT)
		if e != nil {
			return nil, e
		}
		existing, e := s.rtArrivals(r.Context())
		if e != nil {
			return nil, e
		}
		laporan, baru := validasiImportRT(baris, kolom, existing)
		laporan.Commit = commit
		if !commit || len(baru) == 0 {
			return laporan, nil
		}
		_, e = s.change(r.Context(), "rt-arrival", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list, e := basisRTArrivals(s, raw)
			if e != nil {
				return store.Change{}, e
			}
			ada := map[string]bool{}
			idAda := map[string]bool{}
			for _, a := range list {
				ada[a.RTID] = true
				idAda[a.ID] = true
			}
			dibuat := 0
			for _, a := range baru {
				if ada[a.RTID] {
					continue
				}
				for n := 2; idAda[a.ID]; n++ {
					a.ID = "ARR-" + a.RTID + "-" + strconv.Itoa(n)
				}
				ada[a.RTID] = true
				idAda[a.ID] = true
				list = append(list, a)
				dibuat++
			}
			sortRTArrivals(list)
			laporan.Dibuat = dibuat
			return store.Change{Value: list, Event: "rt-arrival.imported"}, nil
		})
		if e != nil {
			return nil, e
		}
		return laporan, nil
	})
}
