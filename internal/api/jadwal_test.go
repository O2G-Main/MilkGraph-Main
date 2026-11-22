package api

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

// Parameter uji scheduler: dua mesin sama-sama mampu menjalankan dua SKU
// cokelat uji. Mesin uji sengaja tanpa speed resmi (SpeedPackPerHour 0)
// supaya rate yang bekerja adalah cadangan per ukuran (250 ml 4000 L/jam,
// 1000 ml 6000 L/jam, nilai contoh coaching); jalur rate per lini resmi
// dibuktikan tes khusus TestSchedulerRatePerLini. Transisi uji 45 menit
// dua arah lewat tabel Transisi (mekanisme yang sama dengan produksi,
// nilainya nilai uji).
func paramsUjiJadwal() (ParamsJadwal, map[string]InfoSKU) {
	info := map[string]InfoSKU{
		"SKU-250":  {SizeML: 250},
		"SKU-1000": {SizeML: 1000},
	}
	p := ParamsJadwal{
		Machines: []MesinJadwal{
			{ID: "FM-A", SKUCapable: []string{"SKU-250", "SKU-1000"}, BackupID: "FM-B", TangkiSumber: "AT-01"},
			{ID: "FM-B", SKUCapable: []string{"SKU-250", "SKU-1000"}, BackupID: "FM-A", TangkiSumber: "AT-02"},
		},
		RateLPerHour: map[int]float64{250: 4000, 1000: 6000},
		Transisi: map[string]TransisiJadwal{
			"SKU-250>SKU-1000": {DurasiMenit: 45, RuleID: "SIZE"},
			"SKU-1000>SKU-250": {DurasiMenit: 45, RuleID: "SIZE"},
		},
		ChangeoverCadanganMenit: 60,
		HoldingLimitH:           10.5,
	}
	return p, info
}

func inputUjiJadwal(pos []ProductionOrder) InputJadwal {
	p, info := paramsUjiJadwal()
	return InputJadwal{
		POs:           pos,
		Params:        p,
		SKUInfo:       info,
		WindowStart:   waktuDemo,
		Version:       1,
		TriggeredBy:   "manual",
		StokTersediaL: 1_000_000,
	}
}

func TestSchedulerChangeoverDiFMYangSama(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 12000}, {SKU: "SKU-1000", QtyLiter: 8000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	// Paksa satu mesin supaya kedua run pasti berbagi FM yang sama.
	in.Params.Machines = in.Params.Machines[:1]
	sch := bangunJadwal(in)
	if len(sch.Runs) != 2 {
		t.Fatalf("jumlah run = %d, mau 2: %+v", len(sch.Runs), sch.Runs)
	}
	r1, r2 := sch.Runs[0], sch.Runs[1]
	if r1.SKU != "SKU-250" || r2.SKU != "SKU-1000" {
		t.Fatalf("urutan run salah: %s lalu %s", r1.SKU, r2.SKU)
	}
	if r1.FMID != "FM-A" || r2.FMID != "FM-A" {
		t.Fatalf("kedua run harus di FM-A: %s, %s", r1.FMID, r2.FMID)
	}
	if r1.ChangeoverAfterMin != 45 {
		t.Errorf("changeover_after_min run pertama = %d, mau 45", r1.ChangeoverAfterMin)
	}
	end1, _ := parseWaktu(r1.End)
	start2, _ := parseWaktu(r2.Start)
	if selisih := start2.Sub(end1); selisih != 45*time.Minute {
		t.Errorf("jeda antar run = %v, mau 45 menit (changeover)", selisih)
	}
}

func TestSchedulerHanyaFMCapable(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 4000}, {SKU: "SKU-1000", QtyLiter: 6000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	in.Params.Machines[0].SKUCapable = []string{"SKU-1000"} // FM-A hanya 1000
	in.Params.Machines[1].SKUCapable = []string{"SKU-250"}  // FM-B hanya 250
	sch := bangunJadwal(in)
	if len(sch.Runs) != 2 {
		t.Fatalf("jumlah run = %d, mau 2", len(sch.Runs))
	}
	for _, r := range sch.Runs {
		if r.SKU == "SKU-250" && r.FMID != "FM-B" {
			t.Errorf("SKU-250 harus di FM-B, dapat %s", r.FMID)
		}
		if r.SKU == "SKU-1000" && r.FMID != "FM-A" {
			t.Errorf("SKU-1000 harus di FM-A, dapat %s", r.FMID)
		}
	}
}

func TestSchedulerDowntimeFailoverKeBackup(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 12000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	in.Downtime = []JendelaDowntime{{
		ResourceID: "FM-A",
		Start:      waktuDemo,
		End:        waktuDemo.Add(3 * time.Hour),
	}}
	sch := bangunJadwal(in)
	if len(sch.Runs) != 1 {
		t.Fatalf("jumlah run = %d, mau 1", len(sch.Runs))
	}
	if sch.Runs[0].FMID != "FM-B" {
		t.Errorf("run harus failover ke backup FM-B selama FM-A downtime, dapat %s", sch.Runs[0].FMID)
	}
	if sch.Runs[0].Start != formatWaktu(waktuDemo) {
		t.Errorf("run di backup harus mulai di awal jendela, dapat %s", sch.Runs[0].Start)
	}
}

func TestSchedulerDowntimeMenggeserRun(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 12000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	in.Params.Machines[1].SKUCapable = []string{"SKU-1000"} // FM-B tidak mampu 250
	in.Downtime = []JendelaDowntime{{
		ResourceID: "FM-A",
		Start:      waktuDemo,
		End:        waktuDemo.Add(3 * time.Hour),
	}}
	sch := bangunJadwal(in)
	if len(sch.Runs) != 1 {
		t.Fatalf("jumlah run = %d, mau 1", len(sch.Runs))
	}
	mauMulai := formatWaktu(waktuDemo.Add(3 * time.Hour))
	if sch.Runs[0].Start != mauMulai {
		t.Errorf("run harus tergeser ke akhir downtime %s, dapat %s", mauMulai, sch.Runs[0].Start)
	}
	if len(sch.Fulfilment) != 1 || sch.Fulfilment[0].Status != "AT_RISK" {
		t.Fatalf("fulfilment harus AT_RISK karena tergeser downtime: %+v", sch.Fulfilment)
	}
	if len(sch.Fulfilment[0].RootCauses) != 1 || sch.Fulfilment[0].RootCauses[0] != "DOWNTIME" {
		t.Errorf("root_causes harus [DOWNTIME]: %v", sch.Fulfilment[0].RootCauses)
	}
}

func TestSchedulerIDVersi(t *testing.T) {
	in := inputUjiJadwal(nil)
	sch := bangunJadwal(in)
	mauID := "SCH-" + waktuDemo.Format("20060102") + "-v1"
	if sch.ScheduleID != mauID {
		t.Errorf("schedule_id = %q, mau %s", sch.ScheduleID, mauID)
	}
	in.Version = 2
	sch = bangunJadwal(in)
	if sch.ScheduleID != "SCH-"+waktuDemo.Format("20060102")+"-v2" || sch.Version != 2 {
		t.Errorf("versi 2 salah: %q v%d", sch.ScheduleID, sch.Version)
	}
	if sch.Window.End != formatWaktu(waktuDemo.Add(jendelaJadwal)) {
		t.Errorf("akhir jendela harus start+8 hari: %s", sch.Window.End)
	}
}

func TestSchedulerFulfilmentLate(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 12000}}, // 3 jam, selesai 09.00
		DueDatetime: "2026-11-01T07:00:00+07:00",                 // due 1 jam setelah jendela mulai
	}})
	sch := bangunJadwal(in)
	if len(sch.Fulfilment) != 1 {
		t.Fatalf("fulfilment = %d, mau 1", len(sch.Fulfilment))
	}
	f := sch.Fulfilment[0]
	if f.Status != "LATE" {
		t.Errorf("status = %q, mau LATE (selesai %s melewati due)", f.Status, f.PlannedCompletion)
	}
	if f.FulfilledPct != 1 {
		t.Errorf("fulfilled_pct = %v, mau 1 (terjadwal penuh tapi telat)", f.FulfilledPct)
	}
}

func TestSchedulerFulfilledDanOnTrack(t *testing.T) {
	// Due di dalam jendela dan selesai tepat waktu: FULFILLED.
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 4000}},
		DueDatetime: "2026-11-02T08:00:00+07:00",
	}})
	sch := bangunJadwal(in)
	if sch.Fulfilment[0].Status != "FULFILLED" {
		t.Errorf("status = %q, mau FULFILLED: %+v", sch.Fulfilment[0].Status, sch.Fulfilment[0])
	}
	// Due di luar jendela 8 hari: ON_TRACK.
	in = inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 4000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	sch = bangunJadwal(in)
	if sch.Fulfilment[0].Status != "ON_TRACK" {
		t.Errorf("status = %q, mau ON_TRACK: %+v", sch.Fulfilment[0].Status, sch.Fulfilment[0])
	}
}

func TestSchedulerPeringatanHoldingDanStok(t *testing.T) {
	in := inputUjiJadwal([]ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 12000}, {SKU: "SKU-1000", QtyLiter: 8000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}})
	in.StokTersediaL = 5000 // kebutuhan 20000, stok 5000
	siap := waktuDemo.Add(-20 * time.Hour)
	in.SusuSiapPada = &siap
	sch := bangunJadwal(in)
	var stok, holding *WarningJadwal
	for i, w := range sch.Warnings {
		switch w.Type {
		case "TANK_STOCK_SHORT":
			stok = &sch.Warnings[i]
		case "HOLDING_TIME":
			holding = &sch.Warnings[i]
		}
	}
	if stok == nil {
		t.Fatalf("peringatan TANK_STOCK_SHORT tidak muncul: %+v", sch.Warnings)
	}
	if *stok.NeededL != 20000 || *stok.AvailableL != 5000 {
		t.Errorf("stok: needed %v available %v, mau 20000/5000", *stok.NeededL, *stok.AvailableL)
	}
	if holding == nil {
		t.Fatalf("peringatan HOLDING_TIME tidak muncul: %+v", sch.Warnings)
	}
	if *holding.LimitH != 10.5 || *holding.ProjectedH != 20 {
		t.Errorf("holding: limit %v projected %v, mau 10.5/20", *holding.LimitH, *holding.ProjectedH)
	}
}

func TestParamsJadwalDariMasterNyata(t *testing.T) {
	seeds, err := LoadAllSeeds()
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{seeds: seeds}
	params, info, err := s.paramsJadwal(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	mesin := map[string]MesinJadwal{}
	for _, m := range params.Machines {
		mesin[m.ID] = m
	}
	if !mengandung(mesin["FL-05"].SKUCapable, "UHT-CH-1000-LOCAL") {
		t.Errorf("FL-05 harus capable UHT-CH-1000-LOCAL: %v", mesin["FL-05"].SKUCapable)
	}
	if !mengandung(mesin["FL-08"].SKUCapable, "UHT-CH-250-LOCAL") {
		t.Errorf("FL-08 harus capable UHT-CH-250-LOCAL: %v", mesin["FL-08"].SKUCapable)
	}
	if mesin["FL-05"].BackupID != "FL-06" || mesin["FL-05"].TangkiSumber != "AT-03" {
		t.Errorf("FL-05 backup/tangki salah: %+v", mesin["FL-05"])
	}
	if info["UHT-CH-250-LOCAL"].SizeML != 250 || info["UHT-CH-1000-LOCAL"].SizeML != 1000 {
		t.Errorf("info SKU salah: %v / %v", info["UHT-CH-250-LOCAL"], info["UHT-CH-1000-LOCAL"])
	}
	// Speed resmi per lini dari line_dedication (bukan lagi "X").
	if mesin["FL-08"].SpeedPackPerHour != 30000 || mesin["FL-05"].SpeedPackPerHour != 14000 || mesin["FL-02"].SpeedPackPerHour != 10000 {
		t.Errorf("speed per lini salah: FL-08=%d FL-05=%d FL-02=%d",
			mesin["FL-08"].SpeedPackPerHour, mesin["FL-05"].SpeedPackPerHour, mesin["FL-02"].SpeedPackPerHour)
	}
	// Changeover kini dari aturan kelas resmi, bukan matriks nama-pasangan
	// limits.json: Cokelat ke Stroberi adalah VARIANT 45 menit + wajib CIP
	// (di matriks lama pasangan ini 25 menit).
	tr := params.Transisi["UHT-CH-200-LOCAL>UHT-ST-200-LOCAL"]
	if tr.DurasiMenit != 45 || tr.RuleID != "VARIANT" || !tr.PerluCIP || tr.CIPRuleID != "CIP_CH_ST" {
		t.Errorf("transisi Cokelat ke Stroberi harus VARIANT 45 + CIP CIP_CH_ST: %+v", tr)
	}
	if tr = params.Transisi["UHT-CH-1000-LOCAL>UHT-CH-950-LOCAL"]; tr.DurasiMenit != 60 || tr.RuleID != "SIZE" || tr.PerluCIP {
		t.Errorf("transisi beda ukuran harus SIZE 60 tanpa CIP: %+v", tr)
	}
	if params.ChangeoverCadanganMenit != 60 {
		t.Errorf("durasi cadangan harus kelas terbesar resmi 60: %d", params.ChangeoverCadanganMenit)
	}
	// Batas holding: global tetap 10,5 jam (630 menit) sebagai bawaan,
	// tangki aseptik tercakup data memakai batas asetnya (8 jam).
	if params.HoldingLimitH != 10.5 {
		t.Errorf("batas holding global harus tetap 10.5 jam: %v", params.HoldingLimitH)
	}
	if params.HoldingPerTangki["AT-03"] != 8 {
		t.Errorf("batas holding AT-03 dari asset_configuration harus 8 jam: %v", params.HoldingPerTangki["AT-03"])
	}
	for _, tk := range params.Tanks {
		if tk.MaxHoldingHours != 8 {
			t.Errorf("tangki %s tercakup data harus memakai batas per tangki 8 jam, dapat %v", tk.ID, tk.MaxHoldingHours)
		}
	}
	// Tangki scheduler kini tangki aseptik snapshot November: lima
	// tangki AT-01 s.d. AT-05, semuanya kosong pada snapshot 06.00.
	// Stok scheduler karena itu datang dari kedatangan dalam jendela;
	// di sini dicerminkan sebagai StokTersediaL sebesar kebutuhan PO.
	if len(params.Tanks) != 5 {
		t.Fatalf("tangki scheduler harus 5 tangki November: %+v", params.Tanks)
	}
	for _, tk := range params.Tanks {
		if tk.LevelL != 0 {
			t.Errorf("tangki %s harus kosong pada snapshot 06.00, dapat %v", tk.ID, tk.LevelL)
		}
	}
	stok := 20000.0
	sch := bangunJadwal(InputJadwal{
		POs: s.seedPOs(), Params: params, SKUInfo: info,
		WindowStart: waktuDemo, Version: 1, TriggeredBy: "manual", StokTersediaL: stok,
	})
	if len(sch.Runs) != 2 {
		t.Fatalf("jadwal PO seed harus 2 run: %+v", sch.Runs)
	}
	for _, r := range sch.Runs {
		if r.SKU == "UHT-CH-250-LOCAL" && !mengandung([]string{"FL-08", "FL-09", "FL-10"}, r.FMID) {
			t.Errorf("run 250 ml harus di line small pack, dapat %s", r.FMID)
		}
		if r.SKU == "UHT-CH-1000-LOCAL" && !mengandung([]string{"FL-05", "FL-06"}, r.FMID) {
			t.Errorf("run 1000 ml harus di line large pack, dapat %s", r.FMID)
		}
	}
	if len(sch.Fulfilment) != 1 || sch.Fulfilment[0].Status != "ON_TRACK" || sch.Fulfilment[0].FulfilledPct != 1 {
		t.Errorf("fulfilment PO seed harus ON_TRACK 100%%: %+v", sch.Fulfilment)
	}
	if len(sch.Warnings) != 0 {
		t.Errorf("jadwal seed tidak boleh memuat peringatan: %+v", sch.Warnings)
	}
}

// Rate per lini: PO yang sama berjalan lebih cepat di lini yang speed
// resminya lebih besar, dengan durasi persis rumus speed * ukuran / 1000.
// Lini tanpa speed jatuh ke rate cadangan per ukuran.
func TestSchedulerRatePerLini(t *testing.T) {
	po := []ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 5000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}}
	durasiRun := func(t *testing.T, in InputJadwal) (string, time.Duration) {
		t.Helper()
		sch := bangunJadwal(in)
		if len(sch.Runs) != 1 {
			t.Fatalf("jumlah run = %d, mau 1", len(sch.Runs))
		}
		mulai, _ := parseWaktu(sch.Runs[0].Start)
		selesai, _ := parseWaktu(sch.Runs[0].End)
		return sch.Runs[0].FMID, selesai.Sub(mulai)
	}

	// Dua lini beda speed sama-sama capable: yang tercepat menang.
	// FM-LAMBAT 10000 pack/jam * 250 ml = 2500 L/jam (120 menit);
	// FM-CEPAT 20000 pack/jam * 250 ml = 5000 L/jam (60 menit).
	in := inputUjiJadwal(po)
	in.Params.Machines = []MesinJadwal{
		{ID: "FM-LAMBAT", SKUCapable: []string{"SKU-250"}, TangkiSumber: "AT-01", SpeedPackPerHour: 10000},
		{ID: "FM-CEPAT", SKUCapable: []string{"SKU-250"}, TangkiSumber: "AT-02", SpeedPackPerHour: 20000},
	}
	if fm, dur := durasiRun(t, in); fm != "FM-CEPAT" || dur != 60*time.Minute {
		t.Errorf("kedua lini: dapat %s %v, mau FM-CEPAT 1j0m0s", fm, dur)
	}
	// Hanya lini lambat: durasi mengikuti speed lini itu, bukan rate ukuran.
	in.Params.Machines = in.Params.Machines[:1]
	if fm, dur := durasiRun(t, in); fm != "FM-LAMBAT" || dur != 120*time.Minute {
		t.Errorf("lini lambat saja: dapat %s %v, mau FM-LAMBAT 2j0m0s", fm, dur)
	}
	// Lini tanpa speed resmi: jatuh ke cadangan 4000 L/jam (75 menit).
	in.Params.Machines[0].SpeedPackPerHour = 0
	if _, dur := durasiRun(t, in); dur != 75*time.Minute {
		t.Errorf("tanpa speed harus memakai rate cadangan: dapat %v, mau 1j15m0s", dur)
	}
}

// Changeover kelas resmi dari parameter nyata: Cokelat ke Stroberi di satu
// lini adalah VARIANT 45 menit dan wajib CIP (matriks nama-pasangan lama
// memberi 25 menit untuk pasangan ini), dan konteksnya tercatat di run.
func TestSchedulerChangeoverKelasResmi(t *testing.T) {
	seeds, err := LoadAllSeeds()
	if err != nil {
		t.Fatal(err)
	}
	s := &Server{seeds: seeds}
	params, info, err := s.paramsJadwal(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	// Paksa satu lini small pack supaya kedua run berbagi lini yang sama.
	satu := params
	satu.Machines = nil
	for _, m := range params.Machines {
		if m.ID == "FL-08" {
			satu.Machines = append(satu.Machines, m)
		}
	}
	sch := bangunJadwal(InputJadwal{
		POs: []ProductionOrder{{
			POID: "PO-1", Priority: 1,
			Lines: []POLine{
				{SKU: "UHT-CH-200-LOCAL", QtyLiter: 6000},
				{SKU: "UHT-ST-200-LOCAL", QtyLiter: 6000},
			},
			DueDatetime: "2026-11-24T08:00:00+07:00",
		}},
		Params: satu, SKUInfo: info,
		WindowStart: waktuDemo, Version: 1, TriggeredBy: "manual", StokTersediaL: 1_000_000,
	})
	if len(sch.Runs) != 2 {
		t.Fatalf("jumlah run = %d, mau 2: %+v", len(sch.Runs), sch.Runs)
	}
	r1, r2 := sch.Runs[0], sch.Runs[1]
	if r1.FMID != "FL-08" || r2.FMID != "FL-08" {
		t.Fatalf("kedua run harus di FL-08: %s, %s", r1.FMID, r2.FMID)
	}
	if r1.ChangeoverAfterMin != 45 || r1.ChangeoverRuleID != "VARIANT" {
		t.Errorf("changeover Cokelat ke Stroberi = %d (%s), mau 45 VARIANT (matriks lama 25)", r1.ChangeoverAfterMin, r1.ChangeoverRuleID)
	}
	if !r1.CIPRequired || r1.CIPRuleID != "CIP_CH_ST" {
		t.Errorf("konteks CIP run pertama salah: required=%v rule=%q, mau true CIP_CH_ST", r1.CIPRequired, r1.CIPRuleID)
	}
	end1, _ := parseWaktu(r1.End)
	start2, _ := parseWaktu(r2.Start)
	if selisih := start2.Sub(end1); selisih != 45*time.Minute {
		t.Errorf("jeda antar run = %v, mau 45 menit (VARIANT)", selisih)
	}

	// Kelas SIZE: rasa sama beda ukuran di FL-05 = 60 menit, tanpa CIP.
	satu.Machines = nil
	for _, m := range params.Machines {
		if m.ID == "FL-05" {
			satu.Machines = append(satu.Machines, m)
		}
	}
	sch = bangunJadwal(InputJadwal{
		POs: []ProductionOrder{{
			POID: "PO-2", Priority: 1,
			Lines: []POLine{
				{SKU: "UHT-CH-1000-LOCAL", QtyLiter: 14000},
				{SKU: "UHT-CH-950-LOCAL", QtyLiter: 13300},
			},
			DueDatetime: "2026-11-24T08:00:00+07:00",
		}},
		Params: satu, SKUInfo: info,
		WindowStart: waktuDemo, Version: 1, TriggeredBy: "manual", StokTersediaL: 1_000_000,
	})
	if len(sch.Runs) != 2 {
		t.Fatalf("jumlah run SIZE = %d, mau 2: %+v", len(sch.Runs), sch.Runs)
	}
	r1 = sch.Runs[0]
	if r1.ChangeoverAfterMin != 60 || r1.ChangeoverRuleID != "SIZE" || r1.CIPRequired {
		t.Errorf("changeover beda ukuran = %d (%s) cip=%v, mau 60 SIZE tanpa CIP", r1.ChangeoverAfterMin, r1.ChangeoverRuleID, r1.CIPRequired)
	}
}

// Batas holding per tangki menang atas bawaan global: proyeksi 9 jam
// melewati batas tangki tercakup (8 jam) tetapi belum melewati global
// (10,5 jam); tangki di luar cakupan tetap dinilai dengan global.
func TestSchedulerHoldingPerTangki(t *testing.T) {
	po := []ProductionOrder{{
		POID: "PO-1", Priority: 1,
		Lines:       []POLine{{SKU: "SKU-250", QtyLiter: 4000}},
		DueDatetime: "2026-11-24T08:00:00+07:00",
	}}
	siap := waktuDemo.Add(-9 * time.Hour)

	in := inputUjiJadwal(po)
	in.Params.Machines = in.Params.Machines[:1] // FM-A, tangki AT-01
	in.Params.HoldingPerTangki = map[string]float64{"AT-01": 8}
	in.SusuSiapPada = &siap
	sch := bangunJadwal(in)
	var holding *WarningJadwal
	for i, w := range sch.Warnings {
		if w.Type == "HOLDING_TIME" {
			holding = &sch.Warnings[i]
		}
	}
	if holding == nil {
		t.Fatalf("proyeksi 9 jam harus memicu HOLDING_TIME terhadap batas tangki 8 jam: %+v", sch.Warnings)
	}
	if *holding.LimitH != 8 || *holding.ProjectedH != 9 {
		t.Errorf("holding: limit %v projected %v, mau 8/9 (per tangki, bukan global 10.5)", *holding.LimitH, *holding.ProjectedH)
	}

	// Tangki yang sama tanpa cakupan data: global 10,5 jam berlaku, 9 jam
	// belum melewati, jadi tidak ada peringatan.
	in.Params.HoldingPerTangki = nil
	sch = bangunJadwal(in)
	for _, w := range sch.Warnings {
		if w.Type == "HOLDING_TIME" {
			t.Errorf("tanpa cakupan per tangki, proyeksi 9 jam tidak boleh memicu peringatan (global 10.5): %+v", w)
		}
	}
}

func TestJadwalButuhDB(t *testing.T) {
	h := (&Server{Mode: "demo"}).Handler()
	w := durableRequest(h, "POST", "/pos", "planner", `{"lines":[{"sku":"UHT-CH-250-LOCAL","qty_liter":1000}],"due_datetime":"2026-10-15T08:00:00+07:00"}`)
	if w.Code != 503 {
		t.Fatalf("POST /pos tanpa DB harus 503, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/schedules/generate", "planner", `{}`)
	if w.Code != 503 {
		t.Fatalf("POST /schedules/generate tanpa DB harus 503, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/schedules/triggers", "planner", `{"reason_code":"PO_CHANGED"}`)
	if w.Code != 503 {
		t.Fatalf("POST /schedules/triggers tanpa DB harus 503, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "GET", "/schedules/latest", "planner", "")
	if w.Code != 404 {
		t.Fatalf("GET /schedules/latest tanpa jadwal harus 404, dapat %d: %s", w.Code, w.Body.String())
	}
	// GET /pos tanpa DB melayani basis skenario aktif: kosong pada
	// skenario November sebelum impor (keputusan D5).
	w = durableRequest(h, "GET", "/pos", "planner", "")
	if w.Code != 200 {
		t.Fatalf("GET /pos tanpa DB harus 200, dapat %d: %s", w.Code, w.Body.String())
	}
	var pos []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil || len(pos) != 0 {
		t.Fatalf("GET /pos awal harus kosong pada skenario November: %s", w.Body.String())
	}
}

func TestJadwalDenganDB(t *testing.T) {
	db := testDB(t)
	if err := db.Reset(t.Context()); err != nil {
		t.Fatal(err)
	}
	h := (&Server{Mode: "demo", DB: db}).Handler()

	// Basis PO skenario November kosong sebelum ada yang dibuat.
	w := durableRequest(h, "GET", "/pos", "planner", "")
	var pos []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil || len(pos) != 0 {
		t.Fatalf("GET /pos awal harus kosong: %s", w.Body.String())
	}

	// Buat PO baru; SKU tak dikenal ditolak.
	w = durableRequest(h, "POST", "/pos", "planner", `{"po_id":"PO-UJI-1","priority":2,"lines":[{"sku":"UHT-CH-250-LOCAL","qty_liter":4000}],"due_datetime":"2026-11-15T08:00:00+07:00"}`)
	if w.Code != 200 {
		t.Fatalf("POST /pos = %d: %s", w.Code, w.Body.String())
	}
	if got := obj(decodeMap(t, w)["result"]); got["po_id"] != "PO-UJI-1" {
		t.Errorf("PO baru tidak sesuai: %v", got)
	}
	w = durableRequest(h, "POST", "/pos", "planner", `{"lines":[{"sku":"SKU-NGIBUL","qty_liter":100}],"due_datetime":"2026-11-15T08:00:00+07:00"}`)
	if w.Code != 422 {
		t.Fatalf("POST /pos SKU asing harus 422, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "POST", "/pos", "planner", `{"po_id":"PO-UJI-1","lines":[{"sku":"UHT-CH-250-LOCAL","qty_liter":100}],"due_datetime":"2026-11-15T08:00:00+07:00"}`)
	if w.Code != 422 {
		t.Fatalf("POST /pos po_id duplikat harus 422, dapat %d: %s", w.Code, w.Body.String())
	}
	w = durableRequest(h, "GET", "/pos", "planner", "")
	pos = nil
	if err := json.Unmarshal(w.Body.Bytes(), &pos); err != nil || len(pos) != 1 {
		t.Fatalf("GET /pos akhir harus 1 PO: %s", w.Body.String())
	}

	// Generate versi 1.
	w = durableRequest(h, "POST", "/schedules/generate", "planner", `{"triggered_by":"manual"}`)
	if w.Code != 200 {
		t.Fatalf("POST /schedules/generate = %d: %s", w.Code, w.Body.String())
	}
	sch := obj(decodeMap(t, w)["result"])
	if sch["schedule_id"] != "SCH-20261101-v1" || sch["version"] != 1.0 {
		t.Fatalf("jadwal versi 1 tidak sesuai: %v", sch["schedule_id"])
	}
	if len(arr(sch["runs"])) < 1 {
		t.Errorf("jadwal harus memuat run untuk PO uji: %v", sch["runs"])
	}
	adaUji := false
	for _, f := range arr(sch["fulfilment"]) {
		if obj(f)["po_id"] == "PO-UJI-1" {
			adaUji = true
		}
	}
	if !adaUji {
		t.Errorf("fulfilment harus memuat PO-UJI-1: %v", sch["fulfilment"])
	}

	// Trigger downtime memicu regenerasi ke versi 2.
	w = durableRequest(h, "POST", "/schedules/triggers", "planner", `{"reason_code":"DOWNTIME","ref_id":"FL-08","detail":"FL-08 berhenti","downtime":{"resource_id":"FL-08","start":"2026-11-01T06:00:00+07:00","end":"2026-11-01T09:00:00+07:00"}}`)
	if w.Code != 200 {
		t.Fatalf("POST /schedules/triggers = %d: %s", w.Code, w.Body.String())
	}
	sch2 := obj(decodeMap(t, w)["result"])
	if sch2["version"] != 2.0 || sch2["triggered_by"] != "DOWNTIME" {
		t.Errorf("jadwal hasil trigger harus versi 2 oleh DOWNTIME: %v", sch2)
	}
	w = durableRequest(h, "GET", "/schedules/latest", "planner", "")
	latest := decodeMap(t, w)
	if latest["version"] != 2.0 {
		t.Errorf("latest harus versi 2: %v", latest["version"])
	}
	w = durableRequest(h, "GET", "/schedules", "planner", "")
	var riwayat []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &riwayat); err != nil || len(riwayat) != 2 {
		t.Fatalf("riwayat jadwal harus 2 versi: %s", w.Body.String())
	}
}
