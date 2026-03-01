"""xAI Grok Imagine Video — submit, poll, download clips."""
import asyncio
import logging
from typing import Dict, Optional

import httpx

from . import config

logger = logging.getLogger(__name__)


async def _poll_and_download(request_id: str) -> bytes:
    """Poll a submitted video request until ready, then download and return bytes."""
    elapsed = 0
    api_key = config.XAI_API_KEY
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
    return await _poll_and_download(request_id)


async def animate_image(
    image_url: str,
    prompt: str,
    duration: int = 5,
    aspect_ratio: str = "16:9",
    resolution: str = "480p",
) -> bytes:
    """
    Submit an image-to-video generation request to xAI, poll, and return video bytes.

    Uses the same /videos/generations endpoint as text-to-video, but includes
    an image_url field so Grok animates the provided still image.

    If the API does not support image_url (e.g. 422/400 response), raises
    RuntimeError so the caller can fall back to image_static.

    Args:
        image_url: Public S3 URL of the source still image.
        prompt: Animation direction / motion prompt.
        duration: Clip duration in seconds.
        aspect_ratio: "16:9", "9:16", etc.
        resolution: "480p", "720p", etc.

    Returns:
        Video bytes of the animated clip.
    """
    api_key = config.XAI_API_KEY
    if not api_key:
        raise RuntimeError("XAI_API_KEY not set")

    body = {
        "model": "grok-imagine-video",
        "prompt": prompt,
        "image_url": image_url,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }

    logger.info(f"Submitting image-to-video: image_url={image_url[:80]}...")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{config.XAI_API_BASE}/videos/generations",
            json=body,
            headers={"Authorization": f"Bearer {api_key}"},
        )
        # Let the caller handle non-2xx as a potential fallback trigger
        resp.raise_for_status()
        data = resp.json()

    request_id = data.get("request_id")
    if not request_id:
        raise RuntimeError(f"No request_id in image-to-video response: {data}")

    logger.info(f"Submitted image-to-video: request_id={request_id}")
    return await _poll_and_download(request_id)
