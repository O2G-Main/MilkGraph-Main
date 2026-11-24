package api

import (
	"encoding/json"
	"testing"
)

// TestHrefNotifikasi: peta awalan id ke halaman FE sesuai usulan tim FE.
func TestHrefNotifikasi(t *testing.T) {
	mau := map[string]string{
		"SCH-NOV":   "/penjadwalan",
		"RT-NOV":    "/kedatangan",
		"PLAN-FIFO": "/rencana",
		"HOLD-RT26": "/receiving",
		"LAB-8812":  "/qc-produk",
		"LAIN-1":    "",
	}
	for id, href := range mau {
		if got := hrefNotifikasi(id); got != href {
			t.Errorf("hrefNotifikasi(%q) = %q, mau %q", id, got, href)
		}
	}
}

func ambilNotifikasi(t *testing.T, body []byte) []map[string]any {
	t.Helper()
	var items []map[string]any
	if err := json.Unmarshal(body, &items); err != nil {
		t.Fatalf("respons notifikasi bukan array: %v: %s", err, body)
	}
	return items
}

// TestNotifikasiFieldBaru: GET /notifications memuat href tujuan klik,
// created_at ISO dan at HH.MM dari waktu kejadian state, dan read=false
// selama akun belum menandai apa pun.
func TestNotifikasiFieldBaru(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "GET", "/notifications", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /notifications = %d: %s", w.Code, w.Body.String())
	}
	items := ambilNotifikasi(t, w.Body.Bytes())
	if len(items) != 3 {
		t.Fatalf("jumlah notifikasi = %d, mau 3: %s", len(items), w.Body.String())
	}
	mauHref := map[string]string{"SCH-NOV": "/penjadwalan", "RT-NOV": "/kedatangan", "LAB-8812": "/qc-produk"}
	for _, it := range items {
		id := str(it["id"])
		if it["href"] != mauHref[id] {
			t.Errorf("%s href = %v, mau %v", id, it["href"], mauHref[id])
		}
		if it["created_at"] != "2026-11-01T06:00:00+07:00" {
			t.Errorf("%s created_at = %v, mau jangkar 2026-11-01T06:00:00+07:00", id, it["created_at"])
		}
		if it["at"] != "06.00" {
			t.Errorf("%s at = %v, mau 06.00", id, it["at"])
		}
		if it["read"] != false {
			t.Errorf("%s read = %v, mau false", id, it["read"])
		}
	}
}

// TestNotifikasiReadButuhDB: menandai baca adalah mutasi state, jadi
// tanpa DB harus 503 seperti mutasi lain.
func TestNotifikasiReadButuhDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	for _, path := range []string{"/notifications/SCH-NOV/read", "/notifications/read-all"} {
		w := durableRequest(h, "POST", path, "planner", `{}`)
		if w.Code != 503 {
			t.Fatalf("POST %s tanpa DB = %d, mau 503: %s", path, w.Code, w.Body.String())
		}
	}
}

// TestNotifikasiReadPerAkun: status baca tersimpan per akun. Planner
// menandai satu item, akun lain tidak ikut terbaca; read-all menandai
// semua; id tak dikenal 404.
func TestNotifikasiReadPerAkun(t *testing.T) {
	db := testDB(t)
	h := (&Server{Mode: "demo", DB: db}).Handler()

	w := durableRequest(h, "POST", "/notifications/SCH-NOV/read", "planner", `{}`)
	if w.Code != 200 {
		t.Fatalf("POST read = %d: %s", w.Code, w.Body.String())
	}
	resp := decodeMap(t, w)
	items := ambilNotifikasi(t, mustJSON(t, resp["result"]))
	for _, it := range items {
		terbaca := it["read"] == true
		if str(it["id"]) == "SCH-NOV" && !terbaca {
			t.Errorf("SCH-NOV harus terbaca sesudah POST read: %v", it)
		}
		if str(it["id"]) != "SCH-NOV" && terbaca {
			t.Errorf("%s tidak boleh ikut terbaca: %v", it["id"], it)
		}
	}

	w = durableRequest(h, "GET", "/notifications", "manager", "")
	for _, it := range ambilNotifikasi(t, w.Body.Bytes()) {
		if it["read"] != false {
			t.Errorf("akun manager tidak boleh mewarisi baca planner: %v", it)
		}
	}

	w = durableRequest(h, "POST", "/notifications/read-all", "manager", `{}`)
	if w.Code != 200 {
		t.Fatalf("POST read-all = %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "GET", "/notifications", "manager", "")
	for _, it := range ambilNotifikasi(t, w.Body.Bytes()) {
		if it["read"] != true {
			t.Errorf("sesudah read-all semua harus terbaca: %v", it)
		}
	}

	w = durableRequest(h, "POST", "/notifications/TIDAK-ADA/read", "manager", `{}`)
	if w.Code != 404 {
		t.Fatalf("POST read id tak dikenal = %d, mau 404: %s", w.Code, w.Body.String())
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
