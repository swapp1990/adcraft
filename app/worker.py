"""Background worker — polls for pending jobs and processes them."""
import asyncio
import logging
import traceback

from . import jobs, pipeline, config

logger = logging.getLogger(__name__)

POLL_INTERVAL = 2.0


async def process_generate(job: dict):
    """Run the full ad video generation pipeline."""
    params = job["input_params"]
    concept = params.get("concept", "")
    num_clips = params.get("num_clips", config.DEFAULT_NUM_CLIPS)
    target_duration = params.get("target_duration", config.DEFAULT_DURATION)
    aspect_ratio = params.get("aspect_ratio", config.DEFAULT_ASPECT_RATIO)
    resolution = params.get("resolution", config.DEFAULT_RESOLUTION)

    # Stage 1
    script = await pipeline.generate_script(concept, num_clips, target_duration)

    # Stage 2
    clip_prompts = await pipeline.create_clip_prompts(script, aspect_ratio)

    # Stage 3
    clips, failed = await pipeline.generate_clips(clip_prompts, resolution)

    # Stage 4
    edit_notes = await pipeline.analyze_clips(clips, script)

    # Stage 5
    video_url, duration, size_bytes = await pipeline.assemble_video(clips, edit_notes)

    return {
        "video_url": video_url,
        "script": script,
        "clip_urls": [c["s3_url"] for c in clips],
        "edit_notes": edit_notes,
        "metadata": {
            "concept": concept,
            "target_duration": target_duration,
            "num_clips": num_clips,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "final_duration_seconds": duration,
            "final_file_size_bytes": size_bytes,
            "failed_clips": failed,
        },
    }


async def process_critique(job: dict):
    """Run the ad critique pipeline."""
    params = job["input_params"]
    video_url = params.get("video_url", "")
    concept = params.get("concept", "")

    if not video_url:
        raise ValueError("video_url is required")

    result = await pipeline.critique_video(video_url, concept)
    return {
        "critique": result["critique"],
        "score": result["score"],
        "strengths": result["strengths"],
        "recommendation": result["recommendation"],
        "metadata": {
            "video_url": video_url,
            "concept": concept,
            "video_size_bytes": result["video_size_bytes"],
        },
    }


HANDLERS = {
    "generate": process_generate,
    "critique": process_critique,
}


async def run():
    """Poll loop — picks up pending jobs and processes them."""
    logger.info(f"Worker started. Handlers: {list(HANDLERS.keys())}")

    while True:
        for job_type, handler in HANDLERS.items():
            job = await jobs.claim_pending(job_type)
            if not job:
                continue

            job_id = job["id"]
            logger.info(f"Processing {job_type} job {job_id}")

            try:
                output = await handler(job)
                await jobs.complete_job(job_id, output)
                logger.info(f"Job {job_id} completed")
            except Exception as e:
                logger.error(f"Job {job_id} failed: {e}\n{traceback.format_exc()}")
                await jobs.fail_job(job_id, str(e))

        await asyncio.sleep(POLL_INTERVAL)
