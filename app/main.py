"""AdCraft API — AI-powered ad video generator."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os

from . import jobs, worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await jobs.init_db()
    task = asyncio.create_task(worker.run())
    logger.info("AdCraft API ready")
    yield
    task.cancel()


app = FastAPI(title="AdCraft", description="AI-powered ad video generator", lifespan=lifespan)

# ── CORS ───────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        "https://adcraft.swapp1990.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    concept: str
    num_clips: int = 5
    target_duration: int = 30
    aspect_ratio: str = "16:9"
    resolution: str = "480p"


class CritiqueRequest(BaseModel):
    video_url: str
    concept: str = ""


# ── Routes ────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "adcraft"}


@app.post("/api/generate")
async def create_generate_job(req: GenerateRequest):
    """Create an ad video generation job."""
    job = await jobs.create_job("generate", req.model_dump())
    return job


@app.post("/api/critique")
async def create_critique_job(req: CritiqueRequest):
    """Create an ad critique job."""
    job = await jobs.create_job("critique", req.model_dump())
    return job


@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    """Get job status and results."""
    job = await jobs.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/api/jobs")
async def list_jobs(job_type: Optional[str] = None, limit: int = 20):
    """List recent jobs."""
    return await jobs.list_jobs(job_type, limit)


# ── Static frontend (production) ──────────────────────────────────────
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(_STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve React SPA — all non-API routes go to index.html."""
        index = os.path.join(_STATIC_DIR, "index.html")
        return FileResponse(index)
