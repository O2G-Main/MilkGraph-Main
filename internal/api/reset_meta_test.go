package api

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"
)

// TestDemoResetDigerbangRoleManage membuktikan gerbang izin baru pada
// POST /demo/reset: role operasional tanpa role.manage tertolak 403,
// sedangkan Superadmin (satu-satunya pemegang role.manage) lolos gerbang.
// Server uji tanpa DB, jadi Superadmin yang lolos gerbang berhenti di
// kebutuhan DB (503 dari resetDemo), bukan di izin.
func TestDemoResetDigerbangRoleManage(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	for _, role := range []string{"planner", "receiving", "lab", "operator", "qa", "supervisor", "manager"} {
		w := durableRequest(h, "POST", "/demo/reset", role, `{}`)
		if w.Code != 403 {
			t.Errorf("reset sebagai %s harus 403, dapat %d: %s", role, w.Code, w.Body.String())
		}
	}
	w := durableRequest(h, "POST", "/demo/reset", "superadmin", `{}`)
	if w.Code != 503 {
		t.Errorf("reset sebagai superadmin harus lolos gerbang izin lalu 503 tanpa DB, dapat %d: %s", w.Code, w.Body.String())
	}
}

// TestMetaJujurDanDinamis membuktikan GET /meta tidak lagi mengarang:
// label data mengikuti seed yang termuat (simulasi dan historis), dan
// tanggal serta jam adalah waktu server sebenarnya dalam zona aplikasi.
func TestMetaJujurDanDinamis(t *testing.T) {
	s := &Server{Mode: "demo"}
	w := httptest.NewRecorder()
	sebelum := time.Now().In(zonaAplikasi())
	s.Handler().ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/meta", nil))
	sesudah := time.Now().In(zonaAplikasi())
	if w.Code != 200 {
		t.Fatalf("meta harus 200, dapat %d: %s", w.Code, w.Body.String())
	}
	meta := decodeMap(t, w)

	labels, _ := meta["dataLabels"].([]any)
	ada := map[string]bool{}
	for _, l := range labels {
		ada[fmt.Sprint(l)] = true
	}
	if !ada["simulasi"] || !ada["historis"] || len(labels) != 2 {
		t.Errorf("dataLabels harus [simulasi historis], dapat %v", labels)
	}
	if meta["dataMode"] != "campuran" {
		t.Errorf("dataMode harus campuran, dapat %v", meta["dataMode"])
	}

	// Jam yang sah adalah jam server pada saat permintaan diproses,
	// dalam zona aplikasi, format JJ.MM.
	jam, _ := meta["now"].(string)
	sah := map[string]bool{}
	for _, tm := range []time.Time{sebelum, sesudah} {
		sah[tm.Format("15.04")] = true
	}
	if !sah[jam] {
		t.Errorf("now harus waktu server sebenarnya, dapat %q", jam)
	}
	if meta["snapshotLabel"] != "Snapshot "+jam+" WIB" {
		t.Errorf("snapshotLabel tidak konsisten dengan now: %v", meta["snapshotLabel"])
	}

	// Tanggal mengikuti hari server sebenarnya dalam Bahasa Indonesia.
	tanggal, _ := meta["date"].(string)
	sahTanggal := map[string]bool{}
	for _, tm := range []time.Time{sebelum, sesudah} {
		sahTanggal[fmt.Sprintf("%s, %d %s %d", namaHariID[int(tm.Weekday())], tm.Day(), namaBulanID[int(tm.Month())], tm.Year())] = true
	}
	if !sahTanggal[tanggal] {
		t.Errorf("date harus tanggal server sebenarnya, dapat %q", tanggal)
	}

	horizon, _ := meta["horizon"].(map[string]any)
	if horizon["start"] != "13.00" || horizon["end"] != "20.00" {
		t.Errorf("horizon harus tetap 13.00 sampai 20.00, dapat %v", horizon)
	}
	offset, _ := horizon["nowOffset"].(float64)
	if offset < 0 || offset > 420 {
		t.Errorf("nowOffset harus dijepit dalam horizon (0..420), dapat %v", offset)
	}
}
