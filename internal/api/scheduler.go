package api

import (
	"math"
	"sort"
	"time"
)

// Penjadwalan PO (Tahap 3, P1): scheduler deterministik berbasis aturan,
// tanpa solver eksternal. Fungsi bangunJadwal murni (tanpa Server/DB) supaya
// bisa diuji unit; handler dan perakitan parameter ada di schedules.go.
//
// Aturan keras yang ditegakkan:
//   - satu filling machine (FM) menjalankan satu SKU pada satu waktu;
//   - run hanya boleh di FM yang fm_capable untuk SKU-nya;
//   - ganti ukuran/rasa pada FM yang sama menyisipkan changeover sebelum run
//     berikutnya (durasi dari aturan kelas transisi resmi changeover_rules,
//     bukan konstanta dan bukan matriks nama-pasangan lama);
//   - FM tidak tersedia selama jendela downtime; penempatan mencoba FM lain
//     yang capable (termasuk backup_fm) sebelum menerima start yang lebih
//     lambat di FM utama.
//
// Penyederhanaan yang disadari (dicatat juga di laporan):
//   - satu baris PO menjadi satu run utuh (tidak dipecah antar FM/hari);
//   - changeover hanya dihitung sebagai jeda sebelum run; tumpang tindih
//     changeover dengan jendela downtime tidak dimodelkan;
//   - stok bahan baku dibandingkan sebagai total jendela (kebutuhan semua PO
//     vs stok tangki aseptik + volume kedatangan), bukan per tangki per jam.

type POLine struct {
	SKU      string  `json:"sku"`
	QtyLiter float64 `json:"qty_liter"`
}

type ProductionOrder struct {
	POID        string   `json:"po_id"`
	Priority    int      `json:"priority"`
	Lines       []POLine `json:"lines"`
	DueDatetime string   `json:"due_datetime"`
	LabelData   string   `json:"label_data"`
}

type DowntimeTrigger struct {
	ResourceID string `json:"resource_id"`
	Start      string `json:"start"`
	End        string `json:"end"`
}

type ScheduleTrigger struct {
	ID         string           `json:"id"`
	ReasonCode string           `json:"reason_code"`
	RefID      string           `json:"ref_id"`
	Detail     string           `json:"detail"`
	Downtime   *DowntimeTrigger `json:"downtime,omitempty"`
	CreatedBy  string           `json:"created_by"`
	CreatedAt  string           `json:"created_at"`
}

var reasonCodeValid = map[string]bool{
	"DOWNTIME":           true,
	"RAW_MATERIAL_SHORT": true,
	"RT_LATE":            true,
	"RT_QUEUE":           true,
	"HOLDING_EXCEEDED":   true,
	"PO_CHANGED":         true,
}

// InfoSKU adalah turunan master data untuk satu finished SKU.
type InfoSKU struct {
	SizeML int
}

// MesinJadwal adalah parameter satu filling line untuk scheduler.
type MesinJadwal struct {
	ID           string
	SKUCapable   []string // finished SKU yang boleh dijalankan (fm_capable)
	BackupID     string   // backup_fm: line lain dalam grup dedikasi yang sama
	TangkiSumber string   // source aseptic tank dari line dedication
	// SpeedPackPerHour adalah speed resmi lini dalam pack per jam dari
	// line_dedication/asset_configuration; 0 berarti lini tidak tercakup
	// data speed dan rate-nya jatuh ke cadangan per ukuran kemasan.
	SpeedPackPerHour int
}

// TangkiJadwal adalah parameter satu tangki sumber untuk scheduler.
type TangkiJadwal struct {
	ID              string
	CapacityL       float64
	LevelL          float64
	MaxHoldingHours float64
}

// TransisiJadwal adalah hasil penilaian satu transisi SKU ke SKU lain
// menurut aturan kelas resmi changeover_rules: durasi changeover, kelas
// aturannya, dan kewajiban CIP yang mengikuti transisi itu (dari cip_rules
// lewat klasifier master). CIP dilaporkan sebagai konteks pada run, bukan
// komponen durasi, karena durasi CIP per aset adalah urusan eksekusi
// cleaning, bukan jeda changeover pada lini.
type TransisiJadwal struct {
	DurasiMenit int
	RuleID      string // VARIANT, SIZE, PAPER, atau NONE
	PerluCIP    bool
	CIPRuleID   string // rule_id cip_rules bila PerluCIP
}

// ParamsJadwal mengumpulkan seluruh parameter scheduler dari master data,
// limits, dan ops.
//
//   - Rate utama bersifat per lini: rate L per jam satu run pada lini L
//     untuk SKU berukuran M ml adalah SpeedPackPerHour(L) * M / 1000.
//     Speed resmi dalam pack per jam, scheduler berpikir dalam liter per
//     jam, jadi ukuran kemasan SKU adalah jembatan satuannya.
//   - RateLPerHour (per ukuran kemasan) hanya cadangan untuk lini atau SKU
//     yang tidak tercakup data speed resmi; isinya nilai contoh coaching
//     lama dan tidak dipakai bila speed lini tersedia.
//   - Transisi diindeks "finishedSKU A>finishedSKU B" dan dinilai sekali
//     saat parameter dirakit dari klasifier + changeover_rules master.
//   - HoldingLimitH adalah batas holding global (bawaan 630 menit dari
//     limits) untuk tangki di luar cakupan data; HoldingPerTangki memuat
//     batas per tangki dari asset_configuration dan menang atas global.
type ParamsJadwal struct {
	Machines     []MesinJadwal
	Tanks        []TangkiJadwal
	RateLPerHour map[int]float64
	Transisi     map[string]TransisiJadwal
	// ChangeoverCadanganMenit adalah durasi kelas resmi terbesar (SIZE,
	// 60 menit), dipakai untuk pasangan SKU yang tidak ada di tabel
	// Transisi (SKU di luar katalog master).
	ChangeoverCadanganMenit int
	HoldingLimitH           float64
	HoldingPerTangki        map[string]float64
}

// JendelaWaktu adalah rentang start/end dalam format RFC3339.
type JendelaWaktu struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type RunJadwal struct {
	RunID              string  `json:"run_id"`
	POID               string  `json:"po_id"`
	SKU                string  `json:"sku"`
	FMID               string  `json:"fm_id"`
	TankSource         string  `json:"tank_source"`
	Start              string  `json:"start"`
	End                string  `json:"end"`
	QtyLiter           float64 `json:"qty_liter"`
	ChangeoverAfterMin int     `json:"changeover_after_min"`
	// Konteks changeover sesudah run ini (mengikuti kelas aturan resmi):
	// kelas transisinya dan kewajiban CIP yang harus dieksekusi sebelum run
	// berikutnya di FM yang sama. CIP dilaporkan, tidak dihitung sebagai
	// durasi di jadwal.
	ChangeoverRuleID string `json:"changeover_rule_id,omitempty"`
	CIPRequired      bool   `json:"cip_required,omitempty"`
	CIPRuleID        string `json:"cip_rule_id,omitempty"`
}

type FulfilmentPO struct {
	POID              string   `json:"po_id"`
	Status            string   `json:"status"`
	FulfilledPct      float64  `json:"fulfilled_pct"`
	PlannedCompletion string   `json:"planned_completion"`
	RootCauses        []string `json:"root_causes"`
}

type WarningJadwal struct {
	Type       string   `json:"type"`
	ResourceID string   `json:"resource_id"`
	NeededL    *float64 `json:"needed_l,omitempty"`
	AvailableL *float64 `json:"available_l,omitempty"`
	LimitH     *float64 `json:"limit_h,omitempty"`
	ProjectedH *float64 `json:"projected_h,omitempty"`
}

type Schedule struct {
	ScheduleID  string          `json:"schedule_id"`
	Version     int             `json:"version"`
	GeneratedAt string          `json:"generated_at"`
	TriggeredBy string          `json:"triggered_by"`
	Window      JendelaWaktu    `json:"window"`
	Runs        []RunJadwal     `json:"runs"`
	Fulfilment  []FulfilmentPO  `json:"fulfilment"`
	Warnings    []WarningJadwal `json:"warnings"`
}

// RingkasanJadwal adalah satu baris riwayat versi untuk GET /schedules.
// Hitungan run/PO/peringatan ikut disimpan karena jadwal versi lama tidak
// disimpan penuh (hanya versi terbaru di id "current"); narasi perubahan
// jadwal membandingkan versi dari hitungan ini.
type RingkasanJadwal struct {
	ScheduleID  string `json:"schedule_id"`
	Version     int    `json:"version"`
	GeneratedAt string `json:"generated_at"`
	TriggeredBy string `json:"triggered_by"`
	RunsTotal   int    `json:"runs_total"`
	POLate      int    `json:"po_late"`
	POAtRisk    int    `json:"po_at_risk"`
	Warnings    int    `json:"warnings"`
}

// InputJadwal adalah seluruh masukan murni scheduler.
type InputJadwal struct {
	POs           []ProductionOrder
	Params        ParamsJadwal
	SKUInfo       map[string]InfoSKU
	Downtime      []JendelaDowntime
	Triggers      []ScheduleTrigger
	WindowStart   time.Time
	Version       int
	TriggeredBy   string
	StokTersediaL float64
	// SusuSiapPada adalah waktu susu paling awal tersedia (kedatangan aktual/
	// estimasi paling awal); nil berarti proyeksi holding tidak dihitung.
	SusuSiapPada *time.Time
}

// JendelaDowntime adalah interval FM tidak tersedia (sudah diparse).
type JendelaDowntime struct {
	ResourceID string
	Start      time.Time
	End        time.Time
}

// transisiAntar menilai transisi dari SKU asal ke SKU tujuan dari tabel
// Transisi yang dirakit paramsJadwal (klasifikasi kelas resmi: VARIANT 45,
// SIZE 60, PAPER 15, NONE 0 menit). SKU yang sama tidak butuh changeover.
// Pasangan yang tidak ada di tabel (SKU di luar katalog master) jatuh ke
// durasi cadangan kelas terbesar supaya jadwal tidak menganggap transisi
// asing sebagai gratis.
func transisiAntar(p ParamsJadwal, dariSKU, keSKU string) TransisiJadwal {
	if dariSKU == keSKU {
		return TransisiJadwal{DurasiMenit: 0, RuleID: "NONE"}
	}
	if t, ok := p.Transisi[dariSKU+">"+keSKU]; ok {
		return t
	}
	return TransisiJadwal{DurasiMenit: p.ChangeoverCadanganMenit}
}

// rateLPerJam menghitung rate pengisian satu lini untuk satu SKU.
//
// Rumus konversi satuan: speed resmi lini dinyatakan dalam pack per jam,
// sedangkan qty PO dan durasi scheduler dalam liter. Satu pack berisi
// SizeML ml = SizeML/1000 liter, jadi:
//
//	rate (L per jam) = speed (pack per jam) * SizeML / 1000
//
// Contoh: FL-08 30.000 pack per jam pada kemasan 250 ml = 7.500 L per jam.
// Lini tanpa speed resmi (SpeedPackPerHour 0) atau SKU tanpa ukuran jatuh
// ke rate cadangan per ukuran kemasan.
func rateLPerJam(p ParamsJadwal, m MesinJadwal, info InfoSKU) float64 {
	if m.SpeedPackPerHour > 0 && info.SizeML > 0 {
		return float64(m.SpeedPackPerHour) * float64(info.SizeML) / 1000
	}
	return p.RateLPerHour[info.SizeML]
}

// batasHoldingUntuk mengembalikan batas holding (jam) yang berlaku untuk
// satu tangki: batas per tangki dari data aset bila tangki tercakup,
// selain itu batas global.
func batasHoldingUntuk(p ParamsJadwal, tangkiID string) float64 {
	if v, ok := p.HoldingPerTangki[tangkiID]; ok {
		return v
	}
	return p.HoldingLimitH
}

// geserLewatDowntime memajukan start sampai interval [start, start+dur)
// tidak lagi menabrak jendela downtime FM tersebut.
func geserLewatDowntime(jendela []JendelaDowntime, fmID string, start time.Time, dur time.Duration) time.Time {
	for {
		bergerak := false
		for _, w := range jendela {
			if w.ResourceID != fmID {
				continue
			}
			if start.Before(w.End) && start.Add(dur).After(w.Start) {
				start = w.End
				bergerak = true
			}
		}
		if !bergerak {
			return start
		}
	}
}

type keadaanFM struct {
	bebasPada   time.Time
	skuTerakhir string
	indeksRun   []int
}

// bangunJadwal menyusun jadwal berversi dari PO + parameter + trigger aktif.
//
// Logika fulfilment per PO (deterministik):
//   - fulfilled_pct = qty terjadwal / qty total baris PO.
//   - LATE bila ada baris yang tidak terjadwal (shortfall) atau
//     planned_completion melewati due_datetime.
//   - AT_RISK bila tepat waktu tetapi ada pemicu yang menyentuh run-nya
//     (ref_id = PO, downtime pada FM run-nya, run tergeser downtime), atau
//     peringatan yang sumber dayanya dipakai run-nya, atau stok global kurang.
//   - FULFILLED bila lengkap, tepat waktu, tanpa risiko, dan due berada di
//     dalam jendela 3 hari (selesai pada jendela ini).
//   - ON_TRACK untuk sisanya: lengkap dan tepat waktu, due masih di luar
//     jendela sehingga belum jatuh tempo pada jendela ini.
func bangunJadwal(in InputJadwal) Schedule {
	windowStart := in.WindowStart
	windowEnd := windowStart.Add(3 * 24 * time.Hour)
	sch := Schedule{
		ScheduleID:  "SCH-" + windowStart.Format("20060102") + "-v" + itoa(in.Version),
		Version:     in.Version,
		GeneratedAt: formatWaktu(windowStart),
		TriggeredBy: in.TriggeredBy,
		Window:      JendelaWaktu{Start: formatWaktu(windowStart), End: formatWaktu(windowEnd)},
		Runs:        []RunJadwal{},
		Fulfilment:  []FulfilmentPO{},
		Warnings:    []WarningJadwal{},
	}

	// Urutan kerja deterministik: prioritas terkecil dulu, lalu due paling
	// awal, lalu po_id.
	pos := clone(in.POs)
	sort.SliceStable(pos, func(i, j int) bool {
		if pos[i].Priority != pos[j].Priority {
			return pos[i].Priority < pos[j].Priority
		}
		di, dj := pos[i].DueDatetime, pos[j].DueDatetime
		if di != dj {
			return di < dj
		}
		return pos[i].POID < pos[j].POID
	})

	keadaan := map[string]*keadaanFM{}
	keadaanUntuk := func(id string) *keadaanFM {
		k, ok := keadaan[id]
		if !ok {
			k = &keadaanFM{bebasPada: windowStart}
			keadaan[id] = k
		}
		return k
	}

	type hasilPO struct {
		total, terjadwal float64
		selesai          time.Time
		adaRun           bool
		tergeser         bool
		takTerjadwal     bool
		fmDipakai        map[string]bool
		tangkiDipakai    map[string]bool
	}
	hasil := map[string]*hasilPO{}
	for _, po := range pos {
		hasil[po.POID] = &hasilPO{fmDipakai: map[string]bool{}, tangkiDipakai: map[string]bool{}}
	}

	nomorRun := 0
	for _, po := range pos {
		h := hasil[po.POID]
		for _, line := range po.Lines {
			h.total += line.QtyLiter
			info, okInfo := in.SKUInfo[line.SKU]
			// Kumpulkan kandidat: FM yang capable dan punya rate untuk SKU
			// ini. Rate bersifat per lini (speed resmi lini dikonversi ke
			// liter per jam), jadi durasi dihitung per kandidat.
			type kandidat struct {
				mesin       MesinJadwal
				mulai       time.Time
				mulaiMentah time.Time
				selesai     time.Time
			}
			var pilihan *kandidat
			if okInfo {
				for _, m := range in.Params.Machines {
					if !mengandung(m.SKUCapable, line.SKU) {
						continue
					}
					rate := rateLPerJam(in.Params, m, info)
					if rate <= 0 {
						continue
					}
					dur := time.Duration(int(math.Ceil(line.QtyLiter/rate*60))) * time.Minute
					k := keadaanUntuk(m.ID)
					mulai := windowStart
					if k.bebasPada.After(mulai) {
						mulai = k.bebasPada
					}
					if k.skuTerakhir != "" && k.skuTerakhir != line.SKU {
						mulai = mulai.Add(time.Duration(transisiAntar(in.Params, k.skuTerakhir, line.SKU).DurasiMenit) * time.Minute)
					}
					mulaiMentah := mulai
					mulai = geserLewatDowntime(in.Downtime, m.ID, mulai, dur)
					cand := kandidat{mesin: m, mulai: mulai, mulaiMentah: mulaiMentah, selesai: mulai.Add(dur)}
					if pilihan == nil || cand.selesai.Before(pilihan.selesai) ||
						(cand.selesai.Equal(pilihan.selesai) && cand.mesin.ID < pilihan.mesin.ID) {
						c := cand
						pilihan = &c
					}
				}
			}
			if pilihan == nil {
				h.takTerjadwal = true
				continue
			}
			nomorRun++
			run := RunJadwal{
				RunID:      "RUN-" + pad3(nomorRun),
				POID:       po.POID,
				SKU:        line.SKU,
				FMID:       pilihan.mesin.ID,
				TankSource: pilihan.mesin.TangkiSumber,
				Start:      formatWaktu(pilihan.mulai),
				End:        formatWaktu(pilihan.selesai),
				QtyLiter:   line.QtyLiter,
			}
			sch.Runs = append(sch.Runs, run)
			k := keadaanUntuk(pilihan.mesin.ID)
			k.indeksRun = append(k.indeksRun, len(sch.Runs)-1)
			k.bebasPada = pilihan.selesai
			k.skuTerakhir = line.SKU
			if pilihan.mulai.After(pilihan.mulaiMentah) {
				h.tergeser = true
			}
			h.terjadwal += line.QtyLiter
			if !h.adaRun || pilihan.selesai.After(h.selesai) {
				h.selesai = pilihan.selesai
			}
			h.adaRun = true
			h.fmDipakai[pilihan.mesin.ID] = true
			h.tangkiDipakai[pilihan.mesin.TangkiSumber] = true
		}
	}

	// changeover_after_min: jeda sesudah run sebelum run berikutnya di FM
	// yang sama, hanya bila SKU berubah; kelas transisi dan kewajiban CIP
	// nya ikut dilaporkan sebagai konteks run.
	for _, k := range keadaan {
		for i := 0; i+1 < len(k.indeksRun); i++ {
			a := &sch.Runs[k.indeksRun[i]]
			b := sch.Runs[k.indeksRun[i+1]]
			if a.SKU != b.SKU {
				t := transisiAntar(in.Params, a.SKU, b.SKU)
				a.ChangeoverAfterMin = t.DurasiMenit
				a.ChangeoverRuleID = t.RuleID
				a.CIPRequired = t.PerluCIP
				a.CIPRuleID = t.CIPRuleID
			}
		}
	}
	sort.SliceStable(sch.Runs, func(i, j int) bool {
		if sch.Runs[i].Start != sch.Runs[j].Start {
			return sch.Runs[i].Start < sch.Runs[j].Start
		}
		return sch.Runs[i].RunID < sch.Runs[j].RunID
	})

	// Peringatan stok: kebutuhan total jendela vs stok tersedia.
	totalButuh := 0.0
	for _, po := range pos {
		for _, line := range po.Lines {
			totalButuh += line.QtyLiter
		}
	}
	stokKurang := totalButuh > 0 && in.StokTersediaL < totalButuh
	if stokKurang {
		butuh, tersedia := totalButuh, in.StokTersediaL
		sch.Warnings = append(sch.Warnings, WarningJadwal{
			Type: "TANK_STOCK_SHORT", ResourceID: "ASEPTIC-TANK",
			NeededL: &butuh, AvailableL: &tersedia,
		})
	}

	// Peringatan holding: susu paling awal menunggu sampai run terakhir
	// mulai; bila melewati batas holding tangki, beri peringatan.
	if in.SusuSiapPada != nil && len(sch.Runs) > 0 {
		runTerakhir := sch.Runs[0]
		for _, r := range sch.Runs {
			if r.Start > runTerakhir.Start {
				runTerakhir = r
			}
		}
		mulaiTerakhir, err := parseWaktu(runTerakhir.Start)
		if err == nil {
			proyeksi := math.Round(mulaiTerakhir.Sub(*in.SusuSiapPada).Hours()*10) / 10
			batas := batasHoldingUntuk(in.Params, runTerakhir.TankSource)
			if proyeksi > batas {
				sch.Warnings = append(sch.Warnings, WarningJadwal{
					Type: "HOLDING_TIME", ResourceID: runTerakhir.TankSource,
					LimitH: &batas, ProjectedH: &proyeksi,
				})
			}
		}
	}

	// Fulfilment per PO mengikuti urutan kerja yang sama.
	for _, po := range pos {
		h := hasil[po.POID]
		f := FulfilmentPO{POID: po.POID, RootCauses: []string{}}
		if h.total > 0 {
			f.FulfilledPct = math.Round(h.terjadwal/h.total*1000) / 1000
		}
		if h.adaRun {
			f.PlannedCompletion = formatWaktu(h.selesai)
		}
		sebab := map[string]bool{}
		risiko := false
		if h.takTerjadwal {
			sebab["NO_CAPABLE_MACHINE"] = true
		}
		if h.tergeser {
			sebab["DOWNTIME"] = true
			risiko = true
		}
		if stokKurang {
			sebab["RAW_MATERIAL_SHORT"] = true
			risiko = true
		}
		for _, tr := range in.Triggers {
			menyentuh := tr.RefID == po.POID
			if tr.ReasonCode == "DOWNTIME" {
				res := tr.RefID
				if tr.Downtime != nil && tr.Downtime.ResourceID != "" {
					res = tr.Downtime.ResourceID
				}
				if h.fmDipakai[res] {
					menyentuh = true
				}
			}
			if menyentuh {
				sebab[tr.ReasonCode] = true
				risiko = true
			}
		}
		for _, w := range sch.Warnings {
			if h.fmDipakai[w.ResourceID] || h.tangkiDipakai[w.ResourceID] {
				risiko = true
			}
		}
		due, errDue := parseWaktu(po.DueDatetime)
		if errDue != nil {
			due = windowEnd
		}
		switch {
		case h.takTerjadwal || (h.adaRun && h.selesai.After(due)):
			f.Status = "LATE"
		case risiko:
			f.Status = "AT_RISK"
		case !due.After(windowEnd):
			f.Status = "FULFILLED"
		default:
			f.Status = "ON_TRACK"
		}
		for s := range sebab {
			f.RootCauses = append(f.RootCauses, s)
		}
		sort.Strings(f.RootCauses)
		sch.Fulfilment = append(sch.Fulfilment, f)
	}
	return sch
}

func mengandung(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	negatif := n < 0
	if negatif {
		n = -n
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if negatif {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func pad3(n int) string {
	s := itoa(n)
	for len(s) < 3 {
		s = "0" + s
	}
	return s
}
