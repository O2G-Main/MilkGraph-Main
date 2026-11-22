package api

import (
	"encoding/json"
	"math"
	"net/http/httptest"
	"testing"
)

// TestRingkasanNeraca menguji fungsi ringkasan pada tiga hari buatan
// tangan yang hasilnya bisa dihitung manual:
// masuk total 6.000, output total 4.000, selisih total 2.000 (33,33
// persen), rata-rata persen harian (50 + 25 + 25) / 3 = 33,33, ekstrem
// persen tertinggi hari pertama, dan selisih absolut terbesar juga
// hari pertama (1.000).
func TestRingkasanNeraca(t *testing.T) {
	hari := []HariNeraca{
		{Tanggal: "2026-05-01", MasukL: 2000, OutputBagusL: 950, RejectL: 40, SamplingL: 10, OutputTotalL: 1000, SelisihL: 1000, SelisihPersen: 50},
		{Tanggal: "2026-05-02", MasukL: 3000, OutputBagusL: 2200, RejectL: 40, SamplingL: 10, OutputTotalL: 2250, SelisihL: 750, SelisihPersen: 25},
		{Tanggal: "2026-05-03", MasukL: 1000, OutputBagusL: 730, RejectL: 15, SamplingL: 5, OutputTotalL: 750, SelisihL: 250, SelisihPersen: 25},
	}
	// Hari ketiga disesuaikan supaya persennya 25 dan total tetap konsisten:
	// selisih 250 dari masuk 1000 adalah 25 persen. Ekstrem terendah
	// adalah hari kedua dan ketiga sama sama 25; fungsi mengambil yang
	// pertama ditemukan, jadi hari kedua.
	r := ringkasanNeraca(hari)
	if r.JumlahHari != 3 || r.TanggalAwal != "2026-05-01" || r.TanggalAkhir != "2026-05-03" {
		t.Fatalf("rentang salah: %+v", r)
	}
	if r.TotalMasukL != 6000 || r.TotalOutputL != 4000 || r.TotalSelisihL != 2000 {
		t.Errorf("total salah: %+v", r)
	}
	if r.TotalRejectL != 95 || r.TotalSamplingL != 25 || r.TotalOutputBagusL != 3880 {
		t.Errorf("total komponen salah: %+v", r)
	}
	if r.SelisihPersenTotal != 33.33 {
		t.Errorf("selisih persen total = %v, mau 33.33", r.SelisihPersenTotal)
	}
	if r.RataRataSelisihPersen != 33.33 {
		t.Errorf("rata-rata persen = %v, mau 33.33 ((50+25+25)/3)", r.RataRataSelisihPersen)
	}
	if r.SelisihPersenTertinggi.Tanggal != "2026-05-01" || r.SelisihPersenTertinggi.SelisihPersen != 50 {
		t.Errorf("ekstrem tertinggi salah: %+v", r.SelisihPersenTertinggi)
	}
	if r.SelisihPersenTerendah.Tanggal != "2026-05-02" || r.SelisihPersenTerendah.SelisihPersen != 25 {
		t.Errorf("ekstrem terendah salah: %+v", r.SelisihPersenTerendah)
	}
	if r.SelisihAbsolutTerbesar.Tanggal != "2026-05-01" || r.SelisihAbsolutTerbesar.SelisihL != 1000 {
		t.Errorf("ekstrem absolut salah: %+v", r.SelisihAbsolutTerbesar)
	}
	if kosong := ringkasanNeraca(nil); kosong.JumlahHari != 0 {
		t.Errorf("ringkasan kosong harus nol hari: %+v", kosong)
	}
}

// TestNeracaSeedIdentitas membuktikan agregat seed neraca-harian.json
// termuat dan konsisten secara internal untuk seluruh 184 hari produksi
// Mei s.d. Okt 2026: output total adalah jumlah komponennya, selisih
// adalah masuk dikurangi output total (identitas aliran pada metode yang
// tertulis di seed), persen selisih cocok, dan jangkar stok terukur
// hanya ada pada hari yang jendelanya berakhir pada snapshot.
func TestNeracaSeedIdentitas(t *testing.T) {
	s := &Server{Mode: "demo"}
	_ = s.Handler() // memuat semua seed, termasuk neraca-harian.json

	n, err := s.neracaHarian()
	if err != nil {
		t.Fatalf("neracaHarian: %v", err)
	}
	if len(n.Hari) != 184 {
		t.Fatalf("harus 184 hari produksi, dapat %d", len(n.Hari))
	}
	if n.Hari[0].Tanggal != "2026-05-01" || n.Hari[183].Tanggal != "2026-10-31" {
		t.Fatalf("rentang hari salah: %s s.d. %s", n.Hari[0].Tanggal, n.Hari[183].Tanggal)
	}
	if n.StokSnapshot.TotalL != 210000 || n.StokSnapshot.JumlahTangki != 28 ||
		n.StokSnapshot.Waktu != "2026-11-01T06:00:00+07:00" {
		t.Errorf("jangkar snapshot salah: %+v", n.StokSnapshot)
	}

	var totMasuk, totOutput float64
	for _, h := range n.Hari {
		komponen := h.OutputBagusL + h.RejectL + h.SamplingL
		if math.Abs(komponen-h.OutputTotalL) > 0.2 {
			t.Errorf("%s: output total %.1f bukan jumlah komponen %.1f", h.Tanggal, h.OutputTotalL, komponen)
		}
		if math.Abs(h.MasukL-h.OutputTotalL-h.SelisihL) > 0.2 {
			t.Errorf("%s: identitas selisih aliran rusak: masuk %.1f, output %.1f, selisih %.1f",
				h.Tanggal, h.MasukL, h.OutputTotalL, h.SelisihL)
		}
		if h.MasukL > 0 {
			persen := h.SelisihL / h.MasukL * 100
			if math.Abs(persen-h.SelisihPersen) > 0.05 {
				t.Errorf("%s: selisih persen %.2f tidak cocok hitungan %.2f", h.Tanggal, h.SelisihPersen, persen)
			}
		}
		if h.Tanggal == "2026-10-31" {
			if h.StokAkhirL == nil || *h.StokAkhirL != 210000 {
				t.Errorf("31 Okt harus punya stok akhir terukur 210000: %+v", h)
			}
		} else {
			if h.StokAwalL != nil || h.StokAkhirL != nil {
				t.Errorf("%s: stok harus nil (tidak terukur) di luar jangkar: %+v", h.Tanggal, h)
			}
		}
		totMasuk += h.MasukL
		totOutput += h.OutputTotalL
	}
	// Total rentang dicocokkan dengan penjumlahan independen ETL dari
	// berkas sumber (masuk 241.226.545,6 L setelah 4 pengiriman tiba
	// sebelum jendela pertama dikeluarkan; output Filling 138.356.857,2 L).
	if totMasuk < 241_000_000 || totMasuk > 241_500_000 {
		t.Errorf("total masuk %.1f di luar rentang cocok ETL", totMasuk)
	}
	if totOutput < 138_000_000 || totOutput > 139_000_000 {
		t.Errorf("total output %.1f di luar rentang cocok ETL", totOutput)
	}
}

// TestEndpointNeracaHarian menjalankan endpoint sungguhan: tanpa peran
// demo ditolak 401, daftar hari membawa label historis dan ringkasan,
// tanggal jangkar mengembalikan stok akhir terukur, dan tanggal di luar
// cakupan dibalas 404.
func TestEndpointNeracaHarian(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	r := httptest.NewRequest("GET", "/api/v1/balance/daily", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("tanpa autentikasi harus 401, dapat %d", w.Code)
	}

	minta := func(path string) (int, []byte) {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("X-Demo-Role", "planner")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code, w.Body.Bytes()
	}

	code, body := minta("/api/v1/balance/daily")
	if code != 200 {
		t.Fatalf("daftar neraca: status %d, body %s", code, body)
	}
	var daftar ResponsNeraca
	if err := json.Unmarshal(body, &daftar); err != nil {
		t.Fatalf("daftar neraca bukan JSON sah: %v", err)
	}
	if daftar.LabelData != "historis" || len(daftar.Hari) != 184 {
		t.Fatalf("daftar salah: label %q, %d hari", daftar.LabelData, len(daftar.Hari))
	}
	if daftar.Ringkasan.JumlahHari != 184 || daftar.Ringkasan.TotalMasukL <= 0 ||
		daftar.Ringkasan.SelisihPersenTertinggi.Tanggal == "" {
		t.Errorf("ringkasan tidak lengkap: %+v", daftar.Ringkasan)
	}
	if daftar.StokSnapshot.TotalL != 210000 {
		t.Errorf("snapshot pada respons salah: %+v", daftar.StokSnapshot)
	}

	code, body = minta("/api/v1/balance/daily?date=2026-10-31")
	if code != 200 {
		t.Fatalf("satu hari: status %d, body %s", code, body)
	}
	var satu ResponsNeracaHari
	if err := json.Unmarshal(body, &satu); err != nil {
		t.Fatalf("satu hari bukan JSON sah: %v", err)
	}
	if satu.LabelData != "historis" || satu.Hari.Tanggal != "2026-10-31" ||
		satu.Hari.StokAkhirL == nil || *satu.Hari.StokAkhirL != 210000 {
		t.Errorf("hari jangkar salah: %+v", satu)
	}

	code, _ = minta("/api/v1/balance/daily?date=2027-03-01")
	if code != 404 {
		t.Fatalf("tanggal di luar cakupan harus 404, dapat %d", code)
	}
}
