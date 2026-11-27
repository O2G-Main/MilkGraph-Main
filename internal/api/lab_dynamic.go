package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"milkgraph/internal/domain"
	"milkgraph/internal/store"
)

type LabParamInput struct {
	Name   string  `json:"name"`
	Value  string  `json:"value"`
	Limit  string  `json:"limit"`
	OK     *bool   `json:"ok"`
	Sample *string `json:"sample,omitempty"`
}

func (s *Server) ensureLabSeeded(ctx context.Context) error {
	var count int
	if err := s.DB.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM milkgraph.lab_results`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	saved := map[string]map[string]any{}
	rows, err := s.DB.List(ctx, "lab")
	if err == nil {
		for _, raw := range rows {
			var m map[string]any
			if json.Unmarshal(raw, &m) == nil {
				saved[str(m["id"])] = m
			}
		}
	}
	for _, v := range arr(s.seeds.Ops["labResults"]) {
		m := clone(obj(v))
		if x, ok := saved[str(m["id"])]; ok {
			m = x
		}
		paramsJSON, _ := json.Marshal(m["params"])
		var decisionJSON []byte
		if m["decision"] != nil {
			decisionJSON, _ = json.Marshal(m["decision"])
		}
		var eta *string
		if str(m["eta"]) != "" {
			e := str(m["eta"])
			eta = &e
		}
		_, err := s.DB.Pool.Exec(ctx,
			`INSERT INTO milkgraph.lab_results (id, kind, subject, detail, status, params, decision, eta)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
			str(m["id"]), str(m["kind"]), str(m["subject"]), str(m["detail"]), str(m["status"]), paramsJSON, decisionJSON, eta)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) labResultsFromDB(ctx context.Context) ([]map[string]any, error) {
	if s.DB == nil {
		out := []map[string]any{}
		for _, v := range arr(s.seeds.Ops["labResults"]) {
			m := clone(obj(v))
			if str(m["status"]) == "uji-ulang" {
				m["eta"] = "15.30"
			}
			out = append(out, m)
		}
		return out, nil
	}
	if err := s.ensureLabSeeded(ctx); err != nil {
		return nil, err
	}
	rows, err := s.DB.Pool.Query(ctx, `SELECT id, kind, subject, detail, status, params, decision, eta FROM milkgraph.lab_results ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, kind, subject, detail, status string
		var paramsRaw, decisionRaw []byte
		var eta *string
		if err := rows.Scan(&id, &kind, &subject, &detail, &status, &paramsRaw, &decisionRaw, &eta); err != nil {
			return nil, err
		}
		var params any
		_ = json.Unmarshal(paramsRaw, &params)
		if params == nil {
			params = []any{}
		}
		m := map[string]any{
			"id":      id,
			"kind":    kind,
			"subject": subject,
			"detail":  detail,
			"status":  status,
			"params":  params,
		}
		if len(decisionRaw) > 0 && string(decisionRaw) != "null" {
			var dec any
			if json.Unmarshal(decisionRaw, &dec) == nil && dec != nil {
				m["decision"] = dec
			}
		}
		if eta != nil && *eta != "" {
			m["eta"] = *eta
		} else if status == "uji-ulang" {
			m["eta"] = "15.30"
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func computeLabStatus(params []LabParamInput, requested string) string {
	if requested == "uji-ulang" {
		return "uji-ulang"
	}
	for _, p := range params {
		if p.OK != nil && !*p.OK {
			return "positif"
		}
	}
	if len(params) > 0 {
		allDone := true
		for _, p := range params {
			if p.OK == nil {
				allDone = false
				break
			}
		}
		if allDone {
			return "hasil-siap"
		}
	}
	return "dalam-uji"
}

func (s *Server) registerLabDynamic(register func(string, string, endpoint)) {
	register("POST /api/v1/lab/results", "lab.decide", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		var b struct {
			Kind    string          `json:"kind"`
			Subject string          `json:"subject"`
			Detail  string          `json:"detail"`
			Params  []LabParamInput `json:"params"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		kind := strings.TrimSpace(b.Kind)
		if kind != "penerimaan" && kind != "batch" && kind != "qc-fg" {
			return nil, invalid("Jenis sampel harus penerimaan, batch, atau qc-fg.", "kind")
		}
		subject := strings.TrimSpace(b.Subject)
		if subject == "" {
			return nil, invalid("Subjek sampel wajib diisi.", "subject")
		}
		if len(b.Params) == 0 {
			return nil, invalid("Minimal 1 parameter uji wajib diisi.", "params")
		}
		if err := s.ensureLabSeeded(r.Context()); err != nil {
			return nil, err
		}
		id := fmt.Sprintf("LAB-%d", time.Now().UnixMilli()%1000000)
		status := computeLabStatus(b.Params, "")
		paramsJSON, _ := json.Marshal(b.Params)
		_, err := s.DB.Pool.Exec(r.Context(),
			`INSERT INTO milkgraph.lab_results (id, kind, subject, detail, status, params) VALUES ($1, $2, $3, $4, $5, $6)`,
			id, kind, subject, strings.TrimSpace(b.Detail), status, paramsJSON)
		if err != nil {
			return nil, err
		}
		a, _ := s.authenticate(r)
		res := map[string]any{"id": id, "kind": kind, "subject": subject, "detail": strings.TrimSpace(b.Detail), "status": status, "params": b.Params}
		_, _ = s.change(r.Context(), "lab-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
			return store.Change{Value: res, Log: auditEntry(a, "lab", "Sampel lab baru "+subject, id, b.Detail, "ok"), Event: "lab.created"}, nil
		})
		return res, nil
	})

	register("PUT /api/v1/lab/results/{id}", "lab.decide", func(r *http.Request) (any, error) {
		if err := s.dbRequired(); err != nil {
			return nil, err
		}
		id := r.PathValue("id")
		var b struct {
			Params []LabParamInput `json:"params"`
			Status string          `json:"status"`
			Detail *string         `json:"detail"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		if err := s.ensureLabSeeded(r.Context()); err != nil {
			return nil, err
		}
		var kind, subject, detail, curStatus string
		var paramsRaw []byte
		err := s.DB.Pool.QueryRow(r.Context(), `SELECT kind, subject, detail, status, params FROM milkgraph.lab_results WHERE id = $1`, id).
			Scan(&kind, &subject, &detail, &curStatus, &paramsRaw)
		if err != nil {
			return nil, missing()
		}
		if b.Detail != nil {
			detail = strings.TrimSpace(*b.Detail)
		}
		params := b.Params
		if len(params) == 0 {
			_ = json.Unmarshal(paramsRaw, &params)
		}
		nextStatus := computeLabStatus(params, b.Status)
		paramsJSON, _ := json.Marshal(params)
		_, err = s.DB.Pool.Exec(r.Context(),
			`UPDATE milkgraph.lab_results SET detail = $2, status = $3, params = $4, updated_at = now() WHERE id = $1`,
			id, detail, nextStatus, paramsJSON)
		if err != nil {
			return nil, err
		}
		a, _ := s.authenticate(r)
		res := map[string]any{"id": id, "kind": kind, "subject": subject, "detail": detail, "status": nextStatus, "params": params}
		_, _ = s.change(r.Context(), "lab-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
			return store.Change{Value: res, Log: auditEntry(a, "lab", "Hasil lab "+subject+" diperbarui", id, nextStatus, "neutral"), Event: "lab.updated"}, nil
		})
		return res, nil
	})
}

func (s *Server) decideLabDynamic(r *http.Request) (any, error) {
	if err := s.dbRequired(); err != nil {
		return nil, err
	}
	if err := s.ensureLabSeeded(r.Context()); err != nil {
		return nil, err
	}
	id := r.PathValue("id")
	var kind, subject, detail, status string
	var paramsRaw, decRaw []byte
	err := s.DB.Pool.QueryRow(r.Context(), `SELECT kind, subject, detail, status, params, decision FROM milkgraph.lab_results WHERE id = $1`, id).
		Scan(&kind, &subject, &detail, &status, &paramsRaw, &decRaw)
	if err != nil {
		return nil, missing()
	}
	if len(decRaw) > 0 && string(decRaw) != "null" {
		return nil, conflict()
	}
	var b decisionBody
	if err := decode(r, &b); err != nil {
		return nil, err
	}
	if b.Status != "dirilis" && b.Status != "ditolak" {
		return nil, invalid("Status harus dirilis atau ditolak.", "status")
	}
	if err := noteValid(b.Note, b.Status == "ditolak"); err != nil {
		return nil, err
	}
	if kind != "penerimaan" && kind != "qc-fg" && kind != "batch" {
		return nil, invalid("Jenis sampel tidak valid untuk keputusan.", "kind")
	}
	if status == "uji-ulang" && b.Status == "dirilis" {
		return nil, invalid("Rilis menunggu hasil uji ulang.", "status")
	}
	if status != "hasil-siap" && status != "uji-ulang" && status != "positif" {
		return nil, invalid("Hasil lab belum siap atau sudah selesai.", "status")
	}
	a, _ := s.authenticate(r)
	dec := domain.LabDecision{Status: b.Status, Note: b.Note, By: a.Name, At: time.Now().In(zonaAplikasi()).Format("15.04")}
	decJSON, _ := json.Marshal(dec)
	nextStatus := status
	if b.Status == "dirilis" {
		nextStatus = "lulus"
	} else {
		nextStatus = "positif"
	}
	_, err = s.DB.Pool.Exec(r.Context(),
		`UPDATE milkgraph.lab_results SET decision = $2, status = $3, updated_at = now() WHERE id = $1`,
		id, decJSON, nextStatus)
	if err != nil {
		return nil, err
	}
	var params any
	_ = json.Unmarshal(paramsRaw, &params)
	view := map[string]any{"id": id, "kind": kind, "subject": subject, "detail": detail, "status": nextStatus, "params": params, "decision": dec}
	tone := "ok"
	if b.Status == "ditolak" {
		tone = "crit"
	}
	_, _ = s.change(r.Context(), "lab-event", "latest", func(_ *store.Tx, _ json.RawMessage) (store.Change, error) {
		return store.Change{Value: view, Log: auditEntry(a, "lab", fmt.Sprintf("Hasil lab %s %s", subject, b.Status), id, b.Note, tone), Event: "lab.decided"}, nil
	})
	return map[string]any{"result": view}, nil
}
