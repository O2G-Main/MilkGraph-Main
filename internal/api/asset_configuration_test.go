package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"milkgraph/internal/store"
)

func TestAssetConfigurationDurable(t *testing.T) {
	db := testDB(t)
	s := &Server{Mode: "demo", DB: db}
	h := s.Handler()
	read := func(id string) store.AssetConfiguration {
		t.Helper()
		w := durableRequest(h, "GET", "/production/assets/"+id+"/configuration", "superadmin", "")
		if w.Code != 200 {
			t.Fatalf("read: %d %s", w.Code, w.Body)
		}
		var c store.AssetConfiguration
		if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
			t.Fatal(err)
		}
		return c
	}
	base := read("FL-01")
	if len(base.Fields) != 1 || base.Fields[0].Key != "speed_packph" {
		t.Fatalf("filler schema: %+v", base)
	}
	patch := fmt.Sprintf(`{"version":%d,"changes":{"speed_packph":15000}}`, base.Version)
	for _, role := range []string{"operator", "receiving", "lab", "manager"} {
		w := durableRequest(h, "PATCH", "/production/assets/FL-01/configuration", role, patch)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s: %d %s", role, w.Code, w.Body)
		}
	}
	w := durableRequest(h, "PATCH", "/production/assets/FL-01/configuration", "superadmin", patch)
	if w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, w.Body)
	}
	after := read("FL-01")
	if *after.Values["speed_packph"] != 15000 || after.Version != base.Version+1 || after.UpdatedAt == nil {
		t.Fatalf("not saved: %+v", after)
	}
	// Simulate another client using an old revision. No last-write-wins overwrite.
	w = durableRequest(h, "PATCH", "/production/assets/FL-01/configuration", "superadmin", patch)
	if w.Code != 409 {
		t.Fatalf("stale revision: %d", w.Code)
	}
	bad := fmt.Sprintf(`{"version":%d,"changes":{"capacity_l":100}}`, after.Version)
	w = durableRequest(h, "PATCH", "/production/assets/FL-01/configuration", "superadmin", bad)
	if w.Code != 422 {
		t.Fatalf("wrong subtype: %d %s", w.Code, w.Body)
	}
	if read("FL-01").Version != after.Version {
		t.Fatal("invalid patch changed revision")
	}
	// Same persistent database, fresh Server: values survive a process restart.
	h = (&Server{Mode: "demo", DB: db}).Handler()
	if *read("FL-01").Values["speed_packph"] != 15000 {
		t.Fatal("lost after restart")
	}
	master := durableRequest(h, "GET", "/master/topology", "superadmin", "")
	if master.Code != 200 || !strings.Contains(master.Body.String(), `"speed_packph":"15000"`) {
		t.Fatalf("master not overlaid: %d %s", master.Code, master.Body)
	}
	lines := durableRequest(h, "GET", "/master/lines", "superadmin", "")
	if lines.Code != 200 || !strings.Contains(lines.Body.String(), `"speed_packph":"15000"`) {
		t.Fatal("line dedication speed not overlaid")
	}
	// The scheduler consumes the same private overlaid catalog, not the embedded CSV.
	catalog, err := s.configuredCatalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range catalog.Tables["line_dedication"] {
		if row["line_id"] == "FL-01" {
			found = row["speed_packph"] == "15000"
		}
	}
	if !found {
		t.Fatal("scheduler catalog stale")
	}
	tank := read("AT-01")
	if len(tank.Fields) != 3 {
		t.Fatalf("tank schema: %+v", tank.Fields)
	}
	w = durableRequest(h, "PATCH", "/production/assets/AT-01/configuration", "planner", fmt.Sprintf(`{"version":%d,"changes":{"capacity_l":null,"cip_duration_minutes":0,"holding_time_limit_hours":6.5}}`, tank.Version))
	if w.Code != 200 {
		t.Fatalf("nullable/zero/planner: %d %s", w.Code, w.Body)
	}
	updated := read("AT-01")
	if updated.Values["capacity_l"] != nil || *updated.Values["cip_duration_minutes"] != 0 || *updated.Values["holding_time_limit_hours"] != 6.5 {
		t.Fatal("null/zero not persisted")
	}
	params, _, err := s.paramsJadwal(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if params.HoldingPerTangki["AT-01"] != 6.5 {
		t.Fatalf("scheduler holding precision: %+v", params.HoldingPerTangki)
	}
	speedFound := false
	for _, machine := range params.Machines {
		if machine.ID == "FL-01" {
			speedFound = machine.SpeedPackPerHour == 15000
		}
	}
	if !speedFound {
		t.Fatal("scheduler filling speed stale")
	}

	boundary := read("FARM-SUPPLY")
	if len(boundary.Fields) != 0 {
		t.Fatalf("boundary editable: %+v", boundary)
	}
	w = durableRequest(h, "GET", "/production/assets/NOT-FOUND/configuration", "superadmin", "")
	if w.Code != 404 {
		t.Fatal("missing asset not 404")
	}
	var events, audits int
	if err = db.Pool.QueryRow(context.Background(), "SELECT count(*) FROM milkgraph.events WHERE kind='asset.configuration.updated'").Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err = db.Pool.QueryRow(context.Background(), "SELECT count(*) FROM milkgraph.audit WHERE title='Konfigurasi alat diubah'").Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if events < 2 || audits < 2 {
		t.Fatalf("not audited atomically: %d %d", events, audits)
	}
}
func TestAssetConfigurationValidation(t *testing.T) {
	f := store.ConfigurationField{Key: "capacity_l", Label: "Kapasitas", Unit: "L", Min: 0.01, Max: 1e9, Step: 0.01, Nullable: true}
	c := store.AssetConfiguration{Fields: []store.ConfigurationField{f}}
	for _, body := range []string{`{"version":0,"changes":{"capacity_l":1}}`, `{"version":1,"changes":{}}`, `{"version":1,"changes":{"capacity_l":-1}}`, `{"version":1,"changes":{"capacity_l":0}}`, `{"version":1,"changes":{"capacity_l":1.001}}`, `{"version":1,"changes":{"asset_name":1}}`} {
		var p store.AssetConfigurationPatch
		if err := json.Unmarshal([]byte(body), &p); err != nil {
			t.Fatal(err)
		}
		if store.ValidateConfigurationPatch(c, p) == nil {
			t.Fatalf("accepted invalid: %s", body)
		}
	}
}
