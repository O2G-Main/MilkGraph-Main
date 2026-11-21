package api

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// importRequest membangun request multipart berisi satu file CSV pada
// field "file", mengikuti bentuk request yang dikirim FE.
func importRequest(h http.Handler, path, role, csv string) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "import.csv")
	if err != nil {
		panic(err)
	}
	if _, err := fw.Write([]byte(csv)); err != nil {
		panic(err)
	}
	if err := mw.Close(); err != nil {
		panic(err)
	}
	r := httptest.NewRequest("POST", "/api/v1"+path, &buf)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	r.Header.Set("X-Demo-Role", role)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

const csvPOValid = "po_id,priority,due_datetime,sku_id,qty_liter\n" +
	"PO-IMP-1,2,2026-10-20T08:00:00+07:00,UHT-CH-250-LOCAL,5000\n" +
	"PO-IMP-1,2,2026-10-20T08:00:00+07:00,UHT-CH-1000-LOCAL,3000\n" +
	"PO-IMP-2,,2026-10-21T08:00:00+07:00,UHT-FC-250-LOCAL,2000\n"

func TestImportPOPreviewTanpaDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	// Pratinjau: grouping multi-line benar, tidak ada yang disimpan.
	w := importRequest(h, "/pos/import?commit=false", "planner", csvPOValid)
	if w.Code != 200 {
		t.Fatalf("preview import PO = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["commit"] != false || rep["total_baris"] != 3.0 || rep["valid"] != 3.0 || rep["gagal"] != 0.0 || rep["dibuat"] != 0.0 {
		t.Fatalf("laporan preview tidak sesuai: %v", rep)
	}
	rows := arr(rep["rows"])
	if len(rows) != 2 {
		t.Fatalf("preview harus mengelompokkan 3 baris menjadi 2 PO: %v", rep["rows"])
	}
	pertama := obj(rows[0])
	if pertama["po_id"] != "PO-IMP-1" || pertama["jumlah_baris"] != 2.0 || pertama["total_liter"] != 8000.0 || pertama["priority"] != 2.0 {
		t.Errorf("grouping PO-IMP-1 salah: %v", pertama)
	}
	if obj(rows[1])["priority"] != 1.0 {
		t.Errorf("priority kosong harus menjadi 1: %v", rows[1])
	}
	// Preview tidak menyimpan: GET /pos tetap hanya PO seed.
	w = durableRequest(h, "GET", "/pos", "planner", "")
	var pos []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil || len(pos) != 1 {
		t.Fatalf("setelah preview, GET /pos harus tetap 1 PO seed: %s", w.Body.String())
	}

	// Commit tanpa DB ditolak 503 seperti jalur tulis lain.
	w = importRequest(h, "/pos/import?commit=true", "planner", csvPOValid)
	if w.Code != 503 {
		t.Fatalf("commit import PO tanpa DB harus 503, dapat %d: %s", w.Code, w.Body.String())
	}

	// Role tanpa plan.decide ditolak.
	w = importRequest(h, "/pos/import?commit=false", "receiving", csvPOValid)
	if w.Code != 403 {
		t.Fatalf("import PO oleh receiving harus 403, dapat %d: %s", w.Code, w.Body.String())
	}
}

func TestImportPOValidasiBaris(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	csvCampur := "po_id,priority,due_datetime,sku_id,qty_liter\n" +
		"PO-2026-1101,1,2026-10-20T08:00:00+07:00,UHT-CH-250-LOCAL,1000\n" + // duplikat sistem (seed)
		"PO-IMP-9,1,2026-10-20T08:00:00+07:00,SKU-NGIBUL,1000\n" + // SKU asing
		"PO-IMP-9,1,2026-10-20T08:00:00+07:00,UHT-CH-250-LOCAL,-5\n" + // qty negatif
		"PO-IMP-9,1,2026-10-20T08:00:00+07:00,UHT-CH-250-LOCAL,1500\n" // satu-satunya valid
	w := importRequest(h, "/pos/import?commit=false", "planner", csvCampur)
	if w.Code != 200 {
		t.Fatalf("preview campuran = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["valid"] != 1.0 || rep["gagal"] != 3.0 {
		t.Fatalf("campuran harus 1 valid dan 3 gagal: %v", rep)
	}
	errs := arr(rep["errors"])
	if len(errs) != 3 || obj(errs[0])["baris"] != 2.0 || obj(errs[1])["baris"] != 3.0 || obj(errs[2])["baris"] != 4.0 {
		t.Errorf("nomor baris kesalahan salah: %v", rep["errors"])
	}
	if !strings.Contains(str(obj(errs[0])["pesan"]), "sudah ada di sistem") {
		t.Errorf("baris 2 harus gagal karena duplikat sistem: %v", errs[0])
	}
	if !strings.Contains(str(obj(errs[1])["pesan"]), "SKU tidak dikenal") {
		t.Errorf("baris 3 harus gagal karena SKU asing: %v", errs[1])
	}

	// Header salah total ditolak 422.
	w = importRequest(h, "/pos/import?commit=false", "planner", "a,b,c\n1,2,3\n")
	if w.Code != 422 {
		t.Fatalf("header salah harus 422, dapat %d: %s", w.Code, w.Body.String())
	}
	// File tanpa baris data ditolak 422.
	w = importRequest(h, "/pos/import?commit=false", "planner", "po_id,priority,due_datetime,sku_id,qty_liter\n")
	if w.Code != 422 {
		t.Fatalf("file tanpa baris data harus 422, dapat %d: %s", w.Code, w.Body.String())
	}
}

func TestImportPODenganDB(t *testing.T) {
	db := testDB(t)
	if err := db.Reset(t.Context()); err != nil {
		t.Fatal(err)
	}
	h := (&Server{Mode: "demo", DB: db}).Handler()

	csvCampur := "po_id,priority,due_datetime,sku_id,qty_liter\n" +
		"PO-IMP-1,1,2026-10-20T08:00:00+07:00,UHT-CH-250-LOCAL,5000\n" +
		"PO-IMP-1,1,2026-10-20T08:00:00+07:00,SKU-NGIBUL,5000\n" +
		"PO-IMP-2,1,2026-10-21T08:00:00+07:00,UHT-CH-1000-LOCAL,2500\n"
	w := importRequest(h, "/pos/import?commit=true", "planner", csvCampur)
	if w.Code != 200 {
		t.Fatalf("commit import PO = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["commit"] != true || rep["valid"] != 2.0 || rep["gagal"] != 1.0 || rep["dibuat"] != 2.0 {
		t.Fatalf("laporan commit tidak sesuai: %v", rep)
	}
	w = durableRequest(h, "GET", "/pos", "planner", "")
	var pos []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil || len(pos) != 3 {
		t.Fatalf("setelah commit, GET /pos harus 3 PO (seed + 2 impor): %s", w.Body.String())
	}
	for _, po := range pos {
		if po["po_id"] == "PO-IMP-1" && len(arr(po["lines"])) != 1 {
			t.Errorf("PO-IMP-1 hanya boleh berisi baris validnya saja: %v", po)
		}
	}
	// Commit ulang file yang sama: semua po_id kini duplikat sistem.
	w = importRequest(h, "/pos/import?commit=true", "planner", csvCampur)
	rep = decodeMap(t, w)
	if rep["dibuat"] != 0.0 || rep["valid"] != 0.0 {
		t.Fatalf("commit ulang harus menolak semua baris: %v", rep)
	}
}

const csvRTValid = "rt_id,farm_name,volume_l,depart_at,target_arrival,estimated_arrival,actual_arrival,status\n" +
	"RT-41,Farm Tutur,9000,05:30,07:00,07:10,,Dalam Perjalanan\n" +
	"RT-42,KUD Ngantang,11000,2026-10-14T06:00:00+07:00,2026-10-14T08:00:00+07:00,2026-10-14T07:50:00+07:00,2026-10-14T07:50:00+07:00,Sudah Tiba\n"

func TestImportRTPreviewTanpaDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := importRequest(h, "/supply/rt-arrivals/import?commit=false", "receiving", csvRTValid)
	if w.Code != 200 {
		t.Fatalf("preview import RT = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["valid"] != 2.0 || rep["gagal"] != 0.0 || rep["dibuat"] != 0.0 {
		t.Fatalf("laporan preview RT tidak sesuai: %v", rep)
	}
	rows := arr(rep["rows"])
	pertama := obj(rows[0])
	// Jam "HH:MM" diterima dan dinormalisasi ke tanggal demo; telat 10 menit.
	if pertama["depart_at"] != "2026-10-14T05:30:00+07:00" || pertama["target_arrival"] != "2026-10-14T07:00:00+07:00" || pertama["late_minutes"] != 10.0 {
		t.Errorf("baris jam saja tidak dinormalisasi dengan benar: %v", pertama)
	}
	if pertama["id"] != "ARR-RT-41" || pertama["farm_id"] != "FARM-TUTUR" {
		t.Errorf("identitas baris pertama salah: %v", pertama)
	}
	// Preview tidak menyimpan.
	w = durableRequest(h, "GET", "/supply/rt-arrivals", "planner", "")
	var arrivals []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &arrivals); err != nil || len(arrivals) != 8 {
		t.Fatalf("setelah preview, kedatangan harus tetap 8 seed: %s", w.Body.String())
	}
	// Planner tanpa rt.manage? planner punya rt.manage; qa tidak.
	w = importRequest(h, "/supply/rt-arrivals/import?commit=false", "qa", csvRTValid)
	if w.Code != 403 {
		t.Fatalf("import RT oleh qa harus 403, dapat %d: %s", w.Code, w.Body.String())
	}
}

func TestImportRTValidasiBaris(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	csvCampur := "rt_id,farm_name,volume_l,depart_at,target_arrival,estimated_arrival,actual_arrival,status\n" +
		"RT-26,Farm Tutur,9000,05:30,07:00,07:10,,\n" + // RT-26 sudah ada di seed
		"RT-43,Farm Tutur,9000,05:30,07:00,07:10,,Terbang\n" + // status tidak valid
		"RT-43,Farm Tutur,9000,05:30,07:00,07:10,,\n" // sah (yang gagal tidak dihitung duplikat)
	w := importRequest(h, "/supply/rt-arrivals/import?commit=false", "planner", csvCampur)
	if w.Code != 200 {
		t.Fatalf("preview RT campuran = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["valid"] != 1.0 || rep["gagal"] != 2.0 {
		t.Fatalf("campuran RT harus 1 valid dan 2 gagal: %v", rep)
	}
	errs := arr(rep["errors"])
	if !strings.Contains(str(obj(errs[0])["pesan"]), "sudah ada di sistem") {
		t.Errorf("baris 2 harus gagal duplikat sistem: %v", errs[0])
	}
	if !strings.Contains(str(obj(errs[1])["pesan"]), "Status kedatangan tidak valid") {
		t.Errorf("baris 3 harus gagal status: %v", errs[1])
	}
}

func TestImportRTDenganDB(t *testing.T) {
	db := testDB(t)
	if err := db.Reset(t.Context()); err != nil {
		t.Fatal(err)
	}
	h := (&Server{Mode: "demo", DB: db}).Handler()

	w := importRequest(h, "/supply/rt-arrivals/import?commit=true", "receiving", csvRTValid)
	if w.Code != 200 {
		t.Fatalf("commit import RT = %d: %s", w.Code, w.Body.String())
	}
	rep := decodeMap(t, w)
	if rep["dibuat"] != 2.0 || rep["valid"] != 2.0 {
		t.Fatalf("laporan commit RT tidak sesuai: %v", rep)
	}
	w = durableRequest(h, "GET", "/supply/rt-arrivals", "planner", "")
	var arrivals []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &arrivals); err != nil || len(arrivals) != 10 {
		t.Fatalf("setelah commit, kedatangan harus 10 (8 seed + 2 impor): %s", w.Body.String())
	}
	for _, a := range arrivals {
		if a["rt_id"] == "RT-41" && a["late_minutes"] != 10.0 {
			t.Errorf("RT-41 late_minutes harus 10: %v", a)
		}
		if a["rt_id"] == "RT-42" && a["late_minutes"] != -10.0 {
			t.Errorf("RT-42 tiba 10 menit lebih awal, late_minutes harus -10: %v", a)
		}
	}
}

func TestImportGerbangPermissionKhusus(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	// Pratinjau (commit=false) cukup untuk membuktikan gerbang: lolos
	// gerbang berarti 200, tertolak berarti 403.
	kasus := []struct {
		nama, path, role string
		want             int
	}{
		// import.csv: supervisor dan manager lolos kedua import walau
		// tidak memegang plan.decide maupun rt.manage.
		{"supervisor PO", "/pos/import?commit=false", "supervisor", 200},
		{"supervisor RT", "/supply/rt-arrivals/import?commit=false", "supervisor", 200},
		{"manager PO", "/pos/import?commit=false", "manager", 200},
		{"manager RT", "/supply/rt-arrivals/import?commit=false", "manager", 200},
		// Pemegang lama tetap lolos.
		{"superadmin PO", "/pos/import?commit=false", "superadmin", 200},
		{"superadmin RT", "/supply/rt-arrivals/import?commit=false", "superadmin", 200},
		{"planner PO", "/pos/import?commit=false", "planner", 200},
		{"planner RT", "/supply/rt-arrivals/import?commit=false", "planner", 200},
		// Receiving tetap lolos RT lewat rt.manage, tetap tertolak PO.
		{"receiving RT", "/supply/rt-arrivals/import?commit=false", "receiving", 200},
		{"receiving PO", "/pos/import?commit=false", "receiving", 403},
		// Role lain tertolak kedua import.
		{"qa PO", "/pos/import?commit=false", "qa", 403},
		{"qa RT", "/supply/rt-arrivals/import?commit=false", "qa", 403},
		{"lab PO", "/pos/import?commit=false", "lab", 403},
		{"lab RT", "/supply/rt-arrivals/import?commit=false", "lab", 403},
		{"operator PO", "/pos/import?commit=false", "operator", 403},
		{"operator RT", "/supply/rt-arrivals/import?commit=false", "operator", 403},
	}
	for _, c := range kasus {
		csv := csvPOValid
		if strings.HasPrefix(c.path, "/supply") {
			csv = csvRTValid
		}
		w := importRequest(h, c.path, c.role, csv)
		if w.Code != c.want {
			t.Errorf("%s: import %s sebagai %s = %d, mau %d: %s", c.nama, c.path, c.role, w.Code, c.want, w.Body.String())
		}
	}

	// Gerbang endpoint non-import tidak ikut berubah: import.csv tidak
	// memberi plan.decide atau rt.manage.
	w := durableRequest(h, "POST", "/pos", "supervisor", `{"lines":[{"sku":"UHT-CH-250-LOCAL","qty_liter":100}],"due_datetime":"2026-10-15T08:00:00+07:00"}`)
	if w.Code != 403 {
		t.Errorf("supervisor POST /pos biasa harus tetap 403, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/supply/rt-arrivals", "supervisor", `{"farm_name":"Farm X","rt_id":"RT-01","volume_l":1000,"depart_at":"2026-10-14T10:00:00+07:00","target_arrival":"2026-10-14T13:00:00+07:00","estimated_arrival":"2026-10-14T13:00:00+07:00"}`)
	if w.Code != 403 {
		t.Errorf("supervisor POST rt-arrival biasa harus tetap 403, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/schedules/generate", "manager", `{}`)
	if w.Code != 403 {
		t.Errorf("manager generate jadwal harus tetap 403, dapat %d: %s", w.Code, w.Body.String())
	}
}
