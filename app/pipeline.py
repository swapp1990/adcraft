"""
Ad video generation pipeline — 5 stages, no framework dependencies.

1. generate_script — Gemini writes structured ad script
2. create_clip_prompts — Gemini converts scenes to video prompts
3. generate_clips — Parallel clip generation via Grok Imagine Video
4. analyze_clips — Gemini video analysis for edit notes
5. assemble_video — ffmpeg trim + crossfade assembly
"""
import json
import asyncio
import logging
from typing import Dict, Any, Callable, Optional

from . import gemini, xai, ffmpeg, storage, config

logger = logging.getLogger(__name__)


def _parse_json(text: str) -> dict:
    """Parse JSON from Gemini response, stripping markdown fences if present."""
    content = text.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()
    return json.loads(content)


async def generate_script(concept: str, num_clips: int, target_duration: int) -> dict:
    """Stage 1: Gemini writes a structured ad script."""
    logger.info(f"Generating script for: {concept[:80]}...")

    prompt = f"""Write a structured ad script for the following concept:

CONCEPT: {concept}

Requirements:
- Create exactly {num_clips} scenes
- Total duration across all scenes should be approximately {target_duration} seconds
- Each scene should be 5-8 seconds
- Each scene needs a vivid visual description (no text overlays or speech)
- Focus on visual storytelling — no dialogue, just cinematic imagery

Respond with this exact JSON structure:
{{
  "title": "Ad title",
  "tone": "warm/energetic/dramatic/etc",
  "scenes": [
    {{
      "scene_number": 1,
      "description": "Detailed visual description of what happens in this scene",
      "duration_seconds": 6,
      "mood": "mood/emotion for this scene",
      "visual_elements": ["key visual element 1", "key visual element 2"]
    }}
  ]
}}"""

    response = await gemini.generate(
        prompt,
        system_prompt=(
            "You are an expert advertising creative director. "
            "You write compelling, visual ad scripts optimized for AI video generation. "
            "Always respond with valid JSON only, no markdown."
        ),
    )

    script = _parse_json(response.content)
    scenes = script.get("scenes", [])
    logger.info(f"Script ready: {script.get('title')}, {len(scenes)} scenes")
    return script


async def create_clip_prompts(script: dict, aspect_ratio: str) -> list:
    """Stage 2: Convert scenes to Grok video prompts."""
    scenes = script.get("scenes", [])
    logger.info(f"Creating {len(scenes)} clip prompts...")

    prompt = f"""Convert these ad scenes into optimized video generation prompts for Grok Imagine Video.

AD TONE: {script.get('tone', 'cinematic')}
SCENES:
{json.dumps(scenes, indent=2)}

For each scene, write a prompt that:
- Is 1-3 sentences of vivid, visual description
- Includes camera movement hints (slow pan, close-up, wide shot, etc.)
- Specifies lighting and color mood
- Avoids text, words, or human faces (AI video limitation)
- Is optimized for {aspect_ratio} aspect ratio

Respond with this exact JSON:
{{
  "clip_prompts": [
    {{
      "scene_number": 1,
      "prompt": "Detailed video generation prompt...",
      "duration": 6,
      "aspect_ratio": "{aspect_ratio}"
    }}
  ]
}}"""

    response = await gemini.generate(
        prompt,
        system_prompt=(
            "You are an expert at writing prompts for AI video generation. "
            "Your prompts produce cinematic, high-quality video clips. "
            "Always respond with valid JSON only, no markdown."
        ),
    )

    result = _parse_json(response.content)
    clip_prompts = result.get("clip_prompts", [])
    logger.info(f"Created {len(clip_prompts)} clip prompts")
    return clip_prompts


async def generate_clips(
    clip_prompts: list,
    resolution: str,
    on_clip_done: Optional[Callable] = None,
) -> tuple[list, list]:
    """Stage 3: Generate all clips in parallel via Grok."""
    logger.info(f"Generating {len(clip_prompts)} clips in parallel...")

    async def _gen_one(cp: dict, index: int) -> dict:
        video_bytes = await xai.generate_clip(
            prompt=cp["prompt"],
            duration=cp.get("duration", 5),
            aspect_ratio=cp.get("aspect_ratio", config.DEFAULT_ASPECT_RATIO),
            resolution=resolution,
        )
        s3_url = await storage.upload(video_bytes, f"clip_{index}.mp4")
        logger.info(f"Clip {index} uploaded: {len(video_bytes)} bytes")
        if on_clip_done:
            await on_clip_done(index, len(clip_prompts))
        return {
            "index": index,
            "s3_url": s3_url,
            "video_bytes": video_bytes,
            "duration": cp.get("duration", 5),
        }

    results = await asyncio.gather(
        *[_gen_one(cp, i) for i, cp in enumerate(clip_prompts)],
        return_exceptions=True,
    )

    clips, failed = [], []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.error(f"Clip {i} failed: {r}")
            failed.append({"index": i, "error": str(r)})
        else:
            clips.append(r)

    if not clips:
        raise RuntimeError(f"All clips failed: {failed}")

    clips.sort(key=lambda c: c["index"])
    return clips, failed


async def analyze_clips(clips: list, script: dict) -> list:
    """Stage 4: Gemini video analysis for edit notes."""
    scenes = script.get("scenes", [])
    logger.info(f"Analyzing {len(clips)} clips...")

    system_prompt = (
        "You are a professional video editor reviewing AI-generated video clips "
        "for a short ad. Analyze each clip against the script and provide edit notes. "
        "Always respond with valid JSON only, no markdown."
    )

    edit_notes = []
    for i, clip in enumerate(clips):
        video_bytes = clip.get("video_bytes")
        if not video_bytes:
            edit_notes.append({
                "clip_index": clip["index"],
                "quality": "unknown",
                "trim_start": 0,
                "trim_end": clip.get("duration", 6),
                "notes": "No video bytes for analysis",
            })
            continue

        scene = scenes[clip["index"]] if clip["index"] < len(scenes) else {}
        prompt = f"""Analyze this video clip for a {script.get('tone', 'cinematic')} ad.

This is clip {clip['index'] + 1} of {len(clips)}.
Intended scene: {json.dumps(scene, indent=2)}

Review the clip and provide edit notes as JSON:
{{
  "clip_index": {clip['index']},
  "quality": "good/acceptable/poor",
  "matches_scene": true/false,
  "trim_start": 0.0,
  "trim_end": {clip.get('duration', 6)},
  "suggested_order": {clip['index'] + 1},
  "transition_to_next": "crossfade",
  "notes": "Brief assessment"
}}

Be concise. Trim to keep only the best portion."""

        try:
            response = await gemini.analyze_video(
                prompt=prompt,
                video_bytes=video_bytes,
                system_prompt=system_prompt,
            )
            note = _parse_json(response.content)
            edit_notes.append(note)
            logger.info(f"Clip {clip['index']} analyzed: {note.get('quality')}")
        except Exception as e:
            logger.warning(f"Analysis failed for clip {clip['index']}: {e}")
            edit_notes.append({
                "clip_index": clip["index"],
                "quality": "acceptable",
                "trim_start": 0,
                "trim_end": clip.get("duration", 6),
                "suggested_order": clip["index"] + 1,
                "transition_to_next": "crossfade",
                "notes": f"Analysis failed ({type(e).__name__}), using as-is",
            })

    edit_notes.sort(key=lambda n: n.get("suggested_order", n.get("clip_index", 0)))
    return edit_notes


async def assemble_video(clips: list, edit_notes: list) -> tuple[str, float, int]:
    """Stage 5: ffmpeg assembly, upload to S3. Returns (url, duration, size_bytes)."""
    logger.info("Assembling final video...")
    final_bytes, duration = await ffmpeg.assemble(clips, edit_notes)
    url = await storage.upload(final_bytes, "ad_final.mp4")
    logger.info(f"Final video: {len(final_bytes)} bytes, {duration}s -> {url}")
    return url, duration, len(final_bytes)


async def critique_video(video_url: str, concept: str = "") -> dict:
    """Analyze a completed ad video and return the most critical gap."""
    import httpx

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(video_url)
        resp.raise_for_status()
        video_bytes = resp.content

    logger.info(f"Downloaded {len(video_bytes)} bytes for critique")

    concept_ctx = f"\n\nOriginal ad concept: {concept}" if concept else ""
    prompt = f"""You are a senior advertising creative director reviewing a video ad.
Watch this ad carefully and identify the single most critical thing it's missing
that would make the biggest difference to its effectiveness.{concept_ctx}

Respond in this exact JSON format:
{{
    "critique": "<one sentence: the most critical missing element>",
    "score": <1-10 overall effectiveness>,
    "strengths": ["<strength 1>", "<strength 2>"],
    "recommendation": "<specific, actionable fix for the missing element>"
}}

Be brutally honest. Focus on what matters most: does it sell? Does it connect emotionally?
Is the pacing right? Is there a clear call to action? Is the brand identity clear?
Return ONLY the JSON, no other text."""

    response = await gemini.analyze_video(
        prompt=prompt,
        video_bytes=video_bytes,
        system_prompt="You are an expert ad creative director. Be concise and direct.",
    )

    try:
        result = _parse_json(response.content)
    except (json.JSONDecodeError, ValueError):
        result = {
            "critique": response.content[:500],
            "score": None,
            "strengths": [],
            "recommendation": "",
        }

    return {
        "critique": result.get("critique", ""),
        "score": result.get("score"),
        "strengths": result.get("strengths", []),
        "recommendation": result.get("recommendation", ""),
        "video_size_bytes": len(video_bytes),
    }
