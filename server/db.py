import os
import re
from contextlib import contextmanager
from datetime import UTC, datetime
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row


@contextmanager
def database():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Banco de relatos não configurado.")
    with psycopg.connect(url, connect_timeout=10, row_factory=dict_row) as conn:
        yield conn


def create_schema():
    with database() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS public.pyro_community_reports (
                id UUID PRIMARY KEY,
                country VARCHAR(120) NOT NULL,
                region VARCHAR(120),
                observed_at TIMESTAMPTZ NOT NULL,
                latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
                longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
                category VARCHAR(20) NOT NULL CHECK (category IN ('fumaca', 'fogo', 'area_queimada', 'outro')),
                description VARCHAR(600) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
                submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                reviewed_at TIMESTAMPTZ
            )
        """)


def save_report(data):
    if re.search(r"\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b|(?:\+?\d[\s().-]*){9,}", data.description):
        raise ValueError("Não inclua e-mail, telefone ou outros dados pessoais na descrição.")
    report_id = uuid4()
    with database() as conn:
        conn.execute(
            """INSERT INTO public.pyro_community_reports
            (id,country,region,observed_at,latitude,longitude,category,description)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (report_id, data.country, data.region, data.observed_at,
             round(data.latitude, 3), round(data.longitude, 3), data.category, data.description),
        )
    return str(report_id)


def approved_reports(country):
    with database() as conn:
        records = conn.execute(
            """SELECT id,country,region,observed_at,latitude,longitude,category,description,status
               FROM public.pyro_community_reports
               WHERE status='aprovado' AND lower(country)=lower(%s)
               ORDER BY observed_at DESC LIMIT 100""", (country,)
        ).fetchall()
    return records


def moderate_report(report_id, status):
    if status not in {"aprovado", "rejeitado"}:
        raise ValueError("Status inválido.")
    with database() as conn:
        return conn.execute(
            "UPDATE public.pyro_community_reports SET status=%s,reviewed_at=%s WHERE id=%s AND status='pendente' RETURNING id",
            (status, datetime.now(UTC), report_id),
        ).fetchone()
