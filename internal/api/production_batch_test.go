package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAPIAndDocsEndpoints(t *testing.T) {
	srv := (&Server{Mode: "demo"}).Handler()

	req := httptest.NewRequest(http.MethodGet, "/openapi.yaml", nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /openapi.yaml status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "openapi: 3.0.3") {
		t.Fatalf("GET /openapi.yaml missing openapi 3.0.3 header")
	}

	reqDocs := httptest.NewRequest(http.MethodGet, "/docs", nil)
	recDocs := httptest.NewRecorder()
	srv.ServeHTTP(recDocs, reqDocs)
	if recDocs.Code != http.StatusOK {
		t.Fatalf("GET /docs status = %d, want 200", recDocs.Code)
	}
	if !strings.Contains(recDocs.Body.String(), "/openapi.yaml") {
		t.Fatalf("GET /docs missing /openapi.yaml reference")
	}
}

func TestProductionBatchEndpointsWithoutDBAndValidation(t *testing.T) {
	srv := (&Server{Mode: "demo"}).Handler()

	cases := []struct {
		method string
		path   string
		role   string
		body   string
		want   int
	}{
		{http.MethodGet, "/api/v1/production/daily", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/schedule", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/assets", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/products", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/plans", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/predictions", "planner", "", http.StatusServiceUnavailable},
		{http.MethodGet, "/api/v1/production/recommendations", "planner", "", http.StatusServiceUnavailable},
		{http.MethodPost, "/api/v1/production/batches", "qa", `{"lines":[]}`, http.StatusForbidden},
		{http.MethodPost, "/api/v1/production/batches", "planner", `{"lines":[]}`, http.StatusServiceUnavailable},
		{http.MethodPost, "/api/v1/production/assets/FL-01/status", "qa", `{"status":"Maintenance"}`, http.StatusForbidden},
		{http.MethodPatch, "/api/v1/production/recommendations/1", "qa", `{"status":"accepted"}`, http.StatusForbidden},
	}

	for _, tc := range cases {
		var req *http.Request
		if tc.body != "" {
			req = httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
		} else {
			req = httptest.NewRequest(tc.method, tc.path, nil)
		}
		req.Header.Set("X-Demo-Role", tc.role)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Code != tc.want {
			t.Errorf("%s %s (role=%s): status = %d, want %d (body: %s)", tc.method, tc.path, tc.role, rec.Code, tc.want, rec.Body.String())
		}
	}
}
