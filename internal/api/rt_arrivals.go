package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"milkgraph/internal/store"
)

// Jadwal Kedatangan RT (Tahap 3): kedatangan tanker susu per farm dicatat
// dinamis di state store (entity "rt-arrival", id "current", satu dokumen
// berisi daftar, pola yang sama dengan holds). Umur susu mulai dihitung sejak
// truk tiba; status mengikuti kosakata catatan Tahap 3: Dijadwalkan, Dalam
// Perjalanan, Sudah Tiba, Dibatalkan. Keterlambatan selalu dihitung server
// dari estimated_arrival terhadap target_arrival, tidak dipercaya dari klien.

var statusKedatanganValid = map[string]bool{
	"Dijadwalkan":      true,
	"Dalam Perjalanan": true,
	"Sudah Tiba":       true,
	"Dibatalkan":       true,
}

// waktuDemo adalah jam jangkar skenario aktif (Minggu 1 Nov 2026
// 06.00 WIB), yaitu waktu snapshot Opening Inventory Greenfields yang
// menjadi titik awal dataset November. Seluruh stempel waktu demo
// Backend (jendela jadwal, waktu tiba bawaan, prediksi downtime,
// stempel biaya) mengikuti konstanta ini.
var waktuDemo = time.Date(2026, 11, 1, 6, 0, 0, 0, time.FixedZone("WIB", 7*60*60))

// labelJangkar adalah label tanggal dan jam jangkar skenario aktif
// untuk tampilan, misalnya "1 Nov 2026 06.00 WIB".
func labelJangkar() string {
	bulan := []string{"", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}
	return fmt.Sprintf("%d %s %d %s WIB", waktuDemo.Day(), bulan[int(waktuDemo.Month())], waktuDemo.Year(), waktuDemo.Format("15.04"))
}

type RTArrival struct {
	ID               string  `json:"id"`
	FarmID           string  `json:"farm_id"`
	FarmName         string  `json:"farm_name"`
	RTID             string  `json:"rt_id"`
	VolumeL          float64 `json:"volume_l"`
	DepartAt         string  `json:"depart_at"`
	TargetArrival    string  `json:"target_arrival"`
	EstimatedArrival string  `json:"estimated_arrival"`
	ActualArrival    *string `json:"actual_arrival"`
	Status           string  `json:"status"`
	LateMinutes      int     `json:"late_minutes"`
	LabelData        string  `json:"label_data"`
}

func parseWaktu(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if t, err := time.Parse(layout, strings.TrimSpace(s)); err == nil {
			return t, nil
		}
	}
	return time.Time{}, &apiError{422, "VALIDATION", "Format waktu tidak valid.", ""}
}

// parseWaktuKedatangan adalah parser khusus jalur kedatangan RT. Selain
// format parseWaktu, ia menerima jam saja ("15:04") yang digabungkan
// dengan tanggal skenario demo (waktuDemo), karena form FE mengirim
// depart_at/target_arrival/estimated_arrival sebagai string jam.
// parseWaktu sendiri dipakai bersama scheduler, dashboard, dan downtime,
// di mana jam tanpa tanggal akan ambigu, jadi fallback ini sengaja
// dibatasi di jalur kedatangan saja.
func parseWaktuKedatangan(s string) (time.Time, error) {
	if t, err := parseWaktu(s); err == nil {
		return t, nil
	}
	jam, err := time.ParseInLocation("15:04", strings.TrimSpace(s), waktuDemo.Location())
	if err != nil {
		return time.Time{}, &apiError{422, "VALIDATION", "Format waktu tidak valid.", ""}
	}
	return time.Date(waktuDemo.Year(), waktuDemo.Month(), waktuDemo.Day(), jam.Hour(), jam.Minute(), 0, 0, waktuDemo.Location()), nil
}

// normalisasiWaktuKedatangan mengubah input jam saja menjadi stempel
// RFC3339 lengkap pada tanggal demo; format lain yang sudah dikenal
// parseWaktu dikembalikan apa adanya supaya perilaku lama tidak berubah.
// Nilai yang tersimpan selalu format penuh, jadi pembaca lain
// (hitungLateMenit, sortRTArrivals) tidak perlu tahu soal fallback ini.
func normalisasiWaktuKedatangan(s string) string {
	if _, err := parseWaktu(s); err == nil {
		return s
	}
	if t, err := parseWaktuKedatangan(s); err == nil {
		return formatWaktu(t)
	}
	return s
}

func formatWaktu(t time.Time) string { return t.Format(time.RFC3339) }

// hitungLateMenit menghitung selisih estimated terhadap target dalam menit;
// nilai negatif berarti tiba lebih awal dari target.
func hitungLateMenit(estimated, target string) int {
	e, errE := parseWaktu(estimated)
	t, errT := parseWaktu(target)
	if errE != nil || errT != nil {
		return 0
	}
	return int(math.Round(e.Sub(t).Minutes()))
}

func farmID(nama string) string {
	slug := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(nama), " ", "-"))
	if strings.HasPrefix(slug, "FARM-") || strings.HasPrefix(slug, "KUD-") {
		return slug
	}
	return "FARM-" + slug
}

// basisSeedRTArrivals adalah basis daftar kedatangan sebelum state
// terisi. Pada skenario aktif November basisnya kosong: daftar aktif
// murni hasil impor CSV berlabel historis, tanpa kedatangan turunan
// skenario lama. Pada mode rollback (skenario oktober) basisnya adalah
// seedRTArrivals seperti sebelum migrasi.
func (s *Server) basisSeedRTArrivals() []RTArrival {
	if skenarioNovemberAktif() {
		return []RTArrival{}
	}
	return s.seedRTArrivals()
}

// seedRTArrivals menurunkan jadwal kedatangan awal dari data tanker skenario
// lama. Ia hanya menjadi basis pada mode rollback (skenario oktober);
// pada skenario aktif November ia tidak dipakai sebagai basis daftar,
// tetapi tetap dipertahankan sebagai turunan berkas kasus lama:
// kedelapan tanker sudah berada di plant (status "Sudah Tiba") dengan waktu tiba
// diturunkan dari tahap dan lama tunggunya. RT-26 dan RT-24, dua tanker
// bertone crit/warn di skenario, tercatat terlambat dari targetnya.
func (s *Server) seedRTArrivals() []RTArrival {
	dwell := map[string]int{"Sampling": 15, "Lab test": 80, "Unloading": 70, "Released": 150}
	haul := map[string]int{"Farm Ngadirejo": 70, "Farm Sumberejo": 55, "Farm Tutur": 80, "KUD Ngantang": 65, "Farm Pujon Kidul": 75}
	terlambat := map[string]int{"RT-26": 35, "RT-24": 20}
	out := []RTArrival{}
	for _, raw := range arr(s.seeds.Scenario["tankers"]) {
		t := obj(raw)
		rtID, farm := str(t["id"]), str(t["farm"])
		d, ok := dwell[str(t["stage"])]
		if !ok {
			d = 60
		}
		tiba := waktuDemo.Add(-time.Duration(d+num(t["wait"])) * time.Minute)
		target := tiba.Add(-time.Duration(terlambat[rtID]) * time.Minute)
		h, ok := haul[farm]
		if !ok {
			h = 60
		}
		aktual := formatWaktu(tiba)
		a := RTArrival{
			ID:               "ARR-" + rtID,
			FarmID:           farmID(farm),
			FarmName:         farm,
			RTID:             rtID,
			VolumeL:          floatValue(t["volume"]),
			DepartAt:         formatWaktu(tiba.Add(-time.Duration(h) * time.Minute)),
			TargetArrival:    formatWaktu(target),
			EstimatedArrival: aktual,
			ActualArrival:    &aktual,
			Status:           "Sudah Tiba",
		}
		a.LateMinutes = hitungLateMenit(a.EstimatedArrival, a.TargetArrival)
		out = append(out, a)
	}
	sortRTArrivals(out)
	return out
}

func sortRTArrivals(list []RTArrival) {
	sort.SliceStable(list, func(i, j int) bool {
		ti, ei := parseWaktu(list[i].TargetArrival)
		tj, ej := parseWaktu(list[j].TargetArrival)
		if ei == nil && ej == nil && !ti.Equal(tj) {
			return ti.Before(tj)
		}
		return list[i].ID < list[j].ID
	})
}

// rtArrivals membaca daftar kedatangan: isi state store bila ada, atau seed
// dari skenario tanker bila store masih kosong.
func (s *Server) rtArrivals(ctx context.Context) ([]RTArrival, error) {
	list := []RTArrival{}
	if e := s.state(ctx, "rt-arrival", "current", &list); e != nil {
		return nil, e
	}
	if len(list) == 0 {
		list = s.basisSeedRTArrivals()
	}
	return list, nil
}

func basisRTArrivals(s *Server, raw json.RawMessage) ([]RTArrival, error) {
	list := s.basisSeedRTArrivals()
	if len(raw) > 0 {
		if e := json.Unmarshal(raw, &list); e != nil {
			return nil, e
		}
	}
	return list, nil
}

func validasiWaktuKedatangan(nilai, field string) error {
	if strings.TrimSpace(nilai) == "" {
		return invalid("Waktu wajib diisi.", field)
	}
	if _, e := parseWaktuKedatangan(nilai); e != nil {
		return invalid("Format waktu tidak valid.", field)
	}
	return nil
}

func (s *Server) registerRTArrivals(register func(string, string, endpoint)) {
	register("GET /api/v1/supply/rt-arrivals", "", func(r *http.Request) (any, error) {
		list, e := s.rtArrivals(r.Context())
		if e != nil {
			return nil, e
		}
		if s.DB != nil {
			stored := []RTArrival{}
			if e := s.state(r.Context(), "rt-arrival", "current", &stored); e != nil {
				return nil, e
			}
			if len(stored) == 0 {
				// Baca pertama: tanam seed ke state store supaya kedatangan
				// sesudahnya menimpa basis yang sama.
				res, e := s.change(r.Context(), "rt-arrival", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
					cur, e := basisRTArrivals(s, raw)
					if e != nil {
						return store.Change{}, e
					}
					return store.Change{Value: cur, Event: "rt-arrival.seeded"}, nil
				})
				if e != nil {
					return nil, e
				}
				return obj(res)["result"], nil
			}
		}
		return list, nil
	})
	register("POST /api/v1/supply/rt-arrivals", "rt.manage", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var b struct {
			FarmID           string   `json:"farm_id"`
			FarmName         string   `json:"farm_name"`
			RTID             string   `json:"rt_id"`
			VolumeL          *float64 `json:"volume_l"`
			DepartAt         string   `json:"depart_at"`
			TargetArrival    string   `json:"target_arrival"`
			EstimatedArrival string   `json:"estimated_arrival"`
			ActualArrival    *string  `json:"actual_arrival"`
			Status           string   `json:"status"`
		}
		if e := decode(r, &b); e != nil {
			return nil, e
		}
		if strings.TrimSpace(b.RTID) == "" {
			return nil, invalid("RT wajib diisi.", "rt_id")
		}
		if strings.TrimSpace(b.FarmName) == "" {
			return nil, invalid("Farm wajib diisi.", "farm_name")
		}
		if b.VolumeL == nil || *b.VolumeL <= 0 {
			return nil, invalid("Volume harus lebih dari 0.", "volume_l")
		}
		for _, w := range []struct{ nilai, field string }{
			{b.DepartAt, "depart_at"}, {b.TargetArrival, "target_arrival"}, {b.EstimatedArrival, "estimated_arrival"},
		} {
			if e := validasiWaktuKedatangan(w.nilai, w.field); e != nil {
				return nil, e
			}
		}
		if b.ActualArrival != nil && *b.ActualArrival != "" {
			if e := validasiWaktuKedatangan(*b.ActualArrival, "actual_arrival"); e != nil {
				return nil, e
			}
		}
		// Input jam saja ("15:04") dinormalisasi ke stempel penuh
		// tanggal demo sebelum disimpan.
		b.DepartAt = normalisasiWaktuKedatangan(b.DepartAt)
		b.TargetArrival = normalisasiWaktuKedatangan(b.TargetArrival)
		b.EstimatedArrival = normalisasiWaktuKedatangan(b.EstimatedArrival)
		if b.ActualArrival != nil && *b.ActualArrival != "" {
			v := normalisasiWaktuKedatangan(*b.ActualArrival)
			b.ActualArrival = &v
		}
		status := b.Status
		if status == "" {
			status = "Dijadwalkan"
		}
		if !statusKedatanganValid[status] {
			return nil, invalid("Status kedatangan tidak valid.", "status")
		}
		farm := b.FarmID
		if farm == "" {
			farm = farmID(b.FarmName)
		}
		var created RTArrival
		result, e := s.change(r.Context(), "rt-arrival", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list, e := basisRTArrivals(s, raw)
			if e != nil {
				return store.Change{}, e
			}
			id := "ARR-" + b.RTID
			ada := map[string]bool{}
			for _, a := range list {
				ada[a.ID] = true
			}
			for n := 2; ada[id]; n++ {
				id = "ARR-" + b.RTID + "-" + strconv.Itoa(n)
			}
			created = RTArrival{
				ID: id, FarmID: farm, FarmName: b.FarmName, RTID: b.RTID, VolumeL: *b.VolumeL,
				DepartAt: b.DepartAt, TargetArrival: b.TargetArrival, EstimatedArrival: b.EstimatedArrival,
				ActualArrival: b.ActualArrival, Status: status,
			}
			created.LateMinutes = hitungLateMenit(created.EstimatedArrival, created.TargetArrival)
			list = append(list, created)
			sortRTArrivals(list)
			return store.Change{Value: list, Event: "rt-arrival.created"}, nil
		})
		if e != nil {
			return nil, e
		}
		out := result.(map[string]any)
		out["result"] = created
		return out, nil
	})
	register("PUT /api/v1/supply/rt-arrivals/{id}", "rt.manage", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		id := r.PathValue("id")
		var b struct {
			EstimatedArrival *string `json:"estimated_arrival"`
			Status           *string `json:"status"`
			ActualArrival    *string `json:"actual_arrival"`
		}
		if e := decode(r, &b); e != nil {
			return nil, e
		}
		if b.EstimatedArrival != nil {
			if e := validasiWaktuKedatangan(*b.EstimatedArrival, "estimated_arrival"); e != nil {
				return nil, e
			}
		}
		if b.ActualArrival != nil && *b.ActualArrival != "" {
			if e := validasiWaktuKedatangan(*b.ActualArrival, "actual_arrival"); e != nil {
				return nil, e
			}
		}
		if b.Status != nil && !statusKedatanganValid[*b.Status] {
			return nil, invalid("Status kedatangan tidak valid.", "status")
		}
		if b.EstimatedArrival != nil {
			v := normalisasiWaktuKedatangan(*b.EstimatedArrival)
			b.EstimatedArrival = &v
		}
		if b.ActualArrival != nil && *b.ActualArrival != "" {
			v := normalisasiWaktuKedatangan(*b.ActualArrival)
			b.ActualArrival = &v
		}
		var updated RTArrival
		result, e := s.change(r.Context(), "rt-arrival", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list, e := basisRTArrivals(s, raw)
			if e != nil {
				return store.Change{}, e
			}
			found := false
			for i, a := range list {
				if a.ID != id {
					continue
				}
				found = true
				if b.EstimatedArrival != nil {
					a.EstimatedArrival = *b.EstimatedArrival
				}
				if b.Status != nil {
					a.Status = *b.Status
				}
				if b.ActualArrival != nil {
					if *b.ActualArrival == "" {
						a.ActualArrival = nil
					} else {
						v := *b.ActualArrival
						a.ActualArrival = &v
					}
				}
				a.LateMinutes = hitungLateMenit(a.EstimatedArrival, a.TargetArrival)
				list[i] = a
				updated = a
			}
			if !found {
				return store.Change{}, missing()
			}
			return store.Change{Value: list, Event: "rt-arrival.updated"}, nil
		})
		if e != nil {
			return nil, e
		}
		out := result.(map[string]any)
		out["result"] = updated
		return out, nil
	})
}
