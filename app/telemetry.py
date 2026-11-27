"""GlitchTip (Sentry-compatible) and OpenTelemetry setup for milkgraph-ai."""

import logging
import os

from fastapi import FastAPI

log = logging.getLogger("milkgraph-ai.telemetry")

_DEFAULT_SAMPLE_RATE = 0.1


def init_sentry() -> bool:
    """Initialize Sentry/GlitchTip SDK if SENTRY_DSN is configured."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        traces_sample_rate=_DEFAULT_SAMPLE_RATE,
        send_default_pii=False,
    )
    log.info("glitchtip error tracking aktif")
    return True


def init_otel(app: FastAPI) -> bool:
    """Initialize OpenTelemetry tracing for FastAPI if OTEL_EXPORTER_OTLP_ENDPOINT is set."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return False

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

    svc_name = os.environ.get("OTEL_SERVICE_NAME", "milkgraph-ai").strip() or "milkgraph-ai"
    provider = TracerProvider(
        resource=Resource.create({"service.name": svc_name}),
        sampler=ParentBased(TraceIdRatioBased(_DEFAULT_SAMPLE_RATE)),
    )
    exporter = OTLPSpanExporter(
        endpoint=f"{endpoint.rstrip('/')}/v1/traces",
        timeout=3,
    )
    provider.add_span_processor(
        BatchSpanProcessor(exporter, max_export_batch_size=512, export_timeout_millis=3000)
    )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
    log.info("opentelemetry tracing aktif: %s (%s)", endpoint, svc_name)
    return True
