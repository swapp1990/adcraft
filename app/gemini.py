"""Gemini client — text generation and video analysis via Files API."""
import os
import asyncio
import tempfile
import logging
from dataclasses import dataclass
from typing import Optional

from google import genai
from google.genai import types

from . import config

logger = logging.getLogger(__name__)

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


@dataclass
class GeminiResponse:
    content: str
    model: str
    usage: Optional[dict] = None


async def generate(
    prompt: str,
    system_prompt: Optional[str] = None,
    model: Optional[str] = None,
) -> GeminiResponse:
    """Generate text from a prompt."""
    client = _get_client()
    model_name = model or config.GEMINI_MODEL

    gen_config = types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=4096,
    )
    if system_prompt:
        gen_config.system_instruction = system_prompt

    response = await client.aio.models.generate_content(
        model=model_name,
        contents=prompt,
        config=gen_config,
    )

    usage = None
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        usage = {
            "prompt_tokens": response.usage_metadata.prompt_token_count,
            "completion_tokens": response.usage_metadata.candidates_token_count,
            "total_tokens": response.usage_metadata.total_token_count,
        }

    return GeminiResponse(content=response.text, model=model_name, usage=usage)


async def analyze_video(
    prompt: str,
    video_bytes: bytes,
    system_prompt: Optional[str] = None,
    model: Optional[str] = None,
) -> GeminiResponse:
    """Analyze video via Gemini Files API upload + video understanding."""
    client = _get_client()
    model_name = model or config.GEMINI_MODEL

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        # Upload via Files API
        uploaded_file = await asyncio.to_thread(
            client.files.upload,
            file=tmp_path,
        )

        # Poll until ready
        max_wait = 120
        elapsed = 0
        while elapsed < max_wait:
            file_info = await asyncio.to_thread(
                client.files.get,
                name=uploaded_file.name,
            )
            state = str(getattr(file_info, "state", "ACTIVE"))
            if "ACTIVE" in state or state == "None":
                break
            if "FAILED" in state:
                raise RuntimeError(f"File processing failed: {file_info}")
            await asyncio.sleep(5)
            elapsed += 5

        gen_config = types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=4096,
        )
        if system_prompt:
            gen_config.system_instruction = system_prompt

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[uploaded_file, prompt],
            config=gen_config,
        )

        usage = None
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            usage = {
                "prompt_tokens": response.usage_metadata.prompt_token_count,
                "completion_tokens": response.usage_metadata.candidates_token_count,
                "total_tokens": response.usage_metadata.total_token_count,
            }

        return GeminiResponse(content=response.text, model=model_name, usage=usage)

    finally:
        os.unlink(tmp_path)
