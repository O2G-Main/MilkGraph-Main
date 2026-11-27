// Package telemetry configures GlitchTip (Sentry-compatible) error tracking
// and OpenTelemetry distributed tracing with non-blocking, sampled defaults.
package telemetry

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

const (
	defaultSampleRate = 0.1
	exportTimeout     = 3 * time.Second
	shutdownTimeout   = 5 * time.Second
)

// Init initializes Sentry (GlitchTip) and OpenTelemetry when their respective
// environment variables (SENTRY_DSN, OTEL_EXPORTER_OTLP_ENDPOINT) are set.
// Returns a shutdown function safe to defer unconditionally.
func Init(ctx context.Context, env string, log *slog.Logger) func(context.Context) {
	if log == nil {
		log = slog.Default()
	}

	sentryEnabled := false
	if dsn := strings.TrimSpace(os.Getenv("SENTRY_DSN")); dsn != "" {
		if err := sentry.Init(sentry.ClientOptions{
			Dsn:              dsn,
			Environment:      env,
			TracesSampleRate: defaultSampleRate,
			AttachStacktrace: true,
		}); err != nil {
			log.Warn("gagal inisialisasi sentry/glitchtip", "error", err)
		} else {
			sentryEnabled = true
			log.Info("glitchtip error tracking aktif")
		}
	}

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	var tp *sdktrace.TracerProvider
	if endpoint := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")); endpoint != "" {
		exp, err := otlptracehttp.New(ctx, otlptracehttp.WithTimeout(exportTimeout))
		if err != nil {
			log.Warn("gagal inisialisasi otel exporter", "error", err)
		} else {
			svcName := strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME"))
			if svcName == "" {
				svcName = "milkgraph-back"
			}
			res, err := resource.New(ctx,
				resource.WithFromEnv(),
				resource.WithAttributes(attribute.String("service.name", svcName)),
			)
			if err != nil {
				res = resource.Default()
			}
			tp = sdktrace.NewTracerProvider(
				sdktrace.WithResource(res),
				sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(defaultSampleRate))),
				sdktrace.WithBatcher(exp,
					sdktrace.WithMaxExportBatchSize(512),
					sdktrace.WithExportTimeout(exportTimeout),
				),
			)
			otel.SetTracerProvider(tp)
			log.Info("opentelemetry tracing aktif", "endpoint", endpoint, "service", svcName)
		}
	}

	return func(shutdownCtx context.Context) {
		if sentryEnabled {
			sentry.Flush(2 * time.Second)
		}
		if tp != nil {
			c, cancel := context.WithTimeout(shutdownCtx, shutdownTimeout)
			defer cancel()
			if err := tp.Shutdown(c); err != nil {
				log.Warn("gagal shutdown otel tracer", "error", err)
			}
		}
	}
}

// WrapHandler wraps an http.Handler with Sentry panic/error capture and
// OpenTelemetry HTTP tracing while skipping healthcheck endpoints.
func WrapHandler(h http.Handler, service string) http.Handler {
	sentryHandler := sentryhttp.New(sentryhttp.Options{
		Repanic:         false,
		WaitForDelivery: false,
		Timeout:         2 * time.Second,
	})
	filter := otelhttp.WithFilter(func(r *http.Request) bool {
		return r.URL.Path != "/livez" && r.URL.Path != "/readyz"
	})
	return otelhttp.NewHandler(sentryHandler.Handle(h), service, filter)
}

// HTTPTransport wraps an http.RoundTripper to propagate OpenTelemetry trace context.
func HTTPTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return otelhttp.NewTransport(base)
}
