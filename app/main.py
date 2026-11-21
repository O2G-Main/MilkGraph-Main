import logging
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException

from . import jev, layanan, llm
from .schemas import (
    ChatRequest,
    ChatResponse,
    HealthResponse,
    RepairPriorityRequest,
    RepairPriorityResponse,
    RootCauseRequest,
    RootCauseResponse,
)

log = logging.getLogger("milkgraph-ai")

app = FastAPI(title="milkgraph-ai", version="1.1.0")


@app.on_event("startup")
def _cek_env() -> None:
    if not os.environ.get("SERVICE_TOKEN"):
        log.warning("SERVICE_TOKEN kosong: pengecekan X-Service-Token dimatikan (hanya untuk tes lokal)")
    if not jev.tersedia():
        log.warning("JEV_API_KEY kosong: service berjalan mode template")
    if not llm.tersedia():
        log.warning("LLM_API_KEY kosong: lapisan narasi LLM nonaktif, narasi dari template")


def wajib_token(x_service_token: str | None = Header(default=None)) -> None:
    token = os.environ.get("SERVICE_TOKEN", "")
    if not token:
        return
    if not x_service_token or not secrets.compare_digest(x_service_token, token):
        raise HTTPException(status_code=401, detail="X-Service-Token tidak valid")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    if jev.tersedia() and llm.tersedia():
        mode = "jev+llm"
    elif jev.tersedia():
        mode = "jev"
    elif llm.tersedia():
        mode = "llm"
    else:
        mode = "template"
    return HealthResponse(status="ok", llm=mode)


@app.post(
    "/ai/root-cause/narrate",
    response_model=RootCauseResponse,
    dependencies=[Depends(wajib_token)],
)
def narrate_root_cause(req: RootCauseRequest) -> RootCauseResponse:
    return layanan.narasi_akar_masalah(req)


@app.post(
    "/ai/repair-priority/explain",
    response_model=RepairPriorityResponse,
    dependencies=[Depends(wajib_token)],
)
def explain_repair_priority(req: RepairPriorityRequest) -> RepairPriorityResponse:
    return layanan.penjelasan_prioritas(req)


@app.post("/ai/chat", response_model=ChatResponse, dependencies=[Depends(wajib_token)])
def chat(req: ChatRequest) -> ChatResponse:
    return layanan.jawaban_chat(req)
