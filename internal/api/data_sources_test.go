package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestDataSourcesSelaluBerstatusSimulasi(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	for attempt := 1; attempt <= 2; attempt++ {
		r := httptest.NewRequest("GET", "/api/v1/data-sources", nil)
		r.Header.Set("X-Demo-Role", "superadmin")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("percobaan %d: status=%d body=%s", attempt, w.Code, w.Body.String())
		}

		var sources []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &sources); err != nil {
			t.Fatal(err)
		}
		if len(sources) != 6 {
			t.Fatalf("percobaan %d: jumlah sumber=%d, want 6", attempt, len(sources))
		}
		for _, source := range sources {
			if source["simulation"] != true {
				t.Fatalf("percobaan %d: sumber %v tidak ditandai simulasi: %v", attempt, source["id"], source)
			}
			if source["status"] != "simulasi" {
				t.Fatalf("percobaan %d: status sumber %v=%v, want simulasi", attempt, source["id"], source["status"])
			}
		}
	}
}

func TestDataSourcesTetapSimulasiSesudahSinkronisasi(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	_ = db.Reset(ctx)

	h := (&Server{Mode: "demo", DB: db}).Handler()
	w := durableRequest(h, "POST", "/data-sources/scada/sync", "planner", `{}`)
	if w.Code != 200 {
		t.Fatalf("sinkronisasi sumber gagal: status=%d body=%s", w.Code, w.Body.String())
	}

	for attempt := 1; attempt <= 2; attempt++ {
		w = durableRequest(h, "GET", "/data-sources", "superadmin", "")
		if w.Code != 200 {
			t.Fatalf("percobaan %d: status=%d body=%s", attempt, w.Code, w.Body.String())
		}
		var sources []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &sources); err != nil {
			t.Fatal(err)
		}
		if len(sources) != 6 {
			t.Fatalf("percobaan %d: jumlah sumber=%d, want 6", attempt, len(sources))
		}
		for _, source := range sources {
			if source["simulation"] != true || source["status"] != "simulasi" {
				t.Fatalf("percobaan %d: sumber %v tidak konsisten sebagai simulasi: %v", attempt, source["id"], source)
			}
		}
	}
}
