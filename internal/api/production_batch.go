package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"milkgraph/internal/store"
)

func (s *Server) registerProductionBatch(register func(string, string, endpoint)) {
	// Query Produksi harian (Contract: date opsional, default tanggal operasional aktif)
	register("GET /api/v1/production/daily", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		date := strings.TrimSpace(r.URL.Query().Get("date"))
		resolvedDate, rows, err := s.DB.ListProductionDaily(r.Context(), date)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"production_date": resolvedDate,
			"count":           len(rows),
			"batches":         rows,
		}, nil
	})

	// Query Jadwal Produksi (Contract: urut production_date & sequence_no)
	register("GET /api/v1/production/schedule", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		date := strings.TrimSpace(r.URL.Query().Get("date"))
		batchID := strings.TrimSpace(r.URL.Query().Get("batch_id"))
		rows, err := s.DB.ListProductionSchedule(r.Context(), date, batchID)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count": len(rows),
			"items": rows,
		}, nil
	})

	// Create Batch Produksi harian dengan validasi rules & batch_code_rules
	register("POST /api/v1/production/batches", "plan.decide", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var body store.CreateBatchInput
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if len(body.Lines) == 0 {
			return nil, invalid("Minimal 1 baris batch wajib diisi.", "lines")
		}
		created, err := s.DB.CreateBatch(r.Context(), body)
		if err != nil {
			return nil, invalid(err.Error(), "lines")
		}
		return created, nil
	})

	// Query trace batch by batch_id path param
	register("GET /api/v1/production/batches/{id}/trace", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		res, err := s.DB.GetBatchTrace(r.Context(), r.PathValue("id"), "")
		if errors.Is(err, store.ErrNotFound) {
			return nil, missing()
		}
		if err != nil {
			return nil, err
		}
		return res, nil
	})

	// Query trace batch by batch_id or production_group_id query param
	register("GET /api/v1/production/trace", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		batchID := strings.TrimSpace(r.URL.Query().Get("batch_id"))
		groupID := strings.TrimSpace(r.URL.Query().Get("production_group_id"))
		if batchID == "" && groupID == "" {
			return nil, invalid("Parameter batch_id atau production_group_id wajib diisi.", "batch_id")
		}
		res, err := s.DB.GetBatchTrace(r.Context(), batchID, groupID)
		if errors.Is(err, store.ErrNotFound) {
			return nil, missing()
		}
		if err != nil {
			return nil, err
		}
		return res, nil
	})

	// Query Alat (Contract: baca assets + asset_current_status_view, kecualikan PIPE-01..PIPE-10 secara default)
	register("GET /api/v1/production/assets", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		q := r.URL.Query()
		includePipes := q.Get("include_pipes") == "true"
		rows, err := s.DB.ListAssets(r.Context(), store.AssetFilter{
			AssetType:    strings.TrimSpace(q.Get("asset_type")),
			Status:       strings.TrimSpace(q.Get("status")),
			Search:       strings.TrimSpace(q.Get("search")),
			IncludePipes: includePipes,
		})
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count": len(rows),
			"items": rows,
		}, nil
	})

	// Record asset status event
	register("POST /api/v1/production/assets/{id}/status", "downtime.record", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var body struct {
			Status string `json:"status"`
			Reason string `json:"status_reason"`
			Source string `json:"source"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		if strings.TrimSpace(body.Status) == "" {
			return nil, invalid("Status alat wajib diisi.", "status")
		}
		err := s.DB.RecordAssetStatus(r.Context(), r.PathValue("id"), strings.TrimSpace(body.Status), strings.TrimSpace(body.Reason), strings.TrimSpace(body.Source))
		if errors.Is(err, store.ErrNotFound) {
			return nil, missing()
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "asset_id": r.PathValue("id"), "status": body.Status}, nil
	})

	// Query Produk (Contract: pisahkan products, finished_skus, pack_size_codes, product_pack_sizes, product_market_variants)
	register("GET /api/v1/production/products", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		q := r.URL.Query()
		res, err := s.DB.ListProducts(r.Context(), store.ProductFilter{
			ProductFamily: strings.TrimSpace(q.Get("product_family")),
			PackSizeCode:  strings.TrimSpace(q.Get("pack_size_code")),
			MarketVariant: strings.TrimSpace(q.Get("market_variant")),
			Search:        strings.TrimSpace(q.Get("search")),
		})
		if err != nil {
			return nil, err
		}
		return res, nil
	})

	// Query Rencana mingguan -> batch harian
	register("GET /api/v1/production/plans", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		q := r.URL.Query()
		week := 0
		if w := strings.TrimSpace(q.Get("week")); w != "" {
			parsed, err := strconv.Atoi(w)
			if err != nil || parsed < 0 {
				return nil, invalid("Parameter week harus angka positif.", "week")
			}
			week = parsed
		}
		rows, err := s.DB.ListWeeklyPlans(r.Context(), week, strings.TrimSpace(q.Get("from")), strings.TrimSpace(q.Get("to")))
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count": len(rows),
			"items": rows,
		}, nil
	})

	// Query Prediksi pemenuhan
	register("GET /api/v1/production/predictions", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		q := r.URL.Query()
		rows, err := s.DB.ListFulfillmentPredictions(r.Context(), strings.TrimSpace(q.Get("date")), strings.TrimSpace(q.Get("batch_id")))
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count": len(rows),
			"items": rows,
		}, nil
	})

	// Run Prediksi pemenuhan & generate rekomendasi
	register("POST /api/v1/production/predictions/run", "plan.decide", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var body struct {
			ProductionDate string `json:"production_date"`
			BatchID        string `json:"batch_id"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		rows, err := s.DB.RunFulfillmentPrediction(r.Context(), strings.TrimSpace(body.ProductionDate), strings.TrimSpace(body.BatchID))
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count":       len(rows),
			"predictions": rows,
		}, nil
	})

	// Query Rekomendasi
	register("GET /api/v1/production/recommendations", "", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		q := r.URL.Query()
		rows, err := s.DB.ListRecommendations(r.Context(), strings.TrimSpace(q.Get("date")), strings.TrimSpace(q.Get("batch_id")))
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"count": len(rows),
			"items": rows,
		}, nil
	})

	// Update status rekomendasi
	register("PATCH /api/v1/production/recommendations/{id}", "plan.decide", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil || id <= 0 {
			return nil, invalid("ID rekomendasi tidak valid.", "id")
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := decode(r, &body); err != nil {
			return nil, err
		}
		switch body.Status {
		case "draft", "accepted", "rejected", "applied":
		default:
			return nil, invalid("Status harus draft, accepted, rejected, atau applied.", "status")
		}
		if err := s.DB.UpdateRecommendationStatus(r.Context(), id, body.Status); errors.Is(err, store.ErrNotFound) {
			return nil, missing()
		} else if err != nil {
			return nil, err
		}
		return map[string]any{"ok": true, "id": id, "status": body.Status}, nil
	})
}
