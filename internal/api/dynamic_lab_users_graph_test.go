package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDynamicGraphAndUsersFallbackWithoutDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()

	// /api/v1/users returns the 7 default accounts when DB is nil.
	r := httptest.NewRequest("GET", "/api/v1/users", nil)
	r.Header.Set("X-Demo-Role", "superadmin")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("GET /users status=%d body=%s", w.Code, w.Body.String())
	}
	var users []UserRecord
	if err := json.Unmarshal(w.Body.Bytes(), &users); err != nil {
		t.Fatal(err)
	}
	if len(users) != 7 {
		t.Fatalf("expected 7 default users, got %d", len(users))
	}

	// /api/v1/graph returns valid graph payload.
	r2 := httptest.NewRequest("GET", "/api/v1/graph", nil)
	r2.Header.Set("X-Demo-Role", "planner")
	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, r2)
	if w2.Code != 200 {
		t.Fatalf("GET /graph status=%d body=%s", w2.Code, w2.Body.String())
	}
	var g map[string]any
	if err := json.Unmarshal(w2.Body.Bytes(), &g); err != nil {
		t.Fatal(err)
	}
	if len(arr(g["nodes"])) == 0 || len(arr(g["edges"])) == 0 {
		t.Fatalf("expected non-empty graph nodes and edges")
	}

	// POST /api/v1/lab/results requires DB (503 in no-DB mode) and enforces auth.
	r3 := httptest.NewRequest("POST", "/api/v1/lab/results", strings.NewReader(`{"kind":"penerimaan","subject":"RT-99","params":[{"name":"pH","value":"6.7","limit":"6.6-6.8","ok":true}]}`))
	r3.Header.Set("Content-Type", "application/json")
	r3.Header.Set("X-Demo-Role", "operator")
	w3 := httptest.NewRecorder()
	h.ServeHTTP(w3, r3)
	if w3.Code != 403 {
		t.Fatalf("expected 403 for operator on POST /lab/results, got %d", w3.Code)
	}
}

func TestComputeLabStatus(t *testing.T) {
	okTrue := true
	okFalse := false
	if got := computeLabStatus([]LabParamInput{{Name: "pH", OK: &okTrue}}, ""); got != "hasil-siap" {
		t.Fatalf("expected hasil-siap, got %s", got)
	}
	if got := computeLabStatus([]LabParamInput{{Name: "pH", OK: &okTrue}, {Name: "Fat", OK: nil}}, ""); got != "dalam-uji" {
		t.Fatalf("expected dalam-uji, got %s", got)
	}
	if got := computeLabStatus([]LabParamInput{{Name: "pH", OK: &okFalse}}, ""); got != "positif" {
		t.Fatalf("expected positif, got %s", got)
	}
	if got := computeLabStatus([]LabParamInput{{Name: "pH", OK: &okTrue}}, "uji-ulang"); got != "uji-ulang" {
		t.Fatalf("expected uji-ulang, got %s", got)
	}
}

func TestDynamicLabUsersAndGraphWithDB(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	_ = db.Reset(ctx)
	h := (&Server{Mode: "demo", DB: db}).Handler()

	// Create a new user via API.
	w := durableRequest(h, "POST", "/users", "superadmin", `{"name":"Andi Wijaya","role_id":"lab","assets":[]}`)
	if w.Code != 200 {
		t.Fatalf("POST /users failed: %d %s", w.Code, w.Body.String())
	}

	// Create a new lab sample via API.
	wLab := durableRequest(h, "POST", "/lab/results", "lab", `{"kind":"qc-fg","subject":"FG-TEST-01","detail":"Uji produk baru","params":[{"name":"Brix","value":"12.5","limit":"12-13","ok":true}]}`)
	if wLab.Code != 200 {
		t.Fatalf("POST /lab/results failed: %d %s", wLab.Code, wLab.Body.String())
	}

	// Dynamic graph should reflect DB state.
	wGraph := durableRequest(h, "GET", "/graph", "planner", "")
	if wGraph.Code != 200 {
		t.Fatalf("GET /graph failed: %d %s", wGraph.Code, wGraph.Body.String())
	}
	m := decodeMap(t, wGraph)
	if len(arr(m["nodes"])) == 0 {
		t.Fatalf("expected dynamic graph nodes from DB")
	}
}
