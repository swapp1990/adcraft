"""ffmpeg video assembly — trim, strip audio, crossfade transitions, image-to-video."""
import os
import asyncio
import logging
import shutil
import subprocess
import tempfile
from typing import List, Dict, Optional, Tuple

from . import config

logger = logging.getLogger(__name__)


async def _run(cmd: List[str], timeout: int = 120) -> subprocess.CompletedProcess:
    return await asyncio.to_thread(subprocess.run, cmd, capture_output=True, timeout=timeout)


async def _probe_duration(path: str) -> float:
    result = await _run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        timeout=10,
    )
    try:
        return float(result.stdout.decode().strip())
    except (ValueError, AttributeError):
        return 5.0


async def image_to_video(
    image_bytes: bytes,
    duration: float = 4.0,
    fps: int = 24,
) -> Tuple[bytes, float]:
    """
    Convert a still image to a video clip with a subtle Ken Burns zoom effect.

    The output uses libx264 / yuv420p / 24fps to match all other clips in the
    pipeline so they can be assembled without codec mismatches.

    Args:
        image_bytes: Raw bytes of a PNG or JPEG image.
        duration: Desired clip duration in seconds.
        fps: Frames per second (default 24).

    Returns:
        Tuple of (video_bytes, actual_duration).
    """
    tmpdir = tempfile.mkdtemp(prefix="adcraft_img2vid_")
    try:
        # Detect format from magic bytes (PNG starts with \x89PNG; JPEG with \xff\xd8)
        ext = "png" if image_bytes[:4] == b"\x89PNG" else "jpg"
        img_path = os.path.join(tmpdir, f"frame.{ext}")
        out_path = os.path.join(tmpdir, "clip.mp4")

        with open(img_path, "wb") as f:
            f.write(image_bytes)

        total_frames = int(duration * fps)

        # Ken Burns: slow zoom from 1.0x to 1.05x over the clip duration.
        # zoompan filter: zoom expression linearly goes from 1 to 1.05 over
        # total_frames frames. x/y keep the image centred.
        zoom_expr = f"'min(zoom+{0.05 / total_frames:.6f},1.05)'"
        ken_burns = (
            f"zoompan=z={zoom_expr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            f":d={total_frames}:s=854x480:fps={fps}"
        )

        result = await _run([
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", img_path,
            "-vf", ken_burns,
            "-t", str(duration),
            "-c:v", "libx264",
            "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-r", str(fps),
            out_path,
        ], timeout=120)

        if result.returncode != 0:
            logger.warning(
                f"Ken Burns zoompan failed (stderr: {result.stderr.decode()[:300]}), "
                "falling back to simple loop encode"
            )
            # Fallback: plain still-image loop without zoom
            result = await _run([
                "ffmpeg", "-y",
                "-loop", "1",
                "-i", img_path,
                "-t", str(duration),
                "-vf", "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264",
                "-preset", "fast",
                "-pix_fmt", "yuv420p",
                "-r", str(fps),
                out_path,
            ], timeout=120)

            if result.returncode != 0:
                raise RuntimeError(
                    f"image_to_video failed: {result.stderr.decode()[:500]}"
                )

        actual_duration = await _probe_duration(out_path)
        with open(out_path, "rb") as f:
            video_bytes = f.read()

        logger.info(
            f"image_to_video: {len(image_bytes)} bytes image -> "
            f"{len(video_bytes)} bytes video ({actual_duration:.1f}s)"
        )
        return video_bytes, actual_duration

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


async def assemble(
    clips: List[Dict],
    edit_notes: List[Dict],
) -> tuple[bytes, Optional[float]]:
    """
    Trim, strip audio, and concatenate clips with crossfade.

    Args:
        clips: List of {"index": int, "video_bytes": bytes, "duration": float}
        edit_notes: List of {"clip_index": int, "trim_start": float, "trim_end": float, ...}

    Returns:
        (final_video_bytes, duration_seconds)
    """
    clip_map = {c["index"]: c for c in clips}
    note_map = {n.get("clip_index", i): n for i, n in enumerate(edit_notes)}

    # Determine clip order from edit_notes
    ordered = [n.get("clip_index", 0) for n in edit_notes if n.get("clip_index", 0) in clip_map]
    for c in clips:
        if c["index"] not in ordered:
            ordered.append(c["index"])

    tmpdir = tempfile.mkdtemp(prefix="adcraft_")

    try:
        # Step 1: Write and trim each clip
        trimmed_files = []
        for order_idx, clip_idx in enumerate(ordered):
            clip = clip_map[clip_idx]
            note = note_map.get(clip_idx, {})
            video_bytes = clip.get("video_bytes")
            if not video_bytes:
                continue

            raw_path = os.path.join(tmpdir, f"raw_{clip_idx}.mp4")
            with open(raw_path, "wb") as f:
                f.write(video_bytes)

            trim_start = note.get("trim_start", 0)
            trim_end = note.get("trim_end", clip.get("duration", 6))
            trimmed_path = os.path.join(tmpdir, f"trimmed_{order_idx:02d}.mp4")

            result = await _run([
                "ffmpeg", "-y", "-i", raw_path,
                "-ss", str(trim_start), "-to", str(trim_end),
                "-an", "-c:v", "libx264", "-preset", "fast",
                "-pix_fmt", "yuv420p", "-r", "24",
                trimmed_path,
            ], timeout=60)

            if result.returncode != 0:
                logger.warning(f"Trim failed for clip {clip_idx}, re-encoding without trim")
                result = await _run([
                    "ffmpeg", "-y", "-i", raw_path,
                    "-an", "-c:v", "libx264", "-preset", "fast",
                    "-pix_fmt", "yuv420p", "-r", "24",
                    trimmed_path,
                ], timeout=60)
                if result.returncode != 0:
                    logger.error(f"Re-encode failed for clip {clip_idx}")
                    continue

            trimmed_files.append(trimmed_path)

        if not trimmed_files:
            raise RuntimeError("No clips survived trimming")

        # Step 2: Concatenate with crossfade
        if len(trimmed_files) == 1:
            final_path = trimmed_files[0]
        else:
            final_path = os.path.join(tmpdir, "final.mp4")
            durations = [await _probe_duration(f) for f in trimmed_files]

            # Build xfade filter chain
            filter_parts = []
            cumulative_offset = 0.0
            xfade_dur = config.CROSSFADE_DURATION

            for i in range(len(trimmed_files) - 1):
                input_a = f"[{i}:v]" if i == 0 else f"[v{i-1}{i}]"
                input_b = f"[{i+1}:v]"
                output = f"[vout]" if i == len(trimmed_files) - 2 else f"[v{i}{i+1}]"

                cumulative_offset += durations[i] - xfade_dur
                offset = max(0, cumulative_offset)
                filter_parts.append(
                    f"{input_a}{input_b}xfade=transition=fade:duration={xfade_dur}:offset={offset:.2f}{output}"
                )

            inputs = []
            for f in trimmed_files:
                inputs.extend(["-i", f])

            result = await _run([
                "ffmpeg", "-y", *inputs,
                "-filter_complex", ";".join(filter_parts),
                "-map", "[vout]", "-c:v", "libx264",
                "-preset", "fast", "-pix_fmt", "yuv420p",
                final_path,
            ])

            if result.returncode != 0:
                logger.warning(f"xfade failed, falling back to simple concat")
                final_path = os.path.join(tmpdir, "final_simple.mp4")
                concat_list = os.path.join(tmpdir, "concat.txt")
                with open(concat_list, "w") as f:
                    for tf in trimmed_files:
                        f.write(f"file '{tf}'\n")

                result = await _run([
                    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                    "-i", concat_list, "-c:v", "libx264",
                    "-preset", "fast", "-pix_fmt", "yuv420p",
                    final_path,
                ])
                if result.returncode != 0:
                    raise RuntimeError(f"ffmpeg concat failed: {result.stderr.decode()[:500]}")

        duration = await _probe_duration(final_path)

        with open(final_path, "rb") as f:
            final_bytes = f.read()

        return final_bytes, duration

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
