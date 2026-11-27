package telemetry

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestInitWithoutEnvIsNoOp(t *testing.T) {
	t.Setenv("SENTRY_DSN", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")

	shutdown := Init(context.Background(), "test", nil)
	if shutdown == nil {
		t.Fatal("expected non-nil shutdown func")
	}
	shutdown(context.Background())
}

func TestWrapHandlerPassesThroughAndSkipsHealthchecks(t *testing.T) {
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok:" + r.URL.Path))
	})
	wrapped := WrapHandler(inner, "milkgraph-back-test")

	for _, path := range []string{"/livez", "/readyz", "/api/v1/health"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		wrapped.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d", path, rec.Code)
		}
		if rec.Body.String() != "ok:"+path {
			t.Fatalf("%s: unexpected body %q", path, rec.Body.String())
		}
	}
}

func TestHTTPTransportReturnsNonNil(t *testing.T) {
	if tr := HTTPTransport(nil); tr == nil {
		t.Fatal("expected non-nil transport")
	}
}

func TestCaptureErrorSafeWhenUnset(t *testing.T) {
	CaptureError(nil)
	CaptureError(errors.New("boom"))
}
