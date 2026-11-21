package api

import (
	"os"
	"path/filepath"
	"testing"
)

// TestSkenarioNovTermuat membuktikan seed skenario 1 Nov 2026 (snapshot
// Opening Inventory Greenfields) termuat lewat LoadAllSeeds dan bentuk
// bertipenya utuh: 28 tangki berlabel historis, nilai tangki terisi dan
// tangki kosong sesuai snapshot, dan subset scheduler hanya tangki
// aseptik dengan batas holding dari snapshot.
func TestSkenarioNovTermuat(t *testing.T) {
	s := &Server{Mode: "demo"}
	_ = s.Handler() // memuat semua seed, termasuk scenario-2026-11-01.json

	sk, err := s.skenarioNov()
	if err != nil {
		t.Fatalf("skenarioNov: %v", err)
	}
	if sk.ID != "skenario-2026-11-01" || sk.LabelData != "historis" {
		t.Fatalf("identitas skenario salah: %+v", sk)
	}
	if sk.SnapshotTime != "2026-11-01T06:00:00+07:00" {
		t.Errorf("snapshot_time salah: %s", sk.SnapshotTime)
	}
	if len(sk.Tanks) != 28 {
		t.Fatalf("snapshot harus memuat 28 tangki, dapat %d", len(sk.Tanks))
	}

	perID := map[string]TangkiNov{}
	for _, tk := range sk.Tanks {
		perID[tk.ID] = tk
	}
	rmt := perID["RMT-01"]
	if rmt.VolumeL != 45000 || rmt.KapasitasL != 80000 || rmt.BatasHoldingJam != 12 {
		t.Errorf("RMT-01 tidak sesuai snapshot: %+v", rmt)
	}
	if rmt.Produk == nil || *rmt.Produk != "Raw Milk" || rmt.SKUCair != nil {
		t.Errorf("RMT-01 produk/SKU salah: %+v", rmt)
	}
	kosong := perID["SFP-06"]
	if kosong.VolumeL != 0 || kosong.Status != "Empty - Clean Ready" || kosong.TerisiPada != nil {
		t.Errorf("SFP-06 harus tangki kosong tanpa jam terisi: %+v", kosong)
	}

	// Keputusan 10: hanya tangki aseptik yang menjadi TangkiJadwal, dengan
	// kapasitas dan batas holding dari snapshot (bukan contoh ops.json).
	jadwal := sk.TangkiScheduler()
	if len(jadwal) != 5 {
		t.Fatalf("tangki scheduler harus 5 tangki aseptik, dapat %d", len(jadwal))
	}
	kapasitas := map[string]float64{"AT-01": 20000, "AT-02": 20000, "AT-03": 22000, "AT-04": 18000, "AT-05": 16000}
	for _, tj := range jadwal {
		if kapasitas[tj.ID] != tj.CapacityL {
			t.Errorf("%s kapasitas %.0f, mau %.0f dari snapshot", tj.ID, tj.CapacityL, kapasitas[tj.ID])
		}
		if tj.LevelL != 0 || tj.MaxHoldingHours != 8 {
			t.Errorf("%s harus kosong dengan batas holding 8 jam: %+v", tj.ID, tj)
		}
	}
}

// TestImportGreenfieldsNovPreview menjalankan dua CSV hasil ETL Langkah 3
// (tersimpan sebagai fixture di testdata, isinya sama dengan berkas contoh
// di your_files) lewat endpoint import sungguhan dengan commit=false dan
// label_data=historis. Keduanya harus diterima penuh tanpa satu pun
// kesalahan baris, dan setiap record harus membawa label historis.
func TestImportGreenfieldsNovPreview(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	bacaFixture := func(nama string) string {
		raw, err := os.ReadFile(filepath.Join("testdata", nama))
		if err != nil {
			t.Fatalf("fixture %s: %v", nama, err)
		}
		return string(raw)
	}

	// PO: 88 usulan dua minggu menjadi 88 PO satu baris.
	w := importRequest(h, "/pos/import?commit=false&label_data=historis", "planner", bacaFixture("greenfields-po-nov.csv"))
	if w.Code != 200 {
		t.Fatalf("preview import PO Greenfields = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["total_baris"] != 88.0 || rep["valid"] != 88.0 || rep["gagal"] != 0.0 {
		t.Fatalf("preview PO Greenfields harus 88 valid tanpa gagal: %v", rep)
	}
	if rep["label_data"] != "historis" {
		t.Fatalf("laporan preview PO harus berlabel historis: %v", rep)
	}
	rows := arr(rep["rows"])
	if len(rows) != 88 {
		t.Fatalf("preview PO harus menghasilkan 88 ringkasan PO: %d", len(rows))
	}
	pertama, terakhir := obj(rows[0]), obj(rows[len(rows)-1])
	if pertama["po_id"] != "WPP-0001" || pertama["priority"] != 1.0 || pertama["due_datetime"] != "2026-11-08T23:59:00+07:00" {
		t.Errorf("PO pertama salah (urutan, prioritas, due akhir minggu 1): %v", pertama)
	}
	for _, ringkasan := range rows {
		if obj(ringkasan)["label_data"] != "historis" {
			t.Errorf("semua PO Greenfields harus berlabel historis: %v", ringkasan)
			break
		}
	}
	if terakhir["po_id"] != "WPP-0088" || terakhir["priority"] != 88.0 || terakhir["due_datetime"] != "2026-11-15T23:59:00+07:00" {
		t.Errorf("PO terakhir salah (urutan, prioritas, due akhir minggu 2): %v", terakhir)
	}

	// Kedatangan RT: seluruh Future Supply 1..15 Nov (448 baris) diterima.
	w = importRequest(h, "/supply/rt-arrivals/import?commit=false&label_data=historis", "receiving", bacaFixture("greenfields-rt-nov.csv"))
	if w.Code != 200 {
		t.Fatalf("preview import RT Greenfields = %d: %s", w.Code, w.Body.String())
	}
	rep = decodeMap(t, w)
	if rep["total_baris"] != 448.0 || rep["valid"] != 448.0 || rep["gagal"] != 0.0 {
		t.Fatalf("preview RT Greenfields harus 448 valid tanpa gagal: %v", rep)
	}
	if rep["label_data"] != "historis" {
		t.Fatalf("laporan preview RT harus berlabel historis: %v", rep)
	}
	rows = arr(rep["rows"])
	if len(rows) != 448 {
		t.Fatalf("preview RT harus menghasilkan 448 record: %d", len(rows))
	}
	head := obj(rows[0])
	if head["id"] != "ARR-FUT-RDLV-00001" || head["farm_id"] != "FARM-01" || head["farm_name"] != "FARM-01" {
		t.Errorf("record RT pertama salah identitas: %v", head)
	}
	if head["status"] != "Dijadwalkan" || head["late_minutes"] != 0.0 || head["actual_arrival"] != nil {
		t.Errorf("record RT pertama harus terjadwal, tepat waktu, belum tiba: %v", head)
	}
	tail := obj(rows[len(rows)-1])
	if tail["rt_id"] != "FUT-RDLV-00448" || tail["depart_at"] != "2026-11-15T03:48:52+07:00" {
		t.Errorf("record RT terakhir salah: %v", tail)
	}
	for _, record := range rows {
		if obj(record)["label_data"] != "historis" {
			t.Errorf("semua kedatangan Greenfields harus berlabel historis: %v", record)
			break
		}
	}
}
