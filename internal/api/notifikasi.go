package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"milkgraph/internal/domain"
	"milkgraph/internal/rules"
	"milkgraph/internal/store"
)

// hrefNotifikasi memetakan awalan id notifikasi ke halaman FE tujuannya,
// mengikuti usulan tim FE: klik notifikasi menavigasi langsung ke halaman
// sumbernya, bukan membuka modal sumber yang bisa gagal menemukan data.
// Awalan di luar peta tidak mendapat href.
func hrefNotifikasi(id string) string {
	switch {
	case strings.HasPrefix(id, "SCH-"):
		return "/penjadwalan"
	case strings.HasPrefix(id, "RT-"):
		return "/kedatangan"
	case strings.HasPrefix(id, "PLAN-"):
		return "/rencana"
	case strings.HasPrefix(id, "HOLD-"):
		return "/receiving"
	case strings.HasPrefix(id, "LAB-"):
		return "/qc-produk"
	}
	return ""
}

// sidikJariNotifikasi: isi notifikasi adalah ringkasan state yang berubah
// mengikuti state, jadi status baca hanya sah selama isi yang ditandai
// dibaca tidak berubah. Sidik jari dihitung dari judul, subjudul, dan tone.
func sidikJariNotifikasi(item map[string]any) string {
	h := sha256.Sum256([]byte(str(item["title"]) + "|" + str(item["subtitle"]) + "|" + str(item["tone"])))
	return hex.EncodeToString(h[:])[:16]
}

// statusBacaNotifikasi adalah dokumen state per akun (kunci dokumen: role
// akun yang masuk): id notifikasi ke sidik jari isinya saat ditandai baca.
type statusBacaNotifikasi struct {
	Reads map[string]string `json:"reads"`
}

func (s *Server) bacaStatusBaca(ctx context.Context, role string) (statusBacaNotifikasi, error) {
	st := statusBacaNotifikasi{Reads: map[string]string{}}
	if role == "" {
		return st, nil
	}
	if e := s.state(ctx, "notification-reads", role, &st); e != nil {
		return st, e
	}
	if st.Reads == nil {
		st.Reads = map[string]string{}
	}
	return st, nil
}

// notifikasiMentah menyusun item notifikasi skenario aktif beserta waktu
// kejadiannya per id: skenario November dari state nyata, skenario lama
// dari seed.
func (s *Server) notifikasiMentah(ctx context.Context) ([]map[string]any, map[string]time.Time, error) {
	if skenarioNovemberAktif() {
		return s.notifikasiNovember(ctx)
	}
	return s.notifikasiLegacy(ctx)
}

// notifikasiLegacy adalah isi lama GET /notifications untuk skenario seed
// (bukan November), dipindah apa adanya dari dynamic.go. Waktunya mengikuti
// jam snapshot skenario itu, 14.42.
func (s *Server) notifikasiLegacy(ctx context.Context) ([]map[string]any, map[string]time.Time, error) {
	l, e := s.limits(ctx)
	if e != nil {
		return nil, nil, e
	}
	p, e := s.rulePlan("current")
	if e != nil {
		return nil, nil, e
	}
	c := rules.EvaluateResult(p, l)
	var d domain.PlanDecision
	if e = s.state(ctx, "decision", "current", &d); e != nil {
		return nil, nil, e
	}
	sub := fmt.Sprintf("%d constraint dilanggar · starvation %d menit", c.Violations.Before, c.Starvation.Before)
	tone := "crit"
	if d.Status == "approved" {
		sub = "Rekomendasi disetujui · RT-26 dialihkan ke Bay 1"
		tone = "ok"
	}
	items := []map[string]any{
		{"id": "PLAN-FIFO", "title": "Rencana shift tidak layak", "subtitle": sub, "sourceId": "PLAN-FIFO", "tone": tone},
		{"id": "HOLD-RT26", "title": "RT-26 mendekati batas holding time", "subtitle": fmt.Sprintf("Tersisa %dj %02dm · menunggu bay", c.HoldingLeft/60, c.HoldingLeft%60), "sourceId": "HOLD-RT26", "tone": "crit"},
		{"id": "LAB-8812", "title": "QC FG out-of-spec FG-1013-07", "subtitle": "Residu antibiotik · jalankan trace", "sourceId": "LAB-8812", "tone": "crit"},
	}
	waktu := time.Date(2026, 10, 14, 14, 42, 0, 0, time.FixedZone("WIB", 7*60*60))
	times := map[string]time.Time{}
	for _, it := range items {
		times[str(it["id"])] = waktu
	}
	return items, times, nil
}

// daftarNotifikasi menghias item mentah dengan href tujuan klik, waktu
// kejadian (created_at ISO dan at HH.MM WIB), dan status baca akun
// pemanggil, lalu mengembalikannya sebagai respons GET /notifications.
func (s *Server) daftarNotifikasi(r *http.Request) (any, error) {
	ctx := r.Context()
	items, times, e := s.notifikasiMentah(ctx)
	if e != nil {
		return nil, e
	}
	role := ""
	if a, e := s.authenticate(r); e == nil && a != nil {
		role = a.Role
	}
	st, e := s.bacaStatusBaca(ctx, role)
	if e != nil {
		return nil, e
	}
	for _, it := range items {
		id := str(it["id"])
		if href := hrefNotifikasi(id); href != "" {
			it["href"] = href
		}
		if t, ok := times[id]; ok {
			it["created_at"] = t.Format(time.RFC3339)
			it["at"] = t.Format("15.04")
		}
		it["read"] = st.Reads[id] == sidikJariNotifikasi(it)
	}
	return items, nil
}

// tandaiNotifikasiDibaca menyimpan status baca akun pemanggil (satu item,
// atau semua item aktif bila all) lalu mengembalikan daftar terbaru supaya
// FE dapat langsung memakai keadaan sesudahnya tanpa muat ulang terpisah.
func (s *Server) tandaiNotifikasiDibaca(r *http.Request, id string, all bool) (any, error) {
	if e := s.dbRequired(); e != nil {
		return nil, e
	}
	a, e := s.authenticate(r)
	if e != nil {
		return nil, e
	}
	items, _, e := s.notifikasiMentah(r.Context())
	if e != nil {
		return nil, e
	}
	target := map[string]string{}
	for _, it := range items {
		iid := str(it["id"])
		if all || iid == id {
			target[iid] = sidikJariNotifikasi(it)
		}
	}
	if len(target) == 0 {
		return nil, missing()
	}
	_, e = s.change(r.Context(), "notification-reads", a.Role, func(tx *store.Tx, raw json.RawMessage) (store.Change, error) {
		st := statusBacaNotifikasi{Reads: map[string]string{}}
		if len(raw) > 0 {
			if e := json.Unmarshal(raw, &st); e != nil {
				return store.Change{}, e
			}
			if st.Reads == nil {
				st.Reads = map[string]string{}
			}
		}
		for k, v := range target {
			st.Reads[k] = v
		}
		return store.Change{Value: st, Event: "notification.read"}, nil
	})
	if e != nil {
		return nil, e
	}
	daftar, e := s.daftarNotifikasi(r)
	if e != nil {
		return nil, e
	}
	return map[string]any{"result": daftar, "log": nil}, nil
}

func (s *Server) registerNotifikasi(register func(string, string, endpoint)) {
	register("POST /api/v1/notifications/{id}/read", "", func(r *http.Request) (any, error) {
		if e := decodeOptional(r, &struct{}{}); e != nil {
			return nil, e
		}
		return s.tandaiNotifikasiDibaca(r, r.PathValue("id"), false)
	})
	register("POST /api/v1/notifications/read-all", "", func(r *http.Request) (any, error) {
		if e := decodeOptional(r, &struct{}{}); e != nil {
			return nil, e
		}
		return s.tandaiNotifikasiDibaca(r, "", true)
	})
}
