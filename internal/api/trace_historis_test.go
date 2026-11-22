package api

import (
	"encoding/json"
	"math"
	"net/http/httptest"
	"testing"
)

// TestTraceHistorisKonsistensi membuktikan genealogy irisan pada seed
// trace-historis.json konsisten secara internal untuk ketiga group:
// setiap transfer menunjuk wadah yang terdeklarasi (tangki persiapan,
// tangki aseptik, atau wadah lot), trace.Propagate berjalan tanpa
// error (tidak ada transfer yang melebihi isi wadah), volume tiap lot
// hasil Propagate sama dengan volume tercatatnya, campuran hasil
// Propagate cocok dengan campuran harapan hitung independen ETL, dan
// volume anak pada titik pemisahan tidak melebihi aliran masuk tangki
// aseptik.
func TestTraceHistorisKonsistensi(t *testing.T) {
	s := &Server{Mode: "demo"}
	_ = s.Handler() // memuat semua seed, termasuk trace-historis.json

	th, err := s.traceHistoris()
	if err != nil {
		t.Fatalf("traceHistoris: %v", err)
	}
	if len(th.Groups) != 3 {
		t.Fatalf("irisan harus 3 group, dapat %d", len(th.Groups))
	}
	st := th.Statistik
	if st.TotalGroup != 3680 || st.GroupLengkapSeimbang != 3680 || st.TepiTopologiGagal != 0 {
		t.Errorf("statistik cakupan salah: %+v", st)
	}
	if st.KedalamanTahap["3"] != 3680 {
		t.Errorf("seluruh group harus berkedalaman 3 tahap: %v", st.KedalamanTahap)
	}

	for _, g := range th.Groups {
		terdeklarasi := map[string]bool{g.ATTankID: true}
		for _, f := range g.PengisianTangki {
			terdeklarasi[f.TankID] = true
		}
		for _, l := range g.Lots {
			terdeklarasi[wadahLot(l.POID)] = true
		}
		var masukAT, keluarAT float64
		for _, tr := range g.Transfer {
			if !terdeklarasi[tr.Dari] || !terdeklarasi[tr.Ke] {
				t.Errorf("%s: transfer menunjuk wadah tak terdeklarasi: %+v", g.GroupID, tr)
			}
			if tr.Ke == g.ATTankID {
				masukAT += tr.VolumeL
			}
			if tr.Dari == g.ATTankID {
				keluarAT += tr.VolumeL
			}
		}
		if math.Abs(masukAT-g.Total.SterilisasiL) > 0.05 {
			t.Errorf("%s: aliran masuk AT %.4f != total sterilisasi %.4f", g.GroupID, masukAT, g.Total.SterilisasiL)
		}
		if math.Abs(keluarAT-g.Total.PengisianL) > 0.05 {
			t.Errorf("%s: aliran keluar AT %.4f != total pengisian %.4f", g.GroupID, keluarAT, g.Total.PengisianL)
		}

		hasil, err := g.propagate()
		if err != nil {
			t.Fatalf("%s: propagate: %v", g.GroupID, err)
		}
		for _, l := range g.Lots {
			if l.VolumeTotalL > masukAT+0.05 {
				t.Errorf("%s: volume lot %s %.2f melebihi aliran masuk AT %.2f", g.GroupID, l.POID, l.VolumeTotalL, masukAT)
			}
			vec := hasil[wadahLot(l.POID)]
			var jumlah float64
			for _, v := range vec {
				jumlah += v
			}
			if math.Abs(jumlah-l.VolumeTotalL) > 0.05 {
				t.Errorf("%s: jumlah vektor lot %s %.4f != volume tercatat %.4f", g.GroupID, l.POID, jumlah, l.VolumeTotalL)
			}
			harapan := map[string]CampuranLot{}
			for _, h := range l.CampuranHarapan {
				harapan[h.Sumber] = h
			}
			campuran := campuranDariVektor(vec, l.VolumeTotalL)
			if len(campuran) != len(harapan) {
				t.Fatalf("%s: jumlah sumber campuran lot %s %d != harapan %d", g.GroupID, l.POID, len(campuran), len(harapan))
			}
			for _, c := range campuran {
				h, ok := harapan[c.Sumber]
				if !ok {
					t.Errorf("%s: sumber campuran %s tidak ada di harapan lot %s", g.GroupID, c.Sumber, l.POID)
					continue
				}
				if math.Abs(c.VolumeL-h.VolumeL) > 0.05 || math.Abs(c.Persen-h.Persen) > 0.15 {
					t.Errorf("%s: campuran %s lot %s (%.2f L, %.2f%%) != harapan (%.2f L, %.2f%%)",
						g.GroupID, c.Sumber, l.POID, c.VolumeL, c.Persen, h.VolumeL, h.Persen)
				}
			}
		}
	}
}

// TestTraceBackwardCAM003664Tangan memeriksa rantai satu group yang
// diverifikasi tangan dari baris sumber file 02 dan file 01:
// CAM-003664 (ESL Full Cream, 31 Okt 2026) diisi tiga tangki SFP
// masing-masing 16.529,33365957447 L (PR-0029997, PR-0040550,
// PR-0066268), disterilisasi dua peristiwa (PR-0101008 5.000 L dan
// PR-0101010 44.588 L) ke AT-01, lalu diisi ke dua lot: HPO-006595
// 27.048 L di FL-01 dan HPO-006596 22.540 L di FL-02. Karena ketiga
// tangki berisi sama dan tercampur sempurna, tiap lot berproporsi
// tepat sepertiga per tangki.
func TestTraceBackwardCAM003664Tangan(t *testing.T) {
	s := &Server{Mode: "demo"}
	_ = s.Handler()

	th, err := s.traceHistoris()
	if err != nil {
		t.Fatalf("traceHistoris: %v", err)
	}
	var g *GrupTrace
	for i := range th.Groups {
		if th.Groups[i].GroupID == "CAM-003664" {
			g = &th.Groups[i]
		}
	}
	if g == nil {
		t.Fatal("CAM-003664 tidak ada di irisan")
	}
	if g.ProductName != "ESL Full Cream" || g.SterilizerID != "ST-01" || g.ATTankID != "AT-01" {
		t.Errorf("identitas group salah: %+v", g)
	}
	if len(g.PengisianTangki) != 3 {
		t.Fatalf("harus 3 tangki terisi, dapat %d", len(g.PengisianTangki))
	}
	refTangki := map[string]string{"SFP-02": "PR-0029997", "SFP-04": "PR-0040550", "SFP-09": "PR-0066268"}
	for _, f := range g.PengisianTangki {
		if math.Abs(f.VolumeL-16529.33365957447) > 0.001 {
			t.Errorf("isi %s = %.6f, mau 16529.333660 dari baris sumber", f.TankID, f.VolumeL)
		}
		if refTangki[f.TankID] != f.TransactionID || f.Waktu != "2026-10-31T18:22:00+07:00" {
			t.Errorf("pengisian %s salah ref atau waktu: %+v", f.TankID, f)
		}
	}
	if len(g.Sterilisasi) != 2 ||
		g.Sterilisasi[0].TransactionID != "PR-0101008" || math.Abs(g.Sterilisasi[0].VolumeL-5000) > 0.001 ||
		g.Sterilisasi[1].TransactionID != "PR-0101010" || math.Abs(g.Sterilisasi[1].VolumeL-44588) > 0.001 {
		t.Errorf("peristiwa sterilisasi tidak cocok baris sumber: %+v", g.Sterilisasi)
	}
	if g.ATTerisiTercatatL != 5000 {
		t.Errorf("AT tercatat harus 5000 (hanya batch pertama), dapat %.2f", g.ATTerisiTercatatL)
	}
	if len(g.Lots) != 2 {
		t.Fatalf("harus 2 lot, dapat %d", len(g.Lots))
	}
	lot1, lot2 := g.Lots[0], g.Lots[1]
	if lot1.POID != "HPO-006595" || lot1.SKUID != "ESL-FC-1000-LOCAL" || lot1.LineID != "FL-01" ||
		lot1.VolumeTotalL != 27048 || lot1.VolumeBagusL != 26869 || lot1.VolumeRejectL != 175 || lot1.VolumeSamplingL != 4 {
		t.Errorf("lot pertama tidak cocok baris sumber FM-0008096: %+v", lot1)
	}
	if lot2.POID != "HPO-006596" || lot2.SKUID != "ESL-FC-1000-EXP" || lot2.LineID != "FL-02" ||
		lot2.VolumeTotalL != 22540 || lot2.VolumeBagusL != 22441 || lot2.VolumeRejectL != 93 || lot2.VolumeSamplingL != 6 {
		t.Errorf("lot kedua tidak cocok baris sumber FM-0016160: %+v", lot2)
	}

	resp, err := bangunBackward(th, *g)
	if err != nil {
		t.Fatalf("bangunBackward: %v", err)
	}
	if resp.LabelData != "historis" || len(resp.Nodes) != 8 || len(resp.Steps) != 7 {
		t.Errorf("bentuk respons salah: label %q, %d simpul, %d langkah", resp.LabelData, len(resp.Nodes), len(resp.Steps))
	}
	if resp.Steps[0].Tahap != "pengisian" || resp.Steps[len(resp.Steps)-1].Tahap != "pengisian_tangki" {
		t.Errorf("urutan langkah harus dari lot mundur ke pengisian tangki: %+v", resp.Steps[0])
	}
	for _, lot := range resp.Lots {
		if len(lot.Campuran) != 3 {
			t.Fatalf("lot %s harus bercampuran 3 tangki: %+v", lot.POID, lot.Campuran)
		}
		for _, c := range lot.Campuran {
			if math.Abs(c.Persen-33.33) > 0.01 {
				t.Errorf("lot %s sumber %s persen %.2f, mau 33.33 (tiga tangki sama isi)", lot.POID, c.Sumber, c.Persen)
			}
			if math.Abs(c.VolumeL-lot.VolumeTotalL/3) > 0.5 {
				t.Errorf("lot %s sumber %s volume %.2f, mau sepertiga dari %.2f", lot.POID, c.Sumber, c.VolumeL, lot.VolumeTotalL)
			}
		}
	}
}

// TestEndpointTraceHistoris menjalankan endpoint sungguhan: tanpa
// peran ditolak 401, daftar irisan berlabel historis dengan 3 group,
// telusur balik satu group utuh, group yang tidak ada dibalas 404, dan
// endpoint trace skenario lama tidak berubah perilakunya.
func TestEndpointTraceHistoris(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	r := httptest.NewRequest("GET", "/api/v1/trace/history", nil)
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

	code, body := minta("/api/v1/trace/history")
	if code != 200 {
		t.Fatalf("daftar trace historis: status %d, body %s", code, body)
	}
	var daftar ResponsTraceHistoris
	if err := json.Unmarshal(body, &daftar); err != nil {
		t.Fatalf("daftar bukan JSON sah: %v", err)
	}
	if daftar.LabelData != "historis" || len(daftar.Groups) != 3 {
		t.Fatalf("daftar salah: label %q, %d group", daftar.LabelData, len(daftar.Groups))
	}
	if daftar.Statistik.GroupLengkapSeimbang != 3680 || daftar.KriteriaIrisan == "" {
		t.Errorf("statistik atau kriteria pada daftar tidak lengkap: %+v", daftar.Statistik)
	}

	code, body = minta("/api/v1/trace/history/backward?groupId=CAM-003664")
	if code != 200 {
		t.Fatalf("telusur balik: status %d, body %s", code, body)
	}
	var back ResponsTraceBackward
	if err := json.Unmarshal(body, &back); err != nil {
		t.Fatalf("telusur balik bukan JSON sah: %v", err)
	}
	if back.GroupID != "CAM-003664" || back.LabelData != "historis" || len(back.Lots) != 2 || len(back.Steps) != 7 {
		t.Errorf("telusur balik salah: %+v", back)
	}

	code, _ = minta("/api/v1/trace/history/backward?groupId=CAM-999999")
	if code != 404 {
		t.Fatalf("group tidak dikenal harus 404, dapat %d", code)
	}

	// Jalur skenario lama tidak berubah: lot FG-1013-07 tetap dijawab,
	// lot lain tetap ditolak.
	code, _ = minta("/api/v1/trace/backward?lotId=FG-1013-07")
	if code != 200 {
		t.Fatalf("trace skenario FG-1013-07 harus tetap 200, dapat %d", code)
	}
	code, _ = minta("/api/v1/trace/backward?lotId=CAM-003664")
	if code != 404 {
		t.Fatalf("trace skenario untuk lot historis harus tetap 404, dapat %d", code)
	}
}
