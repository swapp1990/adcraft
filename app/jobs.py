"""Job model and MongoDB operations."""
import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from . import config

logger = logging.getLogger(__name__)

_db: Optional[AsyncIOMotorDatabase] = None


async def init_db():
    global _db
    client = AsyncIOMotorClient(config.MONGODB_URI)
    _db = client[config.DB_NAME]
    # Verify connection
    await client.admin.command("ping")
    logger.info(f"Connected to MongoDB: {config.DB_NAME}")


def _get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


async def create_job(job_type: str, input_params: dict) -> dict:
    now = datetime.now(timezone.utc)
    doc = {
        "job_type": job_type,
        "status": "pending",
        "input_params": input_params,
        "output": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }
    result = await _get_db().jobs.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


async def get_job(job_id: str) -> Optional[dict]:
    doc = await _get_db().jobs.find_one({"_id": ObjectId(job_id)})
    return _serialize(doc) if doc else None


async def list_jobs(job_type: Optional[str] = None, limit: int = 20) -> list:
    query = {}
    if job_type:
        query["job_type"] = job_type
    cursor = _get_db().jobs.find(query).sort("created_at", -1).limit(limit)
    return [_serialize(doc) async for doc in cursor]


async def claim_pending(job_type: str) -> Optional[dict]:
    """Atomically claim one pending job."""
    now = datetime.now(timezone.utc)
    doc = await _get_db().jobs.find_one_and_update(
        {"job_type": job_type, "status": "pending"},
        {"$set": {"status": "in_progress", "started_at": now, "updated_at": now}},
        sort=[("created_at", 1)],
        return_document=True,
    )
    return _serialize(doc) if doc else None


async def complete_job(job_id: str, output: dict):
    now = datetime.now(timezone.utc)
    await _get_db().jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": "completed", "output": output, "completed_at": now, "updated_at": now}},
    )


async def fail_job(job_id: str, error: str):
    now = datetime.now(timezone.utc)
    await _get_db().jobs.update_one(
        {"_id": ObjectId(job_id)},
        {"$set": {"status": "failed", "error": error, "completed_at": now, "updated_at": now}},
    )


async def cancel_job(job_id: str) -> bool:
    """Cancel a pending or in_progress job. Returns True if cancelled."""
    now = datetime.now(timezone.utc)
    result = await _get_db().jobs.update_one(
        {"_id": ObjectId(job_id), "status": {"$in": ["pending", "in_progress"]}},
        {"$set": {"status": "cancelled", "error": "Cancelled by user", "completed_at": now, "updated_at": now}},
    )
    return result.modified_count > 0


async def delete_job(job_id: str) -> bool:
    """Delete a job from the database."""
    result = await _get_db().jobs.delete_one({"_id": ObjectId(job_id)})
    return result.deleted_count > 0


def _serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc["id"] = str(doc.pop("_id"))
    for key in ("created_at", "updated_at", "started_at", "completed_at"):
        if doc.get(key):
            doc[key] = doc[key].isoformat()
    return doc
