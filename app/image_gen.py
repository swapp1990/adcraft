"""Gemini image generation — generate still frames for intro/product/CTA clips.

Two strategies are attempted in order:
1. generate_content with response_modalities=["IMAGE"] — works with gemini-3-pro-image-preview.
2. generate_images (Imagen 3) — uses GenerateImagesConfig with native aspect_ratio support.

Strategy 1 is tried first because gemini-3-pro-image-preview is configured as GEMINI_IMAGE_MODEL.
If it returns no image data (model may not support image output in all API versions),
strategy 2 falls back to imagen-3.0-generate-002.
"""
import asyncio
import logging
from typing import Optional, Tuple

from google import genai
from google.genai import types

from . import config, storage

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None

# Fallback Imagen 3 model — supports aspect_ratio natively via generate_images
_IMAGEN_MODEL = "imagen-3.0-generate-002"


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


async def _generate_via_generate_content(
    prompt: str,
    aspect_ratio: str,
) -> Optional[bytes]:
    """
    Use generate_content with response_modalities=["IMAGE"] to get image bytes.
    Returns raw image bytes, or None if the response contains no image part.
    """
    client = _get_client()
    model_name = config.GEMINI_IMAGE_MODEL

    gen_config = types.GenerateContentConfig(
        response_modalities=["IMAGE", "TEXT"],
    )

    logger.info(
        f"generate_content image attempt: model={model_name}, aspect_ratio={aspect_ratio}"
    )

    response = await client.aio.models.generate_content(
        model=model_name,
        contents=prompt,
        config=gen_config,
    )

    # Extract image bytes from response parts
    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            inline = getattr(part, "inline_data", None)
            if inline is not None and inline.data:
                logger.info(
                    f"generate_content returned image: {len(inline.data)} bytes, "
                    f"mime={inline.mime_type}"
                )
                return inline.data

    logger.warning("generate_content returned no image parts")
    return None


async def _generate_via_imagen(
    prompt: str,
    aspect_ratio: str,
) -> bytes:
    """
    Use the generate_images endpoint (Imagen 3) for reliable image generation.
    Returns raw image bytes.
    """
    client = _get_client()

    gen_config = types.GenerateImagesConfig(
        number_of_images=1,
        aspect_ratio=aspect_ratio,
        output_mime_type="image/png",
    )

    logger.info(
        f"generate_images attempt: model={_IMAGEN_MODEL}, aspect_ratio={aspect_ratio}"
    )

    response = await client.aio.models.generate_images(
        model=_IMAGEN_MODEL,
        prompt=prompt,
        config=gen_config,
    )

    generated = response.generated_images or []
    if not generated:
        raise RuntimeError(
            f"Imagen returned no images. Response: {response}"
        )

    image_obj = generated[0].image
    if image_obj is None or not image_obj.image_bytes:
        raise RuntimeError("Imagen returned an image object with no bytes")

    logger.info(f"generate_images returned: {len(image_obj.image_bytes)} bytes")
    return image_obj.image_bytes


async def generate_image(
    prompt: str,
    aspect_ratio: str = "16:9",
) -> Tuple[bytes, str]:
    """
    Generate a still image via Gemini image generation, upload to S3, and return both.

    Tries gemini-3-pro-image-preview via generate_content first.
    Falls back to Imagen 3 (imagen-3.0-generate-002) via generate_images.

    Args:
        prompt: Descriptive prompt for the image composition.
        aspect_ratio: Desired aspect ratio string (e.g. "16:9", "9:16", "1:1").

    Returns:
        Tuple of (image_bytes, s3_url).
    """
    # Map any non-standard aspect ratio strings to API-accepted values
    _aspect_map = {
        "16:9": "16:9",
        "9:16": "9:16",
        "1:1": "1:1",
        "4:3": "4:3",
        "3:4": "3:4",
    }
    ar = _aspect_map.get(aspect_ratio, "16:9")

    # Enhance prompt with quality boosters and aspect ratio context
    orientation = {
        "9:16": "vertical/portrait format (phone screen)",
        "16:9": "horizontal/landscape widescreen format",
        "1:1": "square format",
        "4:3": "standard 4:3 format",
        "3:4": "portrait 3:4 format",
    }.get(ar, "widescreen format")

    enhanced_prompt = (
        f"Professional high-quality advertisement image in {orientation}. "
        f"{prompt} "
        f"Style: polished commercial photography, vibrant colours, "
        f"sharp details, professional lighting, suitable for a video ad frame."
    )

    image_bytes: Optional[bytes] = None

    # Strategy 1: gemini-3-pro-image-preview via generate_content + response_modalities
    try:
        image_bytes = await _generate_via_generate_content(enhanced_prompt, ar)
    except Exception as e:
        logger.warning(f"generate_content image generation failed: {e}")

    # Strategy 2: Imagen 3 via generate_images
    if image_bytes is None:
        logger.info("Falling back to Imagen 3 (generate_images)")
        image_bytes = await _generate_via_imagen(enhanced_prompt, ar)

    # Detect mime type from magic bytes
    if image_bytes[:4] == b"\x89PNG":
        ext, content_type = "png", "image/png"
    else:
        ext, content_type = "jpg", "image/jpeg"

    s3_url = await storage.upload(image_bytes, f"image.{ext}", content_type=content_type)
    logger.info(f"Image uploaded: {len(image_bytes)} bytes -> {s3_url}")

    return image_bytes, s3_url
