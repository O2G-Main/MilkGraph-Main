package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"

	"milkgraph/internal/store"
)

// Rantai Volume per Batch (Tahap 3): pencatatan volume susu di setiap
// proses (RT masuk, storage tank, mesin produksi, filling machine,
// sampai produk susu dalam kemasan) supaya loss tertelusur per titik.
//
// Sumber kebenarannya tetap dua entity state store: "transfer" (satu
// baris per pemindahan, kini dengan field step) dan "production-output"
// (satu baris per hasil filling menjadi kemasan). Saldo per alat dan
// ringkasan rantai per batch selalu diturunkan dari kedua daftar itu
// saat dibaca; tidak ada saldo yang disimpan terpisah, jadi angka tidak
// bisa berpisah dari catatan asalnya.

// refDikenal menjawab apakah sebuah ref boleh dipakai sebagai titik
// rantai. Ref sah bila salah satu dari:
//   - asset_id pada katalog master Greenfields yang dimuat Backend
//     (73 id, termasuk node batas FARM-SUPPLY, RT-INPUT, FG-OUTPUT),
//   - id yang dilayani Backend dari seed demo (tangki ops.json
//     midTanks dan asepticTanks, filler F1..F10, aset scenario.json),
//   - id RT yang ada pada jadwal kedatangan RT.
func (s *Server) refDikenal(ctx context.Context, ref string, arrivals []RTArrival) bool {
	if s.master != nil {
		for _, row := range s.master.Assets() {
			if row["asset_id"] == ref {
				return true
			}
		}
	}
	if s.seeds != nil {
		for _, kunci := range []string{"midTanks", "asepticTanks", "fillers"} {
			for _, v := range arr(s.seeds.Ops[kunci]) {
				if str(obj(v)["id"]) == ref {
					return true
				}
			}
		}
		for _, v := range arr(s.seeds.Scenario["assets"]) {
			if str(obj(v)["id"]) == ref {
				return true
			}
		}
	}
	if arrivals == nil {
		list, err := s.rtArrivals(ctx)
		if err != nil {
			return false
		}
		arrivals = list
	}
	for _, a := range arrivals {
		if a.RTID == ref {
			return true
		}
	}
	return false
}

// validasiRef menolak ref tak dikenal dengan 422 yang menyebut ref-nya,
// supaya kesalahan ketik di form FE langsung ketahuan, bukan menjadi
// titik rantai hantu.
func (s *Server) validasiRef(ctx context.Context, ref, field string, arrivals []RTArrival) error {
	if !s.refDikenal(ctx, ref, arrivals) {
		return invalid("Ref tidak dikenal: "+ref, field)
	}
	return nil
}

// ringkasDesimal membulatkan ke 3 desimal, pola yang sama dengan
// selisihTransfer, supaya sisa biner float tidak tampil di respons.
func ringkasDesimal(v float64) float64 {
	return math.Round(v*1000) / 1000
}

// persenSelisih menghitung selisih sebagai persen dari nilai acuan,
// 2 desimal; acuan 0 menghasilkan 0 (pengaman pembagian nol).
func persenSelisih(selisih, acuan float64) float64 {
	if acuan == 0 {
		return 0
	}
	return math.Round(selisih/acuan*100*100) / 100
}

// SaldoTitik adalah agregasi volume pada satu titik rantai.
type SaldoTitik struct {
	Ref           string  `json:"ref"`
	MasukL        float64 `json:"masuk_l"`
	KeluarL       float64 `json:"keluar_l"`
	SelisihL      float64 `json:"selisih_l"`
	JumlahTransfe int     `json:"-"`
}

// agregatPerTitik menjumlahkan volume masuk (volume_in_l pada transfer
// yang menuju titik itu) dan volume keluar (volume_out_l pada transfer
// yang berangkat dari titik itu) untuk daftar transfer yang diberikan.
// Urutan hasil mengikuti kemunculan pertama titik pada daftar.
func agregatPerTitik(list []TransferRecord) []SaldoTitik {
	urutan := []string{}
	per := map[string]*SaldoTitik{}
	sentuh := func(ref string) *SaldoTitik {
		p, ok := per[ref]
		if !ok {
			p = &SaldoTitik{Ref: ref}
			per[ref] = p
			urutan = append(urutan, ref)
		}
		return p
	}
	for _, tr := range list {
		dari := sentuh(tr.FromRef)
		dari.KeluarL += tr.VolumeOutL
		dari.JumlahTransfe++
		ke := sentuh(tr.ToRef)
		ke.MasukL += tr.VolumeInL
		ke.JumlahTransfe++
	}
	out := []SaldoTitik{}
	for _, ref := range urutan {
		p := per[ref]
		p.MasukL = ringkasDesimal(p.MasukL)
		p.KeluarL = ringkasDesimal(p.KeluarL)
		p.SelisihL = selisihTransfer(p.MasukL, p.KeluarL)
		out = append(out, *p)
	}
	return out
}

// ProductionOutput adalah satu catatan hasil filling menjadi produk
// kemasan: volume susu yang masuk ke mesin filling dan kemasan yang
// keluar darinya. volume_out_l, selisih_l, dan selisih_pct selalu
// dihitung server dari packs_out dan pack_size_ml.
type ProductionOutput struct {
	ID         string  `json:"id"`
	BatchID    string  `json:"batch_id"`
	FillingRef string  `json:"filling_ref"`
	VolumeInL  float64 `json:"volume_in_l"`
	PackSizeMl float64 `json:"pack_size_ml"`
	PacksOut   int     `json:"packs_out"`
	VolumeOutL float64 `json:"volume_out_l"`
	SelisihL   float64 `json:"selisih_l"`
	SelisihPct float64 `json:"selisih_pct"`
	RecordedAt string  `json:"recorded_at"`
}

// hitungOutputProduksi menurunkan angka output dari input mentahnya:
// volume keluar = jumlah kemasan kali ukuran kemasan (ml ke liter),
// selisih = volume masuk minus volume keluar.
func hitungOutputProduksi(volumeInL, packSizeMl float64, packsOut int) (volumeOutL, selisihL, selisihPct float64) {
	volumeOutL = ringkasDesimal(float64(packsOut) * packSizeMl / 1000)
	selisihL = selisihTransfer(volumeInL, volumeOutL)
	selisihPct = persenSelisih(selisihL, volumeInL)
	return volumeOutL, selisihL, selisihPct
}

func (s *Server) productionOutputs(ctx context.Context, batchID string) ([]ProductionOutput, error) {
	list := []ProductionOutput{}
	if e := s.state(ctx, "production-output", "current", &list); e != nil {
		return nil, e
	}
	out := []ProductionOutput{}
	for _, o := range list {
		if batchID == "" || o.BatchID == batchID {
			out = append(out, o)
		}
	}
	return out, nil
}

func (s *Server) registerRantaiVolume(register func(string, string, endpoint)) {
	// Saldo volume satu alat, diturunkan dari seluruh catatan transfer.
	register("GET /api/v1/trace/assets/{ref}/volume", "", func(r *http.Request) (any, error) {
		ref := r.PathValue("ref")
		arrivals, e := s.rtArrivals(r.Context())
		if e != nil {
			return nil, e
		}
		if !s.refDikenal(r.Context(), ref, arrivals) {
			return nil, missing()
		}
		semua, e := s.transfers(r.Context(), "")
		if e != nil {
			return nil, e
		}
		masuk, keluar := 0.0, 0.0
		jumlah := 0
		for _, tr := range semua {
			sentuh := false
			if tr.ToRef == ref {
				masuk += tr.VolumeInL
				sentuh = true
			}
			if tr.FromRef == ref {
				keluar += tr.VolumeOutL
				sentuh = true
			}
			if sentuh {
				jumlah++
			}
		}
		return map[string]any{
			"ref":             ref,
			"total_in_l":      ringkasDesimal(masuk),
			"total_out_l":     ringkasDesimal(keluar),
			"balance_l":       selisihTransfer(masuk, keluar),
			"jumlah_transfer": jumlah,
		}, nil
	})
	register("GET /api/v1/production/outputs", "", func(r *http.Request) (any, error) {
		return s.productionOutputs(r.Context(), r.URL.Query().Get("batch_id"))
	})
	register("POST /api/v1/production/outputs", "transfer.record", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var b struct {
			BatchID    string   `json:"batch_id"`
			FillingRef string   `json:"filling_ref"`
			VolumeInL  *float64 `json:"volume_in_l"`
			PackSizeMl *float64 `json:"pack_size_ml"`
			PacksOut   *int     `json:"packs_out"`
			RecordedAt string   `json:"recorded_at"`
		}
		if e := decode(r, &b); e != nil {
			return nil, e
		}
		if strings.TrimSpace(b.BatchID) == "" {
			return nil, invalid("Batch wajib diisi.", "batch_id")
		}
		if strings.TrimSpace(b.FillingRef) == "" {
			return nil, invalid("Mesin filling wajib diisi.", "filling_ref")
		}
		arrivals, e := s.rtArrivals(r.Context())
		if e != nil {
			return nil, e
		}
		if e := s.validasiRef(r.Context(), b.FillingRef, "filling_ref", arrivals); e != nil {
			return nil, e
		}
		if b.VolumeInL == nil || *b.VolumeInL < 0 {
			return nil, invalid("Volume masuk tidak boleh negatif.", "volume_in_l")
		}
		if b.PackSizeMl == nil || *b.PackSizeMl <= 0 {
			return nil, invalid("Ukuran kemasan harus lebih dari 0.", "pack_size_ml")
		}
		if b.PacksOut == nil || *b.PacksOut < 0 {
			return nil, invalid("Jumlah kemasan tidak boleh negatif.", "packs_out")
		}
		recordedAt := b.RecordedAt
		if recordedAt == "" {
			recordedAt = formatWaktu(waktuDemo)
		} else if _, e := parseWaktu(recordedAt); e != nil {
			return nil, invalid("Format waktu tidak valid.", "recorded_at")
		}
		volumeOut, selisih, pct := hitungOutputProduksi(*b.VolumeInL, *b.PackSizeMl, *b.PacksOut)
		var created ProductionOutput
		result, e := s.change(r.Context(), "production-output", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list := []ProductionOutput{}
			if len(raw) > 0 {
				if e := json.Unmarshal(raw, &list); e != nil {
					return store.Change{}, e
				}
			}
			created = ProductionOutput{
				ID:         fmt.Sprintf("OUT-%03d", len(list)+1),
				BatchID:    b.BatchID,
				FillingRef: b.FillingRef,
				VolumeInL:  *b.VolumeInL,
				PackSizeMl: *b.PackSizeMl,
				PacksOut:   *b.PacksOut,
				VolumeOutL: volumeOut,
				SelisihL:   selisih,
				SelisihPct: pct,
				RecordedAt: recordedAt,
			}
			list = append([]ProductionOutput{created}, list...)
			return store.Change{Value: list, Event: "production-output.created"}, nil
		})
		if e != nil {
			return nil, e
		}
		out := result.(map[string]any)
		out["result"] = created
		return out, nil
	})
	// Rantai volume satu batch: langkah-langkahnya, agregat per titik,
	// output produksinya, dan ringkasan loss ujung ke ujung.
	register("GET /api/v1/trace/batches/{batch_id}/volume-chain", "", func(r *http.Request) (any, error) {
		batchID := r.PathValue("batch_id")
		list, e := s.transfers(r.Context(), batchID)
		if e != nil {
			return nil, e
		}
		outputs, e := s.productionOutputs(r.Context(), batchID)
		if e != nil {
			return nil, e
		}
		if len(list) == 0 && len(outputs) == 0 {
			return nil, missing()
		}
		// Langkah ditampilkan kronologis (recorded_at menaik, id
		// menaik sebagai penentu seri), bukan urutan simpan yang
		// terbaru di depan.
		langkah := append([]TransferRecord{}, list...)
		sort.SliceStable(langkah, func(i, j int) bool {
			ti, ei := parseWaktu(langkah[i].RecordedAt)
			tj, ej := parseWaktu(langkah[j].RecordedAt)
			if ei == nil && ej == nil && !ti.Equal(tj) {
				return ti.Before(tj)
			}
			return langkah[i].ID < langkah[j].ID
		})
		// Definisi ringkasan:
		//   total_masuk_l: jumlah volume_in_l pada langkah ber-step
		//     "penerimaan"; bila batch belum punya langkah penerimaan,
		//     jumlah volume_in_l seluruh langkahnya.
		//   total_keluar_produk_l: jumlah volume_out_l seluruh output
		//     produksi batch.
		//   total_loss_l dan total_loss_pct: total_masuk_l minus
		//     total_keluar_produk_l, hanya bila output produksi ada;
		//     tanpa output rantainya belum tuntas, jadi keduanya null,
		//     bukan angka rekaan.
		totalMasuk := 0.0
		adaPenerimaan := false
		for _, tr := range list {
			if tr.Step == "penerimaan" {
				totalMasuk += tr.VolumeInL
				adaPenerimaan = true
			}
		}
		if !adaPenerimaan {
			for _, tr := range list {
				totalMasuk += tr.VolumeInL
			}
		}
		totalMasuk = ringkasDesimal(totalMasuk)
		totalKeluarProduk := 0.0
		for _, o := range outputs {
			totalKeluarProduk += o.VolumeOutL
		}
		totalKeluarProduk = ringkasDesimal(totalKeluarProduk)
		var totalLoss, totalLossPct any
		if len(outputs) > 0 {
			loss := selisihTransfer(totalMasuk, totalKeluarProduk)
			totalLoss = loss
			totalLossPct = persenSelisih(loss, totalMasuk)
		}
		return map[string]any{
			"batch_id":        batchID,
			"label_data":      "simulasi",
			"langkah":         langkah,
			"per_titik":       agregatPerTitik(list),
			"output_produksi": outputs,
			"ringkasan": map[string]any{
				"total_masuk_l":         totalMasuk,
				"total_keluar_produk_l": totalKeluarProduk,
				"total_loss_l":          totalLoss,
				"total_loss_pct":        totalLossPct,
			},
		}, nil
	})
}
