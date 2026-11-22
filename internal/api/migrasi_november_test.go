package api

import (
	"context"
	"encoding/json"
	"math"
	"testing"
)

// Tes pengunci migrasi skenario aktif Greenfields (keputusan D1 s.d.
// D8, 22 Nov 2026). Perilaku yang dikunci di sini adalah perilaku
// skenario November sebagai basis aktif; berkas kasus lama harus
// tetap utuh sebagai fixture dan jalur rollback.

// TestBasisSkenarioNovemberKosong: basis PO dan kedatangan aktif
// kosong sebelum state terisi, sementara fungsi seed lama tetap
// mengembalikan isi kasusnya (rollback dan fixture tes lain).
func TestBasisSkenarioNovemberKosong(t *testing.T) {
	seeds, err := LoadAllSeeds()
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{seeds: seeds}
	ctx := context.Background()
	pos, err := s.productionOrders(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 0 {
		t.Errorf("basis PO skenario November harus kosong, dapat %d", len(pos))
	}
	arrivals, err := s.rtArrivals(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(arrivals) != 0 {
		t.Errorf("basis kedatangan skenario November harus kosong, dapat %d", len(arrivals))
	}
	if len(s.seedPOs()) != 1 || s.seedPOs()[0].POID != "PO-2026-1101" {
		t.Errorf("seedPOs lama harus tetap utuh sebagai berkas kasus: %+v", s.seedPOs())
	}
	if len(s.seedRTArrivals()) != 8 {
		t.Errorf("seedRTArrivals lama harus tetap 8 baris: %d", len(s.seedRTArrivals()))
	}
}

// TestWaktuDemoJangkarNovember: jangkar skenario aktif adalah
// Minggu 1 Nov 2026 06.00 WIB (keputusan D1).
func TestWaktuDemoJangkarNovember(t *testing.T) {
	if got := formatWaktu(waktuDemo); got != "2026-11-01T06:00:00+07:00" {
		t.Errorf("waktuDemo = %s, mau 2026-11-01T06:00:00+07:00", got)
	}
	if got := labelJangkar(); got != "1 Nov 2026 06.00 WIB" {
		t.Errorf("labelJangkar = %q", got)
	}
}

// TestEndpointSkenarioNovember: snapshot November tersaji lewat API,
// 28 tangki berlabel historis.
func TestEndpointSkenarioNovember(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/scenario/november/tanks", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /scenario/november/tanks = %d: %s", w.Code, w.Body.String())
	}
	m := decodeMap(t, w)
	if m["label_data"] != "historis" {
		t.Errorf("label_data snapshot harus historis: %v", m["label_data"])
	}
	tanks := arr(m["tanks"])
	if len(tanks) != 28 {
		t.Fatalf("snapshot harus 28 tangki, dapat %d", len(tanks))
	}
	if obj(tanks[0])["id"] == "" {
		t.Errorf("baris tangki harus membawa id: %v", tanks[0])
	}
	w = durableRequest(h, "GET", "/scenario/november", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /scenario/november = %d: %s", w.Code, w.Body.String())
	}
	penuh := decodeMap(t, w)
	if penuh["snapshot_time"] != "2026-11-01T06:00:00+07:00" {
		t.Errorf("snapshot_time salah: %v", penuh["snapshot_time"])
	}
}

// TestParamsJadwalTangkiNovember: tangki scheduler berasal dari
// snapshot November (AT-01 s.d. AT-05, kapasitas resmi, kosong).
func TestParamsJadwalTangkiNovember(t *testing.T) {
	seeds, err := LoadAllSeeds()
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{seeds: seeds}
	params, _, err := s.paramsJadwal(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	mauKapasitas := map[string]float64{"AT-01": 20000, "AT-02": 20000, "AT-03": 22000, "AT-04": 18000, "AT-05": 16000}
	if len(params.Tanks) != len(mauKapasitas) {
		t.Fatalf("tangki scheduler harus 5, dapat %+v", params.Tanks)
	}
	for _, tk := range params.Tanks {
		kap, ok := mauKapasitas[tk.ID]
		if !ok {
			t.Errorf("tangki scheduler tak terduga: %s", tk.ID)
			continue
		}
		if tk.CapacityL != kap || tk.LevelL != 0 || tk.MaxHoldingHours != 8 {
			t.Errorf("tangki %s salah: kapasitas %v level %v holding %v", tk.ID, tk.CapacityL, tk.LevelL, tk.MaxHoldingHours)
		}
	}
}

// TestReceivingNovemberDariState: receiving dibasiskan ulang ke state
// kedatangan; tanpa state antreannya kosong, panel lab ditiadakan,
// dan incident null (bukan insiden skenario lama).
func TestReceivingNovemberDariState(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/receiving", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /receiving = %d: %s", w.Code, w.Body.String())
	}
	m := decodeMap(t, w)
	if len(arr(m["tankers"])) != 0 {
		t.Errorf("tankers tanpa state harus kosong: %v", m["tankers"])
	}
	if len(arr(m["labHistory"])) != 0 {
		t.Errorf("labHistory skenario November harus kosong: %v", m["labHistory"])
	}
	if m["incident"] != nil {
		t.Errorf("incident skenario November harus null: %v", m["incident"])
	}
	metrics := arr(m["metrics"])
	if len(metrics) != 4 || obj(metrics[0])["label"] != "Kedatangan terjadwal" || obj(metrics[0])["value"] != "0" {
		t.Errorf("metrik receiving November salah: %v", metrics)
	}
}

// TestFarmsNovemberAgregatKosong: panel farm adalah agregat state;
// tanpa kedatangan hasilnya daftar kosong, bukan farm fiktif seed.
func TestFarmsNovemberAgregatKosong(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/supply/farms", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /supply/farms = %d: %s", w.Code, w.Body.String())
	}
	var farms []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &farms); err != nil || len(farms) != 0 {
		t.Fatalf("farms tanpa state harus kosong: %s", w.Body.String())
	}
}

// TestSiteStatusNovemberDariState: keputusan D2, kedua view sama,
// silo mengikuti fraksi RMT snapshot, tanpa starvation karangan.
func TestSiteStatusNovemberDariState(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/site/status?view=before", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /site/status = %d: %s", w.Code, w.Body.String())
	}
	before := decodeMap(t, w)
	w = durableRequest(h, "GET", "/site/status?view=after", "planner", "")
	after := decodeMap(t, w)
	if before["viewLabel"] != after["viewLabel"] {
		t.Errorf("kedua view harus identik pada skenario November: %v vs %v", before["viewLabel"], after["viewLabel"])
	}
	if before["viewLabel"] != "Kondisi tercatat · 1 Nov 2026 06.00 WIB" {
		t.Errorf("viewLabel salah: %v", before["viewLabel"])
	}
	if before["at2Starved"] != false {
		t.Errorf("at2Starved harus false: %v", before["at2Starved"])
	}
	silos := arr(before["silos"])
	mau := []float64{0.5625, 0.5, 0.4167}
	if len(silos) != len(mau) {
		t.Fatalf("silos harus 3 fraksi RMT: %v", silos)
	}
	for i, v := range silos {
		f, _ := v.(float64)
		if math.Abs(f-mau[i]) > 0.001 {
			t.Errorf("silos[%d] = %v, mau %v", i, f, mau[i])
		}
	}
}

// TestNotifikasiNovember: item skenario lama (rencana FIFO dan
// HOLD-RT26) hilang; ringkasan state dan item kasus LAB-8812 ada.
func TestNotifikasiNovember(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/notifications", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /notifications = %d: %s", w.Code, w.Body.String())
	}
	var items []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, it := range items {
		ids[str(it["id"])] = true
	}
	if ids["PLAN-FIFO"] || ids["HOLD-RT26"] {
		t.Errorf("notifikasi skenario lama tidak boleh muncul: %v", ids)
	}
	if !ids["LAB-8812"] || !ids["RT-NOV"] || !ids["SCH-NOV"] {
		t.Errorf("notifikasi November harus memuat LAB-8812, RT-NOV, SCH-NOV: %v", ids)
	}
}

// TestDemandPlanNovember: tanpa PO aktif barisnya kosong dan
// parameter kapasitas mengikuti batasan resmi partner.
func TestDemandPlanNovember(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/supply/demand-plan", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /supply/demand-plan = %d: %s", w.Code, w.Body.String())
	}
	m := decodeMap(t, w)
	if len(arr(m["lines"])) != 0 {
		t.Errorf("lines tanpa PO harus kosong: %v", m["lines"])
	}
	if m["capacityL"] != 320000.0 || m["milkDensity"] != 1.0 {
		t.Errorf("parameter kapasitas harus resmi partner (320000 L, density 1): %v", m)
	}
}

// TestShiftsJangkarNovember: shift terpilih mengikuti tanggal jangkar.
func TestShiftsJangkarNovember(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/shifts", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /shifts = %d: %s", w.Code, w.Body.String())
	}
	var shifts []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &shifts); err != nil || len(shifts) != 1 {
		t.Fatalf("shifts harus 1 baris: %s", w.Body.String())
	}
	if shifts[0]["id"] != "2026-11-01-siang" || shifts[0]["date"] != "Min 1 Nov" {
		t.Errorf("shift tidak mengikuti jangkar 1 Nov: %v", shifts[0])
	}
}
