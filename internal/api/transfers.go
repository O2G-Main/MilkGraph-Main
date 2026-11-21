package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"

	"milkgraph/internal/store"
)

// Transfer & Volume (Tahap 3): setiap pemindahan susu antar alat dicatat satu
// baris oleh operator (atau kelak alat IoT lewat API yang sama); sistem
// menampilkan selisih volume keluar terhadap volume diterima. Catatan ini
// memperluas konsep trace/handoffs yang selama ini statis dari seed, dan
// disimpan di state store (entity "transfer", id "current", satu dokumen
// berisi daftar terbaru di depan, pola yang sama dengan holds). Selisih
// selalu dihitung server, tidak dipercaya dari klien.
//
// Rantai Volume per Batch: setiap transfer kini membawa "step" (tahap
// rantai: penerimaan, transfer, pemrosesan, filling, pengemasan) dan
// from_ref/to_ref divalidasi ke ref yang dikenal Backend (katalog master,
// id seed demo, atau RT pada jadwal kedatangan). Agregasi saldo per alat,
// catatan output produksi, dan rantai volume per batch ada di
// rantai_volume.go; catatan transfer tetap satu-satunya sumber kebenaran
// volume, tidak ada saldo yang disimpan terpisah.

type TransferRecord struct {
	ID         string  `json:"id"`
	BatchID    string  `json:"batch_id"`
	FromRef    string  `json:"from_ref"`
	ToRef      string  `json:"to_ref"`
	Step       string  `json:"step"`
	VolumeOutL float64 `json:"volume_out_l"`
	VolumeInL  float64 `json:"volume_in_l"`
	SelisihL   float64 `json:"selisih_l"`
	Source     string  `json:"source"`
	RecordedAt string  `json:"recorded_at"`
}

// langkahTransferValid adalah kosakata tahap rantai volume.
var langkahTransferValid = map[string]bool{
	"penerimaan": true,
	"transfer":   true,
	"pemrosesan": true,
	"filling":    true,
	"pengemasan": true,
}

// stepTransfer menormalisasi tahap transfer: nilai kosong (termasuk
// catatan lama yang tersimpan sebelum field ini ada) berarti "transfer".
func stepTransfer(s string) string {
	if s == "" {
		return "transfer"
	}
	return s
}

// selisihTransfer menghitung kehilangan volume pada satu transfer:
// volume yang keluar dari alat asal dikurangi volume yang diterima alat
// tujuan. Dibulatkan ke 3 desimal supaya sisa biner float tidak tampil.
func selisihTransfer(volumeOut, volumeIn float64) float64 {
	return math.Round((volumeOut-volumeIn)*1000) / 1000
}

func (s *Server) transfers(ctx context.Context, batchID string) ([]TransferRecord, error) {
	list := []TransferRecord{}
	if e := s.state(ctx, "transfer", "current", &list); e != nil {
		return nil, e
	}
	out := []TransferRecord{}
	for _, tr := range list {
		if batchID == "" || tr.BatchID == batchID {
			tr.Step = stepTransfer(tr.Step)
			out = append(out, tr)
		}
	}
	return out, nil
}

func (s *Server) registerTransfers(register func(string, string, endpoint)) {
	register("GET /api/v1/trace/transfers", "", func(r *http.Request) (any, error) {
		return s.transfers(r.Context(), r.URL.Query().Get("batch_id"))
	})
	register("POST /api/v1/trace/transfers", "transfer.record", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var b struct {
			BatchID    string   `json:"batch_id"`
			FromRef    string   `json:"from_ref"`
			ToRef      string   `json:"to_ref"`
			Step       string   `json:"step"`
			VolumeOutL *float64 `json:"volume_out_l"`
			VolumeInL  *float64 `json:"volume_in_l"`
			Source     string   `json:"source"`
			RecordedAt string   `json:"recorded_at"`
		}
		if e := decode(r, &b); e != nil {
			return nil, e
		}
		if strings.TrimSpace(b.BatchID) == "" {
			return nil, invalid("Batch wajib diisi.", "batch_id")
		}
		if strings.TrimSpace(b.FromRef) == "" {
			return nil, invalid("Alat asal wajib diisi.", "from_ref")
		}
		if strings.TrimSpace(b.ToRef) == "" {
			return nil, invalid("Alat tujuan wajib diisi.", "to_ref")
		}
		step := stepTransfer(b.Step)
		if !langkahTransferValid[step] {
			return nil, invalid("Step transfer tidak dikenal: "+b.Step, "step")
		}
		arrivals, e := s.rtArrivals(r.Context())
		if e != nil {
			return nil, e
		}
		if e := s.validasiRef(r.Context(), b.FromRef, "from_ref", arrivals); e != nil {
			return nil, e
		}
		if e := s.validasiRef(r.Context(), b.ToRef, "to_ref", arrivals); e != nil {
			return nil, e
		}
		if b.VolumeOutL == nil || *b.VolumeOutL < 0 {
			return nil, invalid("Volume keluar tidak boleh negatif.", "volume_out_l")
		}
		if b.VolumeInL == nil || *b.VolumeInL < 0 {
			return nil, invalid("Volume diterima tidak boleh negatif.", "volume_in_l")
		}
		source := b.Source
		if source == "" {
			source = "Manual"
		}
		if source != "Manual" && source != "IoT" {
			return nil, invalid("Sumber catatan harus Manual atau IoT.", "source")
		}
		recordedAt := b.RecordedAt
		if recordedAt == "" {
			recordedAt = formatWaktu(waktuDemo)
		} else if _, e := parseWaktu(recordedAt); e != nil {
			return nil, invalid("Format waktu tidak valid.", "recorded_at")
		}
		var created TransferRecord
		result, e := s.change(r.Context(), "transfer", "current", func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
			list := []TransferRecord{}
			if len(raw) > 0 {
				if e := json.Unmarshal(raw, &list); e != nil {
					return store.Change{}, e
				}
			}
			created = TransferRecord{
				ID:         fmt.Sprintf("TRF-%03d", len(list)+1),
				BatchID:    b.BatchID,
				FromRef:    b.FromRef,
				ToRef:      b.ToRef,
				Step:       step,
				VolumeOutL: *b.VolumeOutL,
				VolumeInL:  *b.VolumeInL,
				SelisihL:   selisihTransfer(*b.VolumeOutL, *b.VolumeInL),
				Source:     source,
				RecordedAt: recordedAt,
			}
			list = append([]TransferRecord{created}, list...)
			return store.Change{Value: list, Event: "transfer.created"}, nil
		})
		if e != nil {
			return nil, e
		}
		out := result.(map[string]any)
		out["result"] = created
		return out, nil
	})
}
