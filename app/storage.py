"""S3 storage — upload videos and clips."""
import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import boto3

from . import config

logger = logging.getLogger(__name__)

_s3_client = None
_executor = ThreadPoolExecutor(max_workers=4)


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            aws_access_key_id=config.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=config.AWS_SECRET_ACCESS_KEY,
            region_name=config.AWS_REGION,
        )
    return _s3_client


def _generate_key(filename: str) -> str:
    now = datetime.now(timezone.utc)
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "mp4"
    uid = uuid.uuid4().hex[:12]
    return f"{now.year}/{now.month:02d}/{now.day:02d}/{uid}.{ext}"


async def upload(
    data: bytes,
    filename: str = "video.mp4",
    content_type: str = "video/mp4",
) -> str:
    """Upload bytes to S3, return public URL."""
    s3 = _get_s3()
    key = _generate_key(filename)
    bucket = config.S3_BUCKET

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        _executor,
        lambda: s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        ),
    )

    url = f"https://{bucket}.s3.{config.AWS_REGION}.amazonaws.com/{key}"
    logger.info(f"Uploaded {len(data)} bytes -> {url}")
    return url
