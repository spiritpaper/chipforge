"""ChipForge API.

Phase 0 only exposes a health check; Phase 3 adds conversion jobs
(upload -> stem separation -> transcription -> chip arrangement).
"""

from fastapi import FastAPI

app = FastAPI(title="ChipForge API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
