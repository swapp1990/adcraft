"""xAI Grok Imagine Video — submit, poll, download clips."""
import asyncio
import logging
from typing import Dict

import httpx

from . import config

logger = logging.getLogger(__name__)


async def generate_clip(
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    resolution: str = "480p",
) -> bytes:
    """Submit a video generation request, poll until ready, return video bytes."""
    api_key = config.XAI_API_KEY
    if not api_key:
        raise RuntimeError("XAI_API_KEY not set")

    body = {
        "model": "grok-imagine-video",
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }

    # Submit
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{config.XAI_API_BASE}/videos/generations",
            json=body,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        resp.raise_for_status()
        data = resp.json()

    request_id = data.get("request_id")
    if not request_id:
        raise RuntimeError(f"No request_id: {data}")

    logger.info(f"Submitted clip: request_id={request_id}")

    # Poll until ready
    elapsed = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while elapsed < config.CLIP_POLL_TIMEOUT:
            resp = await client.get(
                f"{config.XAI_API_BASE}/videos/{request_id}",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()

            video_info = data.get("video")
            if video_info:
                video_url = video_info.get("url")
                if not video_url:
                    raise RuntimeError(f"Clip done but no URL: {data}")

                dl_resp = await client.get(video_url, timeout=120)
                dl_resp.raise_for_status()
                logger.info(f"Clip ready: {len(dl_resp.content)} bytes")
                return dl_resp.content

            status = data.get("status", "unknown")
            if status == "expired":
                raise RuntimeError("Clip generation expired")

            await asyncio.sleep(config.CLIP_POLL_INTERVAL)
            elapsed += config.CLIP_POLL_INTERVAL

    raise RuntimeError(f"Clip timed out after {config.CLIP_POLL_TIMEOUT}s")
