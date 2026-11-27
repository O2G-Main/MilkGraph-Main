"""Unit tests for milkgraph-ai telemetry initialization."""

import os
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import main, telemetry


class TelemetryTests(unittest.TestCase):
    def test_noop_without_env(self) -> None:
        old_dsn = os.environ.pop("SENTRY_DSN", None)
        old_otel = os.environ.pop("OTEL_EXPORTER_OTLP_ENDPOINT", None)
        try:
            self.assertFalse(telemetry.init_sentry())
            self.assertFalse(telemetry.init_otel(FastAPI()))
        finally:
            if old_dsn is not None:
                os.environ["SENTRY_DSN"] = old_dsn
            if old_otel is not None:
                os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = old_otel

    def test_health_endpoint_ok(self) -> None:
        client = TestClient(main.app)
        res = client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")


if __name__ == "__main__":
    unittest.main()
