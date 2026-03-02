"""
Ad video generation pipeline — 5 stages, no framework dependencies.

1. generate_script   — Gemini writes structured ad script with typed scenes
2. create_clip_prompts — Gemini converts scenes to method-optimized prompts
3. generate_clips    — Parallel clip generation (image_static / image_animate / direct_video)
4. analyze_clips     — Gemini video analysis for edit notes
5. assemble_video    — ffmpeg trim + crossfade assembly
"""
import json
import asyncio
import logging
from typing import Dict, Any, Callable, Optional

from . import gemini, xai, ffmpeg, storage, config
from . import image_gen

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
    """Stage 1: Gemini writes a structured ad script with typed, method-labelled scenes.

    Scene types: intro | lifestyle | product | cta
    Scene methods: image_static | image_animate | direct_video

    Enforced structure:
    - First scene: type="intro", method="image_static" (brand identity frame)
    - Last scene: type="cta", method="image_static" (call-to-action end card)
    - At least one middle scene: type="product"
    """
    logger.info(f"Generating script for: {concept[:80]}...")

    prompt = f"""Write a structured ad script for the following concept:

CONCEPT: {concept}

Requirements:
- Create exactly {num_clips} scenes
- Total duration across all scenes should be approximately {target_duration} seconds
- Each scene should be 4-8 seconds
- Each scene needs a vivid visual description (no text overlays or speech)
- Focus on visual storytelling — no dialogue, just cinematic imagery
- Assign each scene a "type" and a "method" according to the rules below

SCENE TYPES:
- intro: Brand identity opener — must include the brand name and set the tone
- lifestyle: Atmospheric or emotional scene showing the product's world
- product: Close-up or feature showcase of the actual product/app/service
- cta: Call-to-action end card — must include a clear action prompt (e.g. "Download Now", "Try Free")

SCENE METHODS:
- image_static: Use Gemini image generation to create a composed still frame, then pad it to a short video. Best for: intro, cta, and any scene where text or brand elements must be readable.
- image_animate: Use Gemini image generation to create a still frame, then animate it with Grok image-to-video. Best for: product shots where a composed starting frame is important but motion adds value.
- direct_video: Use Grok text-to-video directly. Best for: lifestyle/atmospheric scenes with natural motion.

MANDATORY STRUCTURE:
1. The FIRST scene MUST have type="intro" and method="image_static". Its description must feature the brand name prominently.
2. The LAST scene MUST have type="cta" and method="image_static". Its description must contain a specific call-to-action text phrase (e.g. "Download ZenFit Free", "Shop Now at BrandName.com").
3. At least ONE middle scene must have type="product".
4. The remaining middle scenes should use type="lifestyle" with method="direct_video" for natural motion.

Respond with this exact JSON structure:
{{
  "title": "Ad title",
  "tone": "warm/energetic/dramatic/etc",
  "scenes": [
    {{
      "scene_number": 1,
      "type": "intro",
      "method": "image_static",
      "description": "Detailed visual description of what happens in this scene",
      "duration_seconds": 4,
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
            "You always assign scene types and methods that will produce the best result. "
            "Always respond with valid JSON only, no markdown."
        ),
    )

    script = _parse_json(response.content)
    scenes = script.get("scenes", [])

    # Enforce structure: first scene must be intro/image_static
    if scenes:
        scenes[0]["type"] = "intro"
        scenes[0]["method"] = "image_static"

    # Enforce structure: last scene must be cta/image_static
    if len(scenes) > 1:
        scenes[-1]["type"] = "cta"
        scenes[-1]["method"] = "image_static"

    # Enforce: at least one middle scene is type "product"
    if len(scenes) > 2:
        has_product = any(s.get("type") == "product" for s in scenes[1:-1])
        if not has_product:
            # Assign the scene closest to the middle as product
            mid = len(scenes) // 2
            scenes[mid]["type"] = "product"
            if scenes[mid].get("method") == "direct_video":
                scenes[mid]["method"] = "image_animate"

    script["scenes"] = scenes
    logger.info(f"Script ready: {script.get('title')}, {len(scenes)} scenes")
    return script


async def create_clip_prompts(
    script: dict, aspect_ratio: str, target_duration: int = 30
) -> list:
    """Stage 2: Convert scenes to method-optimized prompts.

    Prompts are tuned differently per method:
    - image_static: composition, text placement, brand elements (still frame)
    - image_animate: a frame designed to animate well (motion implied in scene)
    - direct_video: camera movement, motion, cinematic flow (unchanged from v1)

    The type and method fields are passed through to Stage 3.
    After LLM generation, durations are normalized to sum to target_duration.
    """
    scenes = script.get("scenes", [])
    logger.info(f"Creating {len(scenes)} clip prompts...")

    per_clip_avg = target_duration / max(len(scenes), 1)

    prompt = f"""Convert these ad scenes into generation prompts optimized for each scene's method.

AD TONE: {script.get('tone', 'cinematic')}
TARGET TOTAL DURATION: {target_duration} seconds (allocate durations so they sum to exactly {target_duration}s)
SCENES:
{json.dumps(scenes, indent=2)}

For each scene, write a prompt tuned to its METHOD:

METHOD GUIDELINES:
- image_static: Write a highly detailed still image composition prompt for a professional advertisement. Include: specific colour palette (hex or descriptive), lighting direction and quality (e.g. "warm golden backlight", "soft studio lighting"), texture and material details, background treatment (gradient, bokeh, environment), precise text placement and styling (e.g. "bold white sans-serif headline centered upper third"), and overall mood. Think like a graphic designer creating a hero banner or social media ad card. The result should look like a polished ad frame, NOT a generic stock photo.
- image_animate: Write a detailed still image prompt that captures a visually striking starting frame for animation. Include rich visual details: lighting, depth of field, colour grading, material textures. The composition should have clear foreground/background separation to animate well. Include a brief "animation_direction" hint (e.g. "slow zoom in on product", "gentle parallax pan left") as a separate field.
- direct_video: Write a video generation prompt with camera movement hints (slow pan, close-up, wide shot), lighting, colour mood, and motion. Optimized for {aspect_ratio} aspect ratio. Avoid text or words.

IMPORTANT: The "duration" values across ALL clips MUST sum to exactly {target_duration} seconds. Average ~{per_clip_avg:.0f}s per clip.

Respond with this exact JSON:
{{
  "clip_prompts": [
    {{
      "scene_number": 1,
      "type": "intro",
      "method": "image_static",
      "prompt": "Detailed prompt appropriate for the method...",
      "animation_direction": "slow zoom in",
      "duration": {per_clip_avg:.0f},
      "aspect_ratio": "{aspect_ratio}"
    }}
  ]
}}

Include "animation_direction" for image_animate scenes only (set to null or omit for others).
Always include "type" and "method" fields — copy them from the scene."""

    response = await gemini.generate(
        prompt,
        system_prompt=(
            "You are an expert at writing prompts for AI image and video generation. "
            "You tailor prompts to the specific generation method for maximum quality. "
            "Always respond with valid JSON only, no markdown."
        ),
    )

    result = _parse_json(response.content)
    clip_prompts = result.get("clip_prompts", [])

    # Ensure type/method are present (fallback to scene values if Gemini dropped them)
    for i, cp in enumerate(clip_prompts):
        scene = scenes[i] if i < len(scenes) else {}
        if "type" not in cp:
            cp["type"] = scene.get("type", "lifestyle")
        if "method" not in cp:
            cp["method"] = scene.get("method", "direct_video")

    # Force user's aspect ratio on all clips (don't rely on LLM)
    for cp in clip_prompts:
        cp["aspect_ratio"] = aspect_ratio

    # Normalize durations to sum to target_duration
    if clip_prompts:
        total = sum(float(cp.get("duration", per_clip_avg)) for cp in clip_prompts)
        if total > 0 and abs(total - target_duration) > 1:
            scale = target_duration / total
            for cp in clip_prompts:
                cp["duration"] = round(float(cp.get("duration", per_clip_avg)) * scale)
            # Fix rounding: adjust last clip to hit exact target
            adjusted_total = sum(cp["duration"] for cp in clip_prompts)
            clip_prompts[-1]["duration"] += target_duration - adjusted_total

    logger.info(
        f"Created {len(clip_prompts)} clip prompts, "
        f"aspect_ratio={aspect_ratio}, "
        f"total duration: {sum(cp.get('duration', 0) for cp in clip_prompts)}s"
    )
    return clip_prompts


async def generate_clips(
    clip_prompts: list,
    resolution: str,
    on_clip_done: Optional[Callable] = None,
) -> tuple[list, list]:
    """Stage 3: Generate all clips in parallel using per-clip method dispatch.

    Methods:
    - image_static:  image_gen.generate_image() -> ffmpeg.image_to_video() -> S3
    - image_animate: image_gen.generate_image() -> S3 (image) -> xai.animate_image() -> S3
                     Fallback to image_static if xai.animate_image() fails.
    - direct_video:  xai.generate_clip() -> S3 (unchanged from v1)
    """
    logger.info(f"Generating {len(clip_prompts)} clips in parallel...")

    async def _gen_image_static(cp: dict, index: int) -> dict:
        """Still image -> ffmpeg padded video clip."""
        ar = cp.get("aspect_ratio", config.DEFAULT_ASPECT_RATIO)
        image_bytes, image_url = await image_gen.generate_image(
            prompt=cp["prompt"],
            aspect_ratio=ar,
        )
        duration = float(cp.get("duration", 4))
        video_bytes, actual_duration = await ffmpeg.image_to_video(
            image_bytes=image_bytes,
            duration=duration,
            aspect_ratio=ar,
        )
        s3_url = await storage.upload(video_bytes, f"clip_{index}.mp4")
        logger.info(f"Clip {index} (image_static) uploaded: {len(video_bytes)} bytes")
        return {
            "index": index,
            "s3_url": s3_url,
            "image_url": image_url,
            "video_bytes": video_bytes,
            "duration": actual_duration,
            "method": "image_static",
        }

    async def _gen_image_animate(cp: dict, index: int) -> dict:
        """Still image -> Grok image-to-video. Falls back to image_static on error."""
        ar = cp.get("aspect_ratio", config.DEFAULT_ASPECT_RATIO)
        image_bytes, image_url = await image_gen.generate_image(
            prompt=cp["prompt"],
            aspect_ratio=ar,
        )
        duration = int(cp.get("duration", 5))

        # Build animation prompt: combine main prompt with animation_direction hint
        anim_prompt = cp["prompt"]
        anim_dir = cp.get("animation_direction")
        if anim_dir:
            anim_prompt = f"{anim_prompt}. Animation: {anim_dir}."

        try:
            video_bytes = await xai.animate_image(
                image_url=image_url,
                prompt=anim_prompt,
                duration=duration,
                aspect_ratio=ar,
                resolution=resolution,
            )
            s3_url = await storage.upload(video_bytes, f"clip_{index}.mp4")
            logger.info(f"Clip {index} (image_animate) uploaded: {len(video_bytes)} bytes")
            return {
                "index": index,
                "s3_url": s3_url,
                "image_url": image_url,
                "video_bytes": video_bytes,
                "duration": float(duration),
                "method": "image_animate",
            }
        except Exception as e:
            logger.warning(
                f"Clip {index}: image_animate failed ({e}), falling back to image_static"
            )
            video_bytes, actual_duration = await ffmpeg.image_to_video(
                image_bytes=image_bytes,
                duration=float(duration),
                aspect_ratio=ar,
            )
            s3_url = await storage.upload(video_bytes, f"clip_{index}.mp4")
            logger.info(
                f"Clip {index} (image_animate->image_static fallback) uploaded: {len(video_bytes)} bytes"
            )
            return {
                "index": index,
                "s3_url": s3_url,
                "image_url": image_url,
                "video_bytes": video_bytes,
                "duration": actual_duration,
                "method": "image_static",  # reflects actual method used
            }

    async def _gen_direct_video(cp: dict, index: int) -> dict:
        """Text prompt -> Grok text-to-video (unchanged from v1)."""
        video_bytes = await xai.generate_clip(
            prompt=cp["prompt"],
            duration=cp.get("duration", 5),
            aspect_ratio=cp.get("aspect_ratio", config.DEFAULT_ASPECT_RATIO),
            resolution=resolution,
        )
        s3_url = await storage.upload(video_bytes, f"clip_{index}.mp4")
        logger.info(f"Clip {index} (direct_video) uploaded: {len(video_bytes)} bytes")
        return {
            "index": index,
            "s3_url": s3_url,
            "video_bytes": video_bytes,
            "duration": cp.get("duration", 5),
            "method": "direct_video",
        }

    async def _gen_one(cp: dict, index: int) -> dict:
        method = cp.get("method", "direct_video")
        if method == "image_static":
            result = await _gen_image_static(cp, index)
        elif method == "image_animate":
            result = await _gen_image_animate(cp, index)
        else:
            result = await _gen_direct_video(cp, index)

        if on_clip_done:
            await on_clip_done(index, len(clip_prompts))
        return result

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
            # Always use the actual clip index, not whatever Gemini returns
            note["clip_index"] = clip["index"]
            edit_notes.append(note)
            logger.info(f"Clip {clip['index']} analyzed: {note.get('quality')}")
        except Exception as e:
            logger.warning(f"Analysis failed for clip {clip['index']}: {e}")
            edit_notes.append({
                "clip_index": clip["index"],
                "quality": "acceptable",
                "trim_start": 0,
                "trim_end": clip.get("duration", 6),
                "transition_to_next": "crossfade",
                "notes": f"Analysis failed ({type(e).__name__}), using as-is",
            })

    # Keep original script order — intro must stay first, CTA must stay last
    edit_notes.sort(key=lambda n: n["clip_index"])
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
