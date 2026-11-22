package api

import (
	"encoding/json"
	"fmt"
	"sync"

	"milkgraph/seed"
)

type SeedData struct {
	Scenario map[string]any
	Ops      map[string]any
	Site     map[string]any
	Roles    map[string]any
	Limits   map[string]any
	Golden   map[string]any
	// SkenarioNov adalah skenario demo 1 Nov 2026 dari data historis
	// Greenfields (snapshot stok tangki Opening Inventory). Sejak migrasi
	// skenario aktif, dataset November adalah basis operasional Backend;
	// Scenario lama (14 Okt 2026) tetap termuat sebagai berkas kasus.
	// Bentuk bertipe dan aksesnya ada di scenario_nov.go.
	SkenarioNov map[string]any
	// NeracaHarian adalah agregat neraca volume harian Greenfields
	// (Langkah 4 pemetaan): satu record per hari produksi Mei s.d. Okt
	// 2026 hasil ETL luring dari file 01, 02, dan 03. Bentuk bertipe dan
	// endpoint-nya ada di neraca.go. Berlabel "historis".
	NeracaHarian map[string]any
	// TraceHistoris adalah genealogy historis Greenfields (Langkah 5
	// pemetaan): irisan demo 3 production group dari file 01 dan 02
	// beserta statistik cakupan. Bentuk bertipe dan endpoint-nya ada di
	// trace_historis.go. Berlabel "historis".
	TraceHistoris map[string]any
	mu            sync.RWMutex
}

// skenarioAktif adalah penanda skenario operasional yang sedang aktif.
// Keputusan Aditya 22 Nov 2026 (dokumen Rencana Migrasi Skenario Aktif
// Greenfields): dataset November 2026 berlabel historis adalah skenario
// aktif utama. Skenario lama 14 Okt 2026 tetap termuat utuh sebagai
// berkas kasus (sumber trace, graph, dan fakta chat FG-1013-07) dan
// tidak lagi menjadi basis operasional. Mengembalikan nilai ini ke
// "oktober" adalah jalur rollback migrasi: basis seed lama, tangki
// scheduler dari ops.json, dan tampilan operasional lama kembali
// berlaku tanpa perubahan data apa pun.
const skenarioAktif = "november"

// skenarioNovemberAktif melaporkan apakah dataset November adalah
// skenario operasional aktif saat ini.
func skenarioNovemberAktif() bool { return skenarioAktif == "november" }

func loadJSON(filename string) (map[string]any, error) {
	raw, err := seed.Files.ReadFile(filename)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", filename, err)
	}
	var res map[string]any
	if err := json.Unmarshal(raw, &res); err != nil {
		return nil, fmt.Errorf("unmarshal %s: %w", filename, err)
	}
	return res, nil
}

func LoadAllSeeds() (*SeedData, error) {
	scenario, err := loadJSON("scenario.json")
	if err != nil {
		return nil, err
	}
	ops, err := loadJSON("ops.json")
	if err != nil {
		return nil, err
	}
	site, err := loadJSON("site.json")
	if err != nil {
		return nil, err
	}
	roles, err := loadJSON("roles.json")
	if err != nil {
		return nil, err
	}
	limits, err := loadJSON("limits.json")
	if err != nil {
		return nil, err
	}
	golden, err := loadJSON("golden-rules.json")
	if err != nil {
		return nil, err
	}
	skenarioNov, err := loadJSON("scenario-2026-11-01.json")
	if err != nil {
		return nil, err
	}
	neracaHarian, err := loadJSON("neraca-harian.json")
	if err != nil {
		return nil, err
	}
	traceHistoris, err := loadJSON("trace-historis.json")
	if err != nil {
		return nil, err
	}

	return &SeedData{
		Scenario:      scenario,
		Ops:           ops,
		Site:          site,
		Roles:         roles,
		Limits:        limits,
		Golden:        golden,
		SkenarioNov:   skenarioNov,
		NeracaHarian:  neracaHarian,
		TraceHistoris: traceHistoris,
	}, nil
}
