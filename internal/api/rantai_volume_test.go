package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestStepTransferNormalisasi(t *testing.T) {
	if got := stepTransfer(""); got != "transfer" {
		t.Errorf("step kosong harus menjadi transfer, dapat %q", got)
	}
	if got := stepTransfer("penerimaan"); got != "penerimaan" {
		t.Errorf("step penerimaan berubah: %q", got)
	}
	for _, s := range []string{"penerimaan", "transfer", "pemrosesan", "filling", "pengemasan"} {
		if !langkahTransferValid[s] {
			t.Errorf("step %q harus sah", s)
		}
	}
	if langkahTransferValid["terbang"] {
		t.Error("step terbang tidak boleh sah")
	}
}

func TestHitungOutputProduksi(t *testing.T) {
	// Contoh coaching: 12.200 L masuk, kemasan 1000 ml, 12.000 kemasan
	// keluar, selisih 200 L (1,64%).
	out, selisih, pct := hitungOutputProduksi(12200, 1000, 12000)
	if out != 12000 || selisih != 200 || pct != 1.64 {
		t.Errorf("hitungOutputProduksi(12200, 1000, 12000) = (%v, %v, %v), mau (12000, 200, 1.64)", out, selisih, pct)
	}
	out, selisih, pct = hitungOutputProduksi(5000, 250, 19800)
	if out != 4950 || selisih != 50 || pct != 1 {
		t.Errorf("hitungOutputProduksi(5000, 250, 19800) = (%v, %v, %v), mau (4950, 50, 1)", out, selisih, pct)
	}
	// Pengaman pembagian nol: volume masuk 0 tidak boleh menghasilkan
	// persen tak hingga/NaN.
	_, _, pct = hitungOutputProduksi(0, 1000, 0)
	if pct != 0 {
		t.Errorf("pct untuk volume masuk 0 = %v, mau 0", pct)
	}
}

func TestRefDikenal(t *testing.T) {
	s := &Server{Mode: "demo"}
	_ = s.Handler()
	arrivals := s.seedRTArrivals()
	sah := []string{
		"FL-01", "ST-01", "FARM-SUPPLY", "RT-INPUT", "FG-OUTPUT", // katalog master
		"ST-4", "MX-2", "AT-2", "F7", "RMT-1", "Bay 1", // seed demo
		"RT-26", "RT-23", // RT pada jadwal kedatangan
	}
	for _, ref := range sah {
		if !s.refDikenal(t.Context(), ref, arrivals) {
			t.Errorf("ref %q harus dikenal", ref)
		}
	}
	for _, ref := range []string{"SP-1", "TH-1", "TANGKI-X", "RT-99", ""} {
		if s.refDikenal(t.Context(), ref, arrivals) {
			t.Errorf("ref %q tidak boleh dikenal", ref)
		}
	}
}

func TestRantaiVolumeTanpaDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	// Baca saldo alat yang dikenal: nol catatan, tetap 200.
	w := durableRequest(h, "GET", "/trace/assets/RMT-1/volume", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET volume tanpa DB = %d: %s", w.Code, w.Body.String())
	}
	vol := decodeMap(t, w)
	if vol["total_in_l"] != 0.0 || vol["balance_l"] != 0.0 || vol["jumlah_transfer"] != 0.0 {
		t.Errorf("volume tanpa catatan harus nol: %v", vol)
	}
	// Rantai batch yang belum punya catatan: 404.
	w = durableRequest(h, "GET", "/trace/batches/FG-RT-01/volume-chain", "planner", "")
	if w.Code != 404 {
		t.Fatalf("volume-chain tanpa catatan harus 404, dapat %d", w.Code)
	}
	// Tulis output tanpa DB: berhenti di 503 sesudah otorisasi lolos.
	w = durableRequest(h, "POST", "/production/outputs", "planner", `{"batch_id":"FG-RT-01","filling_ref":"FL-01","volume_in_l":100,"pack_size_ml":1000,"packs_out":90}`)
	if w.Code != 503 {
		t.Fatalf("POST output tanpa DB harus 503, dapat %d: %s", w.Code, w.Body.String())
	}
}

func TestRantaiVolumeDenganDB(t *testing.T) {
	db := testDB(t)
	if err := db.Reset(t.Context()); err != nil {
		t.Fatal(err)
	}
	h := (&Server{Mode: "demo", DB: db}).Handler()

	// Rantai batch uji: RT-26 -> RMT-1 (penerimaan) -> ST-4 -> FL-01.
	w := durableRequest(h, "POST", "/trace/transfers", "planner", `{"batch_id":"FG-RT-01","from_ref":"RT-26","to_ref":"RMT-1","step":"penerimaan","volume_out_l":12200,"volume_in_l":12200}`)
	if w.Code != 200 {
		t.Fatalf("POST transfer penerimaan = %d: %s", w.Code, w.Body.String())
	}
	if rec := obj(decodeMap(t, w)["result"]); rec["step"] != "penerimaan" {
		t.Errorf("step tersimpan = %v, mau penerimaan", rec["step"])
	}
	// Tanpa step: default "transfer".
	w = durableRequest(h, "POST", "/trace/transfers", "planner", `{"batch_id":"FG-RT-01","from_ref":"RMT-1","to_ref":"ST-4","volume_out_l":12200,"volume_in_l":12000}`)
	if w.Code != 200 {
		t.Fatalf("POST transfer kedua = %d: %s", w.Code, w.Body.String())
	}
	if rec := obj(decodeMap(t, w)["result"]); rec["step"] != "transfer" {
		t.Errorf("step default = %v, mau transfer", rec["step"])
	}
	w = durableRequest(h, "POST", "/trace/transfers", "operator", `{"batch_id":"FG-RT-01","from_ref":"ST-4","to_ref":"FL-01","step":"filling","volume_out_l":12000,"volume_in_l":12000}`)
	if w.Code != 200 {
		t.Fatalf("POST transfer filling = %d: %s", w.Code, w.Body.String())
	}

	// Step tak dikenal dan ref tak dikenal ditolak 422.
	w = durableRequest(h, "POST", "/trace/transfers", "planner", `{"batch_id":"FG-RT-01","from_ref":"RMT-1","to_ref":"ST-4","step":"terbang","volume_out_l":1,"volume_in_l":1}`)
	if w.Code != 422 {
		t.Fatalf("step tak dikenal harus 422, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/trace/transfers", "planner", `{"batch_id":"FG-RT-01","from_ref":"TANGKI-X","to_ref":"ST-4","volume_out_l":1,"volume_in_l":1}`)
	if w.Code != 422 || !strings.Contains(w.Body.String(), "TANGKI-X") {
		t.Fatalf("ref tak dikenal harus 422 menyebut ref-nya, dapat %d: %s", w.Code, w.Body.String())
	}

	// Saldo per alat diturunkan dari catatan transfer.
	w = durableRequest(h, "GET", "/trace/assets/RMT-1/volume", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET volume RMT-1 = %d: %s", w.Code, w.Body.String())
	}
	vol := decodeMap(t, w)
	if vol["total_in_l"] != 12200.0 || vol["total_out_l"] != 12200.0 || vol["balance_l"] != 0.0 || vol["jumlah_transfer"] != 2.0 {
		t.Errorf("volume RMT-1 tidak sesuai: %v", vol)
	}
	w = durableRequest(h, "GET", "/trace/assets/ST-4/volume", "planner", "")
	vol = decodeMap(t, w)
	if vol["total_in_l"] != 12000.0 || vol["total_out_l"] != 12000.0 || vol["balance_l"] != 0.0 {
		t.Errorf("volume ST-4 tidak sesuai: %v", vol)
	}
	w = durableRequest(h, "GET", "/trace/assets/TIDAK-ADA/volume", "planner", "")
	if w.Code != 404 {
		t.Fatalf("volume ref tak dikenal harus 404, dapat %d", w.Code)
	}

	// Rantai sebelum ada output: total loss masih null, bukan rekaan.
	w = durableRequest(h, "GET", "/trace/batches/FG-RT-01/volume-chain", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET volume-chain = %d: %s", w.Code, w.Body.String())
	}
	chain := decodeMap(t, w)
	if chain["label_data"] != "simulasi" {
		t.Errorf("label_data rantai = %v, mau simulasi", chain["label_data"])
	}
	if len(arr(chain["langkah"])) != 3 {
		t.Fatalf("langkah rantai harus 3: %s", w.Body.String())
	}
	if first := obj(arr(chain["langkah"])[0]); first["step"] != "penerimaan" {
		t.Errorf("langkah pertama harus penerimaan (kronologis): %v", first)
	}
	ring := obj(chain["ringkasan"])
	if ring["total_masuk_l"] != 12200.0 || ring["total_keluar_produk_l"] != 0.0 {
		t.Errorf("ringkasan awal tidak sesuai: %v", ring)
	}
	if ring["total_loss_l"] != nil || ring["total_loss_pct"] != nil {
		t.Errorf("total loss tanpa output harus null: %v", ring)
	}
	perTitik := map[string]map[string]any{}
	for _, p := range arr(chain["per_titik"]) {
		m := obj(p)
		perTitik[str(m["ref"])] = m
	}
	if perTitik["ST-4"]["masuk_l"] != 12000.0 || perTitik["ST-4"]["keluar_l"] != 12000.0 {
		t.Errorf("agregat ST-4 tidak sesuai: %v", perTitik["ST-4"])
	}
	if perTitik["FL-01"]["masuk_l"] != 12000.0 {
		t.Errorf("agregat FL-01 tidak sesuai: %v", perTitik["FL-01"])
	}

	// Output produksi: 12.000 L masuk filling, kemasan 1000 ml,
	// 11.700 kemasan keluar.
	w = durableRequest(h, "POST", "/production/outputs", "operator", `{"batch_id":"FG-RT-01","filling_ref":"FL-01","volume_in_l":12000,"pack_size_ml":1000,"packs_out":11700}`)
	if w.Code != 200 {
		t.Fatalf("POST output = %d: %s", w.Code, w.Body.String())
	}
	out := obj(decodeMap(t, w)["result"])
	if out["id"] != "OUT-001" || out["volume_out_l"] != 11700.0 || out["selisih_l"] != 300.0 || out["selisih_pct"] != 2.5 {
		t.Errorf("output produksi tidak sesuai: %v", out)
	}
	// qa tidak memegang transfer.record.
	w = durableRequest(h, "POST", "/production/outputs", "qa", `{"batch_id":"FG-RT-01","filling_ref":"FL-01","volume_in_l":100,"pack_size_ml":1000,"packs_out":90}`)
	if w.Code != 403 {
		t.Fatalf("POST output sebagai qa harus 403, dapat %d", w.Code)
	}
	// filling_ref tak dikenal ditolak.
	w = durableRequest(h, "POST", "/production/outputs", "planner", `{"batch_id":"FG-RT-01","filling_ref":"FL-XX","volume_in_l":100,"pack_size_ml":1000,"packs_out":90}`)
	if w.Code != 422 {
		t.Fatalf("POST output ref tak dikenal harus 422, dapat %d", w.Code)
	}

	// Rantai sesudah output: total loss terisi ujung ke ujung.
	w = durableRequest(h, "GET", "/trace/batches/FG-RT-01/volume-chain", "planner", "")
	chain = decodeMap(t, w)
	ring = obj(chain["ringkasan"])
	if ring["total_keluar_produk_l"] != 11700.0 || ring["total_loss_l"] != 500.0 || ring["total_loss_pct"] != 4.1 {
		t.Errorf("ringkasan akhir tidak sesuai: %v", ring)
	}
	if len(arr(chain["output_produksi"])) != 1 {
		t.Errorf("output_produksi rantai harus 1: %s", w.Body.String())
	}
	w = durableRequest(h, "GET", "/production/outputs?batch_id=FG-RT-01", "planner", "")
	var outs []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &outs); err != nil || len(outs) != 1 {
		t.Fatalf("GET outputs terfilter harus 1 baris: %s", w.Body.String())
	}

	// Batch tanpa catatan apa pun: 404.
	w = durableRequest(h, "GET", "/trace/batches/BATCH-KOSONG/volume-chain", "planner", "")
	if w.Code != 404 {
		t.Fatalf("volume-chain batch kosong harus 404, dapat %d", w.Code)
	}
}

func TestRantaiVolumeContohCoachingDenganDB(t *testing.T) {
	db := testDB(t)
	if err := db.Reset(t.Context()); err != nil {
		t.Fatal(err)
	}
	h := (&Server{Mode: "demo", DB: db}).Handler()

	// Contoh mass balance coaching: 12.200 L diterima, produk keluar
	// 12.000 L dalam kemasan 1000 ml, loss 200 L (1,64%).
	w := durableRequest(h, "POST", "/trace/transfers", "receiving", `{"batch_id":"FG-COACH","from_ref":"RT-24","to_ref":"RMT-2","step":"penerimaan","volume_out_l":12200,"volume_in_l":12200}`)
	if w.Code != 200 {
		t.Fatalf("POST transfer coaching = %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/production/outputs", "planner", `{"batch_id":"FG-COACH","filling_ref":"F7","volume_in_l":12200,"pack_size_ml":1000,"packs_out":12000}`)
	if w.Code != 200 {
		t.Fatalf("POST output coaching = %d: %s", w.Code, w.Body.String())
	}
	out := obj(decodeMap(t, w)["result"])
	if out["volume_out_l"] != 12000.0 || out["selisih_l"] != 200.0 || out["selisih_pct"] != 1.64 {
		t.Errorf("output coaching tidak sesuai: %v", out)
	}
	w = durableRequest(h, "GET", "/trace/batches/FG-COACH/volume-chain", "planner", "")
	ring := obj(decodeMap(t, w)["ringkasan"])
	if ring["total_masuk_l"] != 12200.0 || ring["total_keluar_produk_l"] != 12000.0 || ring["total_loss_l"] != 200.0 || ring["total_loss_pct"] != 1.64 {
		t.Errorf("ringkasan coaching tidak sesuai: %v", ring)
	}
}
