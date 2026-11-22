package api

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Migrasi skenario aktif Greenfields (keputusan Aditya 22 Nov 2026,
// dokumen Rencana Migrasi Skenario Aktif Greenfields): endpoint
// tampilan operasional yang dulu membaca seed skenario lama dibasiskan
// ulang ke state dataset November. Semua angka di file ini diturunkan
// dari state (kedatangan RT, PO, jadwal) atau snapshot November pada
// saat dibaca; tidak ada nilai karangan. Bila penanda skenario aktif
// dikembalikan ke oktober, fungsi-fungsi ini mengembalikan bentuk lama
// dari seed (jalur rollback).

// farmsDariState menyajikan panel farm Pasokan. Pada skenario November
// panelnya adalah agregat per farm_id dari state kedatangan (keputusan
// D4): jumlah pengiriman dan total volume apa adanya, tanpa nama farm
// karangan dan tanpa passRate, karena data partner memang hanya
// membawa farm_id. Field yang tidak punya sumber data bernilai null
// supaya FE menampilkannya sebagai tidak tersedia, bukan angka.
func (s *Server) farmsDariState(ctx context.Context) (any, error) {
	if !skenarioNovemberAktif() {
		return s.seeds.Ops["farms"], nil
	}
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return nil, e
	}
	type agg struct {
		nama     string
		rt, tiba int
		jalan    int
		vol      float64
	}
	per := map[string]*agg{}
	for _, a := range arrivals {
		g, ok := per[a.FarmID]
		if !ok {
			nama := a.FarmName
			if nama == "" {
				nama = a.FarmID
			}
			g = &agg{nama: nama}
			per[a.FarmID] = g
		}
		g.rt++
		g.vol += a.VolumeL
		switch a.Status {
		case "Sudah Tiba":
			g.tiba++
		case "Dalam Perjalanan":
			g.jalan++
		}
	}
	kunci := make([]string, 0, len(per))
	for k := range per {
		kunci = append(kunci, k)
	}
	sort.Strings(kunci)
	out := []map[string]any{}
	for _, k := range kunci {
		g := per[k]
		out = append(out, map[string]any{
			"name": g.nama, "farm_id": k,
			"plannedRt": g.rt, "plannedL": g.vol,
			"arrived": g.tiba, "onTheWay": g.jalan,
			"passRate": nil, "coolingC": nil, "finding": nil,
			"tone": "neutral",
		})
	}
	return out, nil
}

// demandPlanData menyajikan rencana kebutuhan susu. Pada skenario
// November barisnya diturunkan dari PO aktif per finished SKU
// (keputusan D4): volume produk dari total baris PO, kemasan dari
// master, dan fraksi susu segar mengikuti batasan resmi dokumen
// bootcamp partner (Full Cream 100 persen, flavour 90 persen).
// Kapasitas pabrik 320 ton per hari adalah parameter resmi partner;
// density memakai batasan resmi yang sama, 1 kg/L.
func (s *Server) demandPlanData(ctx context.Context) (map[string]any, error) {
	if !skenarioNovemberAktif() {
		return map[string]any{"lines": s.seeds.Ops["demandPlan"], "processLoss": s.seeds.Ops["PROCESS_LOSS"], "capacityTonPerDay": 320, "capacityL": 310680, "milkDensity": 1.03}, nil
	}
	pos, e := s.productionOrders(ctx)
	if e != nil {
		return nil, e
	}
	katalog, e := s.katalogMaster()
	if e != nil {
		return nil, e
	}
	cair := map[string]map[string]string{}
	for _, row := range katalog.Tables["product_catalog"] {
		cair[row["sku_id"]] = row
	}
	ukuranML := map[string]int{}
	deskripsiKemasan := map[string]string{}
	for _, row := range katalog.Tables["pack_size_codes"] {
		if n, e := strconv.Atoi(row["exact_size_ml"]); e == nil {
			ukuranML[row["pack_size_code"]] = n
		}
		deskripsiKemasan[row["pack_size_code"]] = row["description"]
	}
	finByID := map[string]map[string]string{}
	for _, row := range katalog.Tables["finished_sku_catalog"] {
		finByID[row["finished_sku_id"]] = row
	}
	total := map[string]float64{}
	for _, po := range pos {
		for _, l := range po.Lines {
			total[l.SKU] += l.QtyLiter
		}
	}
	ids := make([]string, 0, len(total))
	for id := range total {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	lines := []map[string]any{}
	for _, id := range ids {
		nama, pack := id, ""
		ml, fraksi := 0, 0.9
		if fin := finByID[id]; fin != nil {
			ml = ukuranML[fin["pack_size_code"]]
			pack = deskripsiKemasan[fin["pack_size_code"]]
			if c, ok := cair[fin["liquid_sku_id"]]; ok && c["product_name"] != "" {
				nama = c["product_name"]
				if ml > 0 {
					nama = fmt.Sprintf("%s %d ml", nama, ml)
				}
				// Varian pasar membedakan finished SKU yang berbagi
				// SKU cair dan ukuran yang sama (LOCAL vs EXP).
				if v := fin["market_variant"]; v != "" {
					nama = fmt.Sprintf("%s (%s)", nama, v)
				}
				if c["flavour"] == "Full Cream" {
					fraksi = 1.0
				}
			}
		}
		lpp := float64(ml) / 1000
		packs := 0.0
		if lpp > 0 {
			packs = math.Round(total[id] / lpp)
		}
		lines = append(lines, map[string]any{
			"sku": nama, "sku_id": id, "pack": pack,
			"packs": packs, "litresPerPack": lpp, "milk": fraksi,
		})
	}
	return map[string]any{
		"lines": lines, "processLoss": s.seeds.Ops["PROCESS_LOSS"],
		"capacityTonPerDay": 320, "capacityL": 320000, "milkDensity": 1.0,
	}, nil
}

// detailDemandKirim merangkai kalimat ringkasan untuk catatan kirim
// kebutuhan susu ke farm. Pada skenario November angkanya berasal dari
// PO dan kedatangan aktif, bukan lagi demandPlan seed lama.
func (s *Server) detailDemandKirim(ctx context.Context) (string, error) {
	if !skenarioNovemberAktif() {
		return s.demandDetail(), nil
	}
	pos, e := s.productionOrders(ctx)
	if e != nil {
		return "", e
	}
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return "", e
	}
	total, skuSet, farmSet := 0.0, map[string]bool{}, map[string]bool{}
	for _, po := range pos {
		for _, l := range po.Lines {
			total += l.QtyLiter
			skuSet[l.SKU] = true
		}
	}
	for _, a := range arrivals {
		farmSet[a.FarmID] = true
	}
	return fmt.Sprintf("%s L untuk %d SKU, %d RT dari %d farm", formatThousands(int(math.Round(total))), len(skuSet), len(arrivals), len(farmSet)), nil
}

// receivingNovember adalah receiving yang dibasiskan ulang ke state
// kedatangan RT (Bagian 4.3 rencana migrasi). Antrean plant hanya
// memuat kedatangan yang sudah dalam perjalanan atau sudah tiba;
// metrik dan tahap adalah agregat jadwal kedatangan. Panel lab
// ditiadakan (labHistory kosong dan labSummary nol) karena file
// partner memang tanpa nilai lab, bukan diisi contoh. Incident
// bernilai null: tidak ada insiden antrean pada skenario November.
func (s *Server) receivingNovember(ctx context.Context) (map[string]any, error) {
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return nil, e
	}
	perStatus := map[string]int{}
	farmSet := map[string]bool{}
	totalVol, tibaVol := 0.0, 0.0
	tankers := []any{}
	for _, a := range arrivals {
		perStatus[a.Status]++
		farmSet[a.FarmID] = true
		totalVol += a.VolumeL
		if a.Status == "Sudah Tiba" {
			tibaVol += a.VolumeL
		}
		stage := ""
		switch a.Status {
		case "Dalam Perjalanan":
			stage = "On the way"
		case "Sudah Tiba":
			stage = "Stored"
		default:
			continue
		}
		nama := a.FarmName
		if nama == "" {
			nama = a.FarmID
		}
		tankers = append(tankers, map[string]any{
			"id": a.RTID, "farm": nama, "volume": a.VolumeL, "stage": stage,
			"wait": 0, "age": "", "temperature": 0, "tone": "neutral", "source": a.FarmID,
		})
	}
	ribu := func(v float64) string { return formatThousands(int(math.Round(v))) }
	metrik := func(label, value, unit, delta string) map[string]any {
		return map[string]any{"label": label, "value": value, "unit": unit, "delta": delta, "trend": []float64{}, "source": "RT-ARRIVALS"}
	}
	metrics := []any{
		metrik("Kedatangan terjadwal", strconv.Itoa(len(arrivals)), "RT", "Jendela 1 s.d. 15 Nov 2026"),
		metrik("Volume terjadwal", ribu(totalVol/1000), "t", fmt.Sprintf("dari %d farm", len(farmSet))),
		metrik("Sudah tiba", strconv.Itoa(perStatus["Sudah Tiba"]), "RT", fmt.Sprintf("%s L diterima", ribu(tibaVol))),
		metrik("Dalam perjalanan", strconv.Itoa(perStatus["Dalam Perjalanan"]), "RT", "mengikuti status kedatangan tercatat"),
	}
	tahap := func(id, label string, count int, status string) map[string]any {
		return map[string]any{"id": id, "label": label, "count": count, "status": status, "tone": "neutral"}
	}
	stages := []any{
		tahap("farms", "Farms", len(farmSet), fmt.Sprintf("%d farm pada jadwal kedatangan", len(farmSet))),
		tahap("otw", "On the way", perStatus["Dalam Perjalanan"], "mengikuti status kedatangan tercatat"),
		tahap("sampling", "Sampling", 0, "Tidak ada data sampling pada skenario November"),
		tahap("lab", "Lab test", 0, "Tidak ada data lab pada skenario November"),
		tahap("released", "Released", 0, "Tidak ada data rilis lab pada skenario November"),
		tahap("unloading", "Unloading", 0, "Belum ada RT yang bongkar pada jangkar 06.00"),
		tahap("stored", "Stored", perStatus["Sudah Tiba"], "RT yang sudah tiba di plant"),
	}
	return map[string]any{
		"metrics": metrics, "stages": stages, "tankers": tankers,
		"assets":     clone(arr(s.seeds.Scenario["assets"])),
		"labHistory": []any{},
		"labSummary": map[string]any{"avgMinutes": 0, "deltaMinutes": 0, "waiting": 0, "sourceId": "RT-ARRIVALS"},
		"incident":   nil,
	}, nil
}

// siteStatusNovember membangun status situs dari state nyata
// (keputusan D2): tanpa tampilan before dan after. Silo adalah fraksi
// isi tangki RMT pada snapshot November; bay dan yard mengikuti
// kedatangan yang sudah tiba; panel lab menyatakan ketiadaan data lab
// pada skenario ini apa adanya.
func (s *Server) siteStatusNovember(ctx context.Context) (map[string]any, error) {
	sk, e := s.skenarioNov()
	if e != nil {
		return nil, e
	}
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return nil, e
	}
	rmt := []TangkiNov{}
	for _, t := range sk.Tanks {
		if strings.HasPrefix(t.ID, "RMT-") {
			rmt = append(rmt, t)
		}
	}
	sort.Slice(rmt, func(i, j int) bool { return rmt[i].ID < rmt[j].ID })
	silos := []float64{}
	for _, t := range rmt {
		silos = append(silos, t.LevelPersen/100)
	}
	tiba := []RTArrival{}
	jalan := 0
	for _, a := range arrivals {
		switch a.Status {
		case "Sudah Tiba":
			tiba = append(tiba, a)
		case "Dalam Perjalanan":
			jalan++
		}
	}
	sortRTArrivals(tiba)
	bays := []any{}
	for i := 0; i < 3; i++ {
		if i < len(tiba) {
			bays = append(bays, map[string]any{"rt": tiba[i].RTID, "tone": "ok"})
		} else {
			bays = append(bays, map[string]any{"rt": nil, "tone": "neutral"})
		}
	}
	yard := []any{}
	for i := 3; i < len(tiba) && i < 9; i++ {
		yard = append(yard, map[string]any{"rt": tiba[i].RTID, "tone": "neutral"})
	}
	return map[string]any{
		"bays": bays, "yard": yard,
		"lab":          map[string]any{"tone": "neutral", "label": "Lab test · tidak ada data lab pada skenario November"},
		"at2Starved":   false,
		"starvationAt": "",
		"silos":        silos,
		"onTheWay":     jalan,
		"viewLabel":    "Kondisi tercatat · " + labelJangkar(),
	}, nil
}

// bottlenecksNovember menurunkan titik perhatian situs dari state:
// stok tangki mentah snapshot, cakupan kedatangan, dan keadaan jadwal
// jendela berjalan. Tidak ada bottleneck karangan skenario lama.
func (s *Server) bottlenecksNovember(ctx context.Context) (any, error) {
	sk, e := s.skenarioNov()
	if e != nil {
		return nil, e
	}
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return nil, e
	}
	rmtVol, maxFill, tiba := 0.0, 0.0, 0
	for _, t := range sk.Tanks {
		if strings.HasPrefix(t.ID, "RMT-") {
			rmtVol += t.VolumeL
			if t.LevelPersen > maxFill {
				maxFill = t.LevelPersen
			}
		}
	}
	for _, a := range arrivals {
		if a.Status == "Sudah Tiba" {
			tiba++
		}
	}
	toneSilo := "ok"
	if maxFill >= 85 {
		toneSilo = "warn"
	}
	items := []map[string]any{
		{"title": "Stok tangki mentah", "text": fmt.Sprintf("Snapshot %s: %s L susu mentah pada tangki RMT.", labelJangkar(), formatThousands(int(math.Round(rmtVol)))), "tone": toneSilo, "focus": "silos"},
		{"title": "Kedatangan RT", "text": fmt.Sprintf("%d kedatangan terjadwal pada 1 s.d. 15 Nov, %d sudah tiba.", len(arrivals), tiba), "tone": "neutral", "focus": "yard"},
	}
	var sch Schedule
	if e := s.state(ctx, "schedule", "current", &sch); e != nil {
		return nil, e
	}
	if sch.ScheduleID == "" {
		items = append(items, map[string]any{"title": "Jadwal produksi", "text": "Belum ada jadwal tergenerate untuk jendela 1 s.d. 8 Nov.", "tone": "warn", "focus": "f2"})
	} else {
		risiko := 0
		for _, f := range sch.Fulfilment {
			if f.Status == "AT_RISK" || f.Status == "LATE" {
				risiko++
			}
		}
		tone := "ok"
		if risiko > 0 {
			tone = "warn"
		}
		items = append(items, map[string]any{"title": "Jadwal produksi", "text": fmt.Sprintf("Jadwal versi %d: %d run, %d PO berisiko atau terlambat.", sch.Version, len(sch.Runs), risiko), "tone": tone, "focus": "f2"})
	}
	return items, nil
}

// notifikasiNovember menyusun notifikasi dari state skenario November.
// Item kasus LAB-8812 dipertahankan karena berkas kasus FG-1013-07
// memang tetap hidup; item rencana FIFO dan HOLD-RT26 skenario lama
// diganti ringkasan jadwal dan kedatangan yang nyata.
func (s *Server) notifikasiNovember(ctx context.Context) (any, error) {
	arrivals, e := s.rtArrivals(ctx)
	if e != nil {
		return nil, e
	}
	tiba, jalan := 0, 0
	for _, a := range arrivals {
		switch a.Status {
		case "Sudah Tiba":
			tiba++
		case "Dalam Perjalanan":
			jalan++
		}
	}
	items := []map[string]any{}
	var sch Schedule
	if e := s.state(ctx, "schedule", "current", &sch); e != nil {
		return nil, e
	}
	if sch.ScheduleID == "" {
		items = append(items, map[string]any{"id": "SCH-NOV", "title": "Jadwal produksi belum digenerate", "subtitle": "Jendela 1 s.d. 8 Nov menunggu generate sebagai Planner", "sourceId": "SCH-NOV", "tone": "warn"})
	} else {
		risiko := 0
		for _, f := range sch.Fulfilment {
			if f.Status == "AT_RISK" || f.Status == "LATE" {
				risiko++
			}
		}
		tone := "ok"
		if risiko > 0 {
			tone = "warn"
		}
		items = append(items, map[string]any{"id": "SCH-NOV", "title": fmt.Sprintf("Jadwal produksi versi %d aktif", sch.Version), "subtitle": fmt.Sprintf("%d run · %d PO berisiko atau terlambat", len(sch.Runs), risiko), "sourceId": "SCH-NOV", "tone": tone})
	}
	items = append(items,
		map[string]any{"id": "RT-NOV", "title": "Kedatangan RT skenario November", "subtitle": fmt.Sprintf("%d kedatangan terjadwal · %d sudah tiba · %d dalam perjalanan", len(arrivals), tiba, jalan), "sourceId": "RT-NOV", "tone": "neutral"},
		map[string]any{"id": "LAB-8812", "title": "QC FG out-of-spec FG-1013-07", "subtitle": "Residu antibiotik · jalankan trace", "sourceId": "LAB-8812", "tone": "crit"},
	)
	return items, nil
}
