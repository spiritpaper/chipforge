from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_health(tmp_path) -> None:
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path}/t.db"))
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
