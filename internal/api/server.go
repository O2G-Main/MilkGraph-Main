package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"milkgraph/docs"
	"milkgraph/internal/ai"
	"milkgraph/internal/graph"
	"milkgraph/internal/sse"
	"milkgraph/internal/store"
	"milkgraph/internal/telemetry"
	"milkgraph/internal/trace"
	"milkgraph/seed/master"
)

type Server struct {
	Mode        string
	DB          *store.DB
	Hub         *sse.Hub
	JWTSecret   string
	JWTIssuer   string
	JWTAudience string
	Origins     []string
	AI          *ai.Client
	seeds       *SeedData
	dyn         *DynamicState
	trace       *trace.Service
	graph       *graph.Service
	master      *master.Catalog
}
type endpoint func(*http.Request) (any, error)
type apiError struct {
	status               int
	code, message, field string
}

func (e *apiError) Error() string         { return e.message }
func invalid(message, field string) error { return &apiError{422, "VALIDATION", message, field} }
func conflict() error                     { return &apiError{409, "CONFLICT", "Keputusan atau pengajuan sudah ada.", ""} }
func missing() error                      { return &apiError{404, "NOT_FOUND", "Data tidak ditemukan.", ""} }
func writeJSON(w http.ResponseWriter, status int, value any) {
	body, err := json.Marshal(value)
	if err != nil {
		status = 500
		body = []byte(`{"error":{"code":"INTERNAL","message":"Kesalahan internal."}}`)
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(append(body, '\n'))
}
func fail(w http.ResponseWriter, err error) {
	e := &apiError{500, "INTERNAL", "Kesalahan internal.", ""}
	if !errors.As(err, &e) {
		slog.Error("request failed", "error", err)
		telemetry.CaptureError(err)
		e = &apiError{500, "INTERNAL", "Kesalahan internal.", ""}
	}
	detail := map[string]any{"code": e.code, "message": e.message}
	if e.field != "" {
		detail["field"] = e.field
	}
	writeJSON(w, e.status, map[string]any{"error": detail})
}
func decode(r *http.Request, value any) error {
	if r.Header.Get("Content-Type") != "" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return &apiError{415, "BAD_REQUEST", "Content-Type harus application/json.", ""}
	}
	d := json.NewDecoder(io.LimitReader(r.Body, 65537))
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return &apiError{400, "BAD_REQUEST", "JSON tidak valid.", ""}
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return &apiError{400, "BAD_REQUEST", "Hanya satu objek JSON diizinkan.", ""}
	}
	return nil
}
func clone[T any](v T) T { b, _ := json.Marshal(v); var out T; _ = json.Unmarshal(b, &out); return out }
func arr(v any) []any {
	a, _ := v.([]any)
	if a == nil {
		return []any{}
	}
	return a
}
func obj(v any) map[string]any {
	m, _ := v.(map[string]any)
	if m == nil {
		return map[string]any{}
	}
	return m
}
func str(v any) string { s, _ := v.(string); return s }
func num(v any) int    { n, _ := v.(float64); return int(n) }
func item(list any, id string) map[string]any {
	for _, x := range arr(list) {
		m := obj(x)
		if str(m["id"]) == id {
			return clone(m)
		}
	}
	return nil
}
func (s *Server) Handler() http.Handler {
	seeds, err := LoadAllSeeds()
	if err != nil {
		panic(err)
	}
	s.seeds = seeds
	s.trace, err = trace.New()
	if err != nil {
		panic(err)
	}
	s.graph, err = graph.New()
	if err != nil {
		panic(err)
	}
	s.master, err = master.Load(master.Files)
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	register := func(pattern, perm string, f endpoint) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			if _, err := s.authenticate(r); err != nil {
				fail(w, err)
				return
			}
			if perm != "" {
				if err := s.authorize(r, perm); err != nil {
					fail(w, err)
					return
				}
			}
			value, err := f(r)
			if err != nil {
				fail(w, err)
				return
			}
			status := 200
			if r.Method == "POST" && r.URL.Path == "/api/v1/holds" {
				status = 201
				w.Header().Set("Location", "/api/v1/holds/"+str(obj(obj(value)["result"])["id"]))
			}
			writeJSON(w, status, value)
		})
	}
	mux.HandleFunc("GET /api/v1/meta", s.handleMeta)
	mux.HandleFunc("GET /openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
		w.WriteHeader(200)
		_, _ = w.Write(docs.OpenAPIYAML)
	})
	mux.HandleFunc("GET /docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(swaggerUIHTML))
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]any{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if s.DB == nil {
			fail(w, &apiError{503, "UNAVAILABLE", "Database tidak tersedia.", ""})
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.DB.Pool.Ping(ctx); err != nil {
			fail(w, &apiError{503, "UNAVAILABLE", "Database tidak tersedia.", ""})
			return
		}
		writeJSON(w, 200, map[string]any{"status": "ready"})
	})
	static := map[string]any{
		"/sources": seeds.Scenario["sources"], "/assets": seeds.Scenario["assets"],
		"/assets/cip-log": seeds.Ops["cipLog"], "/assets/cip-policy": map[string]any{"tankIntervalHours": 24}, "/assets/mid-tanks": seeds.Ops["midTanks"],
		"/production/fillers": seeds.Ops["fillers"], "/production/aseptic-tanks": seeds.Ops["asepticTanks"], "/production/unit-states": seeds.Ops["UNIT_STATE"], "/production/changeover-matrix": seeds.Ops["changeoverMatrix"],
		"/supply/trend": seeds.Ops["trend"], "/quality/active-event": seeds.Scenario["qcEvent"],
		"/site/layout": seeds.Site["layout"], "/holds/summary": map[string]any{"baseline": seeds.Scenario["holdBaseline"]},
	}
	for path, value := range static {
		register("GET /api/v1"+path, "", func(r *http.Request) (any, error) { return value, nil })
	}
	register("GET /api/v1/master", "", func(r *http.Request) (any, error) { return s.master.Summary(), nil })
	register("GET /api/v1/master/assets", "", func(r *http.Request) (any, error) { return s.master.Assets(), nil })
	register("GET /api/v1/master/connections", "", func(r *http.Request) (any, error) { return s.master.Connections(), nil })
	register("GET /api/v1/master/topology", "", func(r *http.Request) (any, error) { return s.master.Topology(), nil })
	register("GET /api/v1/master/products", "", func(r *http.Request) (any, error) { return s.master.Products(), nil })
	register("GET /api/v1/master/finished-skus", "", func(r *http.Request) (any, error) { return s.master.FinishedSKUs(), nil })
	register("GET /api/v1/master/lines", "", func(r *http.Request) (any, error) { return s.master.Lines(), nil })
	register("GET /api/v1/master/rules", "", func(r *http.Request) (any, error) { return s.master.Rules(), nil })
	register("POST /api/v1/master/changeover/classify", "", func(r *http.Request) (any, error) {
		var b struct {
			From string `json:"from"`
			To   string `json:"to"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		if b.From == "" || b.To == "" {
			return nil, invalid("Parameter from dan to wajib diisi.", "from")
		}
		res, err := s.master.ClassifyChangeover(b.From, b.To)
		if err != nil {
			return nil, invalid(err.Error(), "from")
		}
		return res, nil
	})
	register("GET /api/v1/graph", "", func(r *http.Request) (any, error) { return s.graph.View(), nil })
	register("GET /api/v1/graph/subgraph", "", func(r *http.Request) (any, error) {
		node := r.URL.Query().Get("node")
		depthStr := r.URL.Query().Get("depth")
		depth := 1
		if depthStr != "" {
			if d, err := strconv.Atoi(depthStr); err == nil {
				depth = d
			} else {
				return nil, invalid("Parameter depth harus angka.", "depth")
			}
		}
		v, err := s.graph.Subgraph(node, depth)
		if err != nil {
			if errors.Is(err, graph.ErrNotFound) {
				return nil, missing()
			}
			return nil, invalid(err.Error(), "depth")
		}
		return v, nil
	})
	register("GET /api/v1/session", "", func(r *http.Request) (any, error) {
		a, err := s.authenticate(r)
		if err != nil {
			return nil, err
		}
		// Sesi membaca registri role Tahap 3 agar role baru dan role
		// kustom juga mendapat daftar permission yang benar.
		reg, err := s.roleRegistry(r.Context())
		if err != nil {
			return nil, err
		}
		rec, ok := cariRole(reg, a.Role)
		if !ok {
			return nil, &apiError{401, "UNAUTHENTICATED", "Role tidak valid.", ""}
		}
		label, _, initials := displayRole(rec)
		permissions, err := s.permissionsOf(r.Context(), a.Role)
		if err != nil {
			return nil, err
		}
		if permissions == nil {
			permissions = []string{}
		}
		return map[string]any{"user": map[string]any{"name": a.Name, "role": label, "initials": initials, "shift": "Shift Siang"}, "role": a.Role, "permissions": permissions}, nil
	})
	register("GET /api/v1/shifts", "", func(r *http.Request) (any, error) {
		// Shift terpilih mengikuti tanggal jangkar skenario aktif.
		hari := []string{"Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"}
		bulan := []string{"", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}
		tanggal := fmt.Sprintf("%s %d %s", hari[int(waktuDemo.Weekday())], waktuDemo.Day(), bulan[int(waktuDemo.Month())])
		return []any{map[string]any{"id": waktuDemo.Format("2006-01-02") + "-siang", "label": "Shift Siang", "window": "14.00 - 22.00", "date": tanggal, "selected": true, "available": true}}, nil
	})
	register("GET /api/v1/sources/{id}", "", func(r *http.Request) (any, error) {
		v := item(seeds.Scenario["sources"], r.PathValue("id"))
		if v == nil {
			return nil, missing()
		}
		return v, nil
	})
	register("GET /api/v1/plans", "", func(r *http.Request) (any, error) {
		res := []any{}
		for _, p := range arr(seeds.Scenario["plans"]) {
			res = append(res, s.planView(obj(p)))
		}
		return res, nil
	})
	register("GET /api/v1/plans/{id}", "", func(r *http.Request) (any, error) {
		p := s.plan(r.PathValue("id"))
		if p == nil {
			return nil, missing()
		}
		return s.planView(p), nil
	})
	register("GET /api/v1/limits/schema", "", func(r *http.Request) (any, error) { return s.limitSchema(), nil })
	register("GET /api/v1/supply/demand-plan", "", func(r *http.Request) (any, error) {
		return s.demandPlanData(r.Context())
	})
	register("GET /api/v1/assistant/templates", "", func(r *http.Request) (any, error) { return s.trace.Templates(), nil })
	register("POST /api/v1/assistant/ask", "", func(r *http.Request) (any, error) {
		var b struct {
			Question string `json:"question"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		if len(strings.TrimSpace(b.Question)) == 0 || len([]rune(b.Question)) > 1000 {
			return nil, invalid("Pertanyaan wajib 1-1000 karakter.", "question")
		}
		a := s.trace.Ask(b.Question)
		s.lampirkanNarasiAI(r.Context(), a)
		return a, nil
	})
	register("POST /api/v1/assistant/narrate", "", func(r *http.Request) (any, error) {
		var b struct {
			BatchID string `json:"batch_id"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		return s.narasiAI(r.Context(), strings.TrimSpace(b.BatchID))
	})
	register("POST /api/v1/assistant/chat", "", func(r *http.Request) (any, error) {
		var b struct {
			Question string `json:"question"`
		}
		if err := decode(r, &b); err != nil {
			return nil, err
		}
		q := strings.TrimSpace(b.Question)
		if len(q) == 0 || len([]rune(q)) > 1000 {
			return nil, invalid("Pertanyaan wajib 1-1000 karakter.", "question")
		}
		return s.chatAI(r.Context(), q)
	})
	register("GET /api/v1/trace/backward", "", func(r *http.Request) (any, error) {
		v, e := s.trace.Backward(r.URL.Query().Get("lotId"))
		if e != nil {
			return nil, missing()
		}
		return v, nil
	})
	register("GET /api/v1/trace/forward", "", func(r *http.Request) (any, error) {
		v, e := s.trace.Forward(r.URL.Query().Get("rtId"), r.URL.Query().Get("date"))
		if e != nil {
			return nil, missing()
		}
		return v, nil
	})
	register("GET /api/v1/trace/explain", "", func(r *http.Request) (any, error) {
		v, e := s.trace.Explain(r.URL.Query().Get("resource"), r.URL.Query().Get("time"))
		if e != nil {
			return nil, missing()
		}
		return v, nil
	})
	register("GET /api/v1/trace/handoffs", "", func(r *http.Request) (any, error) {
		v, e := s.trace.Handoffs(r.URL.Query().Get("lotId"))
		if e != nil {
			return nil, missing()
		}
		return v, nil
	})
	register("GET /api/v1/lots/locations", "", func(r *http.Request) (any, error) {
		ids := strings.Split(r.URL.Query().Get("ids"), ",")
		if len(ids) > 100 {
			return nil, invalid("Maksimal 100 lot.", "ids")
		}
		res := map[string]any{}
		for _, id := range ids {
			v, ok := obj(seeds.Ops["lotLocation"])[id]
			if !ok {
				return nil, missing()
			}
			res[id] = v
		}
		return res, nil
	})
	s.registerDynamic(register, mux)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { fail(w, missing()) })
	return s.middleware(mux)
}

// namaHariID dan namaBulanID adalah nama hari dan bulan Bahasa Indonesia
// untuk format tanggal meta, mengikuti pola tanggal pada seed skenario
// (misalnya "Rabu, 14 Oktober 2026").
var namaHariID = []string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}

var namaBulanID = []string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

// zonaAplikasi adalah zona waktu yang dipakai aplikasi (WIB, UTC+7),
// konsisten dengan FixedZone WIB di rt_arrivals.go. Asia/Jakarta dipakai
// bila data zonanya tersedia; selain itu zona tetap +07:00.
func zonaAplikasi() *time.Location {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.FixedZone("WIB", 7*60*60)
}

// labelDataTermuat mengumpulkan label data yang benar-benar termuat dari
// seed. Sejak migrasi skenario aktif (keputusan D8), label utama adalah
// label skenario aktif November, yaitu "historis"; label "simulasi"
// tetap tercatat sebagai label berkas kasus FG-1013-07 yang termuat di
// sampingnya. Pada mode rollback urutannya kembali seperti sebelum
// migrasi: "simulasi" lebih dulu.
func (s *Server) labelDataTermuat() []string {
	labels := []string{"simulasi"}
	if skenarioNovemberAktif() {
		labels = []string{}
	}
	tambah := func(seed map[string]any) {
		l, _ := seed["label_data"].(string)
		if l == "" {
			return
		}
		for _, ada := range labels {
			if ada == l {
				return
			}
		}
		labels = append(labels, l)
	}
	if s.seeds != nil {
		tambah(s.seeds.SkenarioNov)
		if skenarioNovemberAktif() {
			// Label kasus menyusul label utama skenario aktif.
			tambah(map[string]any{"label_data": "simulasi"})
		}
		tambah(s.seeds.NeracaHarian)
		tambah(s.seeds.TraceHistoris)
	}
	return labels
}

func (s *Server) handleMeta(w http.ResponseWriter, r *http.Request) {
	mode := s.Mode
	if mode == "" {
		mode = "demo"
	}
	// Tanggal dan jam adalah waktu server sebenarnya dalam zona aplikasi,
	// bukan jam skenario. Meta adalah keterangan keadaan server, jadi
	// tanggal karangan membuat tampilannya menipu.
	sekarang := time.Now().In(zonaAplikasi())
	jam := sekarang.Format("15.04")
	tanggal := fmt.Sprintf("%s, %d %s %d", namaHariID[int(sekarang.Weekday())], sekarang.Day(), namaBulanID[int(sekarang.Month())], sekarang.Year())
	// nowOffset adalah posisi jam sekarang di dalam horizon tampil
	// skenario (13.00 sampai 20.00), dijepit ke rentang horizon supaya
	// penanda sekarang di FE tidak keluar jalur.
	offset := sekarang.Hour()*60 + sekarang.Minute() - 13*60
	if offset < 0 {
		offset = 0
	}
	if offset > 7*60 {
		offset = 7 * 60
	}
	labels := s.labelDataTermuat()
	dataMode := labels[0]
	if len(labels) > 1 && !skenarioNovemberAktif() {
		dataMode = "campuran"
	}
	writeJSON(w, 200, map[string]any{
		"schemaVersion": "1",
		"mode":          mode,
		"dataMode":      dataMode,
		"dataLabels":    labels,
		"date":          tanggal,
		"now":           jam,
		"horizon":       map[string]any{"start": "13.00", "end": "20.00", "nowOffset": offset},
		"snapshotLabel": "Snapshot " + jam + " WIB",
	})
}
func (s *Server) plan(id string) map[string]any { return item(s.seeds.Scenario["plans"], id) }
func (s *Server) planView(p map[string]any) map[string]any {
	p = clone(p)
	p["resources"] = []string{"Lab test", "Bay 1", "Bay 2", "Bay 3", "Filling F1", "Filling F2", "Filling F4"}
	p["horizon"] = map[string]any{"start": "13.00", "end": "20.00"}
	p["queueLabel"] = "RT antre di plant 16.00"
	return p
}
func (s *Server) dbRequired() error {
	if s.DB == nil {
		return &apiError{503, "UNAVAILABLE", "Database tidak tersedia.", ""}
	}
	return nil
}

var _ = fmt.Sprintf

const swaggerUIHTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MilkGraph API Docs (OpenAPI 3.0)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis]
    });
  </script>
</body>
</html>
`
