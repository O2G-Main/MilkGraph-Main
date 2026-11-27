"""Local GET-only proxy for browser QA; operational writes never reach the backend."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import urllib.error
import urllib.request

UPSTREAM = os.environ.get("QA_UPSTREAM", "https://api.milkgraph.web.id").rstrip("/")
PORT = int(os.environ.get("QA_PROXY_PORT", "8081"))


class Handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Demo-Role, Last-Event-ID")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if not self.path.startswith("/api/v1/"):
            self.send_response(404)
            self.end_headers()
            return
        if self.path.split("?")[0] == "/api/v1/events":
            # This suite checks explicit reloads, not live SSE delivery.
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            self.wfile.write(b": local-read-only-qa\n\n")
            return
        headers = {"X-Demo-Role": self.headers.get("X-Demo-Role", "superadmin")}
        try:
            request = urllib.request.Request(UPSTREAM + self.path, headers=headers)
            with urllib.request.urlopen(request, timeout=30) as response:
                body, status = response.read(), response.status
                mime = response.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as error:
            body, status, mime = error.read(), error.code, "application/json"
        except Exception as error:
            body = json.dumps({"error": {"code": "PROXY_ERROR", "message": str(error)}}).encode()
            status, mime = 502, "application/json"
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.end_headers()
        self.wfile.write(body)

    def blocked(self):
        self.send_response(403)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"error":{"code":"QA_READ_ONLY","message":"Production writes are blocked in local QA."}}')

    do_POST = do_PUT = do_PATCH = do_DELETE = blocked


if __name__ == "__main__":
    print(f"Read-only QA proxy: http://127.0.0.1:{PORT} -> {UPSTREAM}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
