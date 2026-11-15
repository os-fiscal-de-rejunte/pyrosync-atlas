from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from pyrosync_science import agents
from server.app import AreaQuery, Report, ScenarioQuery, app
from server.db import save_report

client = TestClient(app)


def valid_report():
    return {"country": "Brazil", "region": None,
            "observed_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
            "latitude": -15.7, "longitude": -47.9, "category": "fumaca",
            "description": "Fumaça visível próxima à área observada."}


def test_report_rejects_future_and_missing_coordinates():
    data = valid_report()
    data["observed_at"] = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    with pytest.raises(ValidationError):
        Report(**data)
    del data["latitude"]
    assert client.post('/local/relatos', json=data).status_code == 422


def test_report_rejects_contact_details_without_database():
    data = valid_report()
    data["description"] = "Entre em contato em teste@example.com para detalhes."
    with pytest.raises(ValueError, match="dados pessoais"):
        save_report(Report(**data))


def test_scenario_bounds_are_enforced():
    with pytest.raises(ValidationError):
        ScenarioQuery(pais='Brazil', celula_id='global_1_2', delta_temperatura=50,
                      delta_umidade=0, delta_vento=0)


def test_calendar_rejects_future_date():
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    with pytest.raises(ValidationError):
        AreaQuery(pais='Brazil', inicio=tomorrow, fim=tomorrow)


def test_scientific_review_distinguishes_direct_firms_and_forecast():
    notes = agents.review_evidence({'camada': 'firms_consulta_direta', 'proximo_inicio': '2024-01-06'},
                                   {'status': 'experimental'}, {'features': []})
    assert any('não foi harmonizado' in note for note in notes)
    assert any('primeira página' in note for note in notes)
    assert any('não calibrada' in note for note in notes)
    assert any('não demonstra ausência' in note for note in notes)


def test_cannot_proxy_arbitrary_paths():
    assert client.get('/gateway/anything-else').status_code == 404


def test_report_is_stored_with_pending_response(monkeypatch):
    monkeypatch.setattr('server.app.db.save_report', lambda data: '123e4567-e89b-12d3-a456-426614174000')
    response = client.post('/local/relatos', json=valid_report())
    assert response.status_code == 201
    assert response.json()['status'] == 'pendente'
