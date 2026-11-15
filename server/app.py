import asyncio
import os
import time
from collections import defaultdict, deque
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator

from pyrosync_science import agents
from server import db
from server.secrets_store import load_credentials

load_credentials()
ROOT = Path(__file__).resolve().parent.parent
DATA_API = os.environ.get("PYRO_DATA_API_URL", "https://pyrosync-api.onrender.com").rstrip("/")
app = FastAPI(title="PyroSync Atlas", docs_url=None, redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
)

LIMITS = defaultdict(deque)
GLOBAL_AI = deque()
GATEWAY = {"paises", "regioes", "focos", "focos-firms", "focos-recentes", "celulas", "calendario", "previsao"}


def limit(request: Request, namespace: str, maximum: int, seconds: int):
    now = time.monotonic()
    host = request.client.host if request.client else "unknown"
    key = (namespace, host)
    bucket = LIMITS[key]
    while bucket and bucket[0] < now - seconds:
        bucket.popleft()
    if len(bucket) >= maximum:
        raise HTTPException(429, "Muitas solicitações. Aguarde um pouco e tente novamente.")
    bucket.append(now)
    if len(LIMITS) > 5000:
        for old_key in list(LIMITS):
            if not LIMITS[old_key] or LIMITS[old_key][-1] < now - 3600:
                del LIMITS[old_key]


def limit_global_ai():
    now = time.monotonic()
    while GLOBAL_AI and GLOBAL_AI[0] < now - 3600:
        GLOBAL_AI.popleft()
    if len(GLOBAL_AI) >= 40:
        raise HTTPException(429, "Limite temporário das análises alcançado. Tente novamente mais tarde.")
    GLOBAL_AI.append(now)


class AreaQuery(BaseModel):
    pais: str = Field(min_length=2, max_length=120)
    regiao: str | None = Field(default=None, max_length=120)
    inicio: date
    fim: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.fim < self.inicio or (self.fim - self.inicio).days > 366 or self.fim > datetime.now(UTC).date():
            raise ValueError("Informe datas válidas, sem datas futuras, com intervalo de até 367 dias.")
        return self


class AnalysisQuery(AreaQuery):
    pergunta: str = Field(default="O que podemos concluir sobre a região?", min_length=3, max_length=500)


class ComparisonQuery(AreaQuery):
    sensor: Literal["MODIS", "VIIRS"]


class ScenarioQuery(BaseModel):
    pais: str = Field(min_length=2, max_length=120)
    regiao: str | None = Field(default=None, max_length=120)
    celula_id: str = Field(pattern=r"^global_\d{1,3}_\d{1,4}$")
    delta_temperatura: float = Field(ge=-5, le=5, allow_inf_nan=False)
    delta_umidade: float = Field(ge=-20, le=20, allow_inf_nan=False)
    delta_vento: float = Field(ge=-3, le=3, allow_inf_nan=False)


class Report(BaseModel):
    country: str = Field(min_length=2, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    observed_at: datetime
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    category: Literal["fumaca", "fogo", "area_queimada", "outro"]
    description: str = Field(min_length=10, max_length=600)
    website: str = Field(default="", max_length=0)

    @field_validator("description", "country")
    @classmethod
    def strip_text(cls, value):
        if not value.strip():
            raise ValueError("Campo obrigatório.")
        return value.strip()

    @field_validator("observed_at")
    @classmethod
    def valid_observation_time(cls, value):
        if value.tzinfo is None or value > datetime.now(UTC):
            raise ValueError("Informe data e hora passadas, com fuso horário.")
        return value


@app.get("/local/status")
async def status():
    return {"status": "ativo", "api_dados": DATA_API, "ia_configurada": bool(os.environ.get("GROQ_API_KEY") or os.environ.get("GEMINI_API_KEY")),
            "relatos_configurados": bool(os.environ.get("DATABASE_URL"))}


@app.get("/gateway/{resource}")
async def gateway(resource: str, request: Request):
    if resource not in GATEWAY:
        raise HTTPException(404, "Recurso não encontrado.")
    limit(request, "gateway", 80, 60)
    try:
        async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
            response = await client.get(f"{DATA_API}/api/{resource}", params=list(request.query_params.multi_items()))
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail", "Fonte de dados indisponível.")
            except ValueError:
                detail = "Fonte de dados indisponível."
            raise HTTPException(response.status_code, detail)
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "A API de dados não respondeu. Tente novamente em instantes.") from None


@app.get("/gateway/historico-mensal/{z}/{x}/{y}.png")
async def monthly_tile(z: int, x: int, y: int, request: Request):
    limit(request, "monthly-tiles", 240, 60)
    try:
        async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
            response = await client.get(f"{DATA_API}/api/historico-mensal/{z}/{x}/{y}.png",
                                        params=list(request.query_params.multi_items()))
        if response.status_code != 200 or not response.content.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(503, "Mapa histórico indisponível. Tente novamente.")
        return Response(response.content, media_type="image/png", headers={"Cache-Control": "public, max-age=900"})
    except httpx.HTTPError:
        raise HTTPException(503, "Mapa histórico indisponível. Tente novamente.") from None


@app.post("/local/analise")
async def analysis(query: AnalysisQuery, request: Request):
    limit(request, "analysis", 4, 60)
    limit_global_ai()
    return await agents.analyze(DATA_API, query.pais.strip(), query.regiao, query.inicio, query.fim, query.pergunta.strip())


@app.post("/local/comparacao")
async def comparison(query: ComparisonQuery, request: Request):
    limit(request, "comparison", 3, 60)
    try:
        return await agents.compare_history(DATA_API, query.pais.strip(), query.regiao, query.inicio, query.fim, query.sensor)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/local/cenario")
async def scenario(query: ScenarioQuery, request: Request):
    limit(request, "scenario", 5, 60)
    try:
        async with httpx.AsyncClient(timeout=90, follow_redirects=False) as client:
            response = await client.post(f"{DATA_API}/api/cenario", json=query.model_dump())
        if response.status_code >= 400:
            detail = response.json().get("detail", "Cenário indisponível.")
            raise HTTPException(response.status_code, detail)
        return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Não foi possível calcular o cenário agora.") from None


@app.post("/local/relatos", status_code=201)
async def report(data: Report, request: Request):
    limit(request, "reports", 3, 3600)
    try:
        report_id = await asyncio.to_thread(db.save_report, data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    except Exception:
        raise HTTPException(503, "Não foi possível registrar o relato. Tente novamente mais tarde.") from None
    return {"id": report_id, "status": "pendente", "mensagem": "Relato recebido para revisão. Não é uma detecção de satélite."}


@app.get("/local/relatos")
async def reports(request: Request, pais: str):
    limit(request, "reports-read", 30, 60)
    if not 2 <= len(pais) <= 120:
        raise HTTPException(400, "País inválido.")
    try:
        return {"relatos": await asyncio.to_thread(db.approved_reports, pais)}
    except Exception:
        raise HTTPException(503, "Relatos indisponíveis no momento.") from None


dist = ROOT / ("atlas_dist" if (ROOT / "atlas_dist").exists() else "dist")
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        asset = (dist / path).resolve()
        if asset.is_relative_to(dist.resolve()) and asset.is_file():
            return FileResponse(asset)
        return FileResponse(dist / "index.html")
