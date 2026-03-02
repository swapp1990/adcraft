"""AdCraft configuration — all settings from environment variables."""
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB
MONGODB_URI = os.getenv("MONGODB_URI", "")
DB_NAME = "adcraft"

# Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview")

# xAI / Grok
XAI_API_KEY = os.getenv("XAI_API_KEY", "")
XAI_API_BASE = "https://api.x.ai/v1"

# AWS S3
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET = os.getenv("S3_BUCKET", "swapp1990-adcraft")

# Video defaults
DEFAULT_NUM_CLIPS = 5
DEFAULT_DURATION = 30
DEFAULT_ASPECT_RATIO = "16:9"
DEFAULT_RESOLUTION = "480p"
CLIP_POLL_INTERVAL = 10
CLIP_POLL_TIMEOUT = 600
CROSSFADE_DURATION = 0.5
