# gemini_client.py
# Shared Gemini Flash helper — import this everywhere you were calling Claude
# Free tier: 15 req/min, 1500 req/day — more than enough for a hackathon
#
# pip install httpx
# Set env var: GEMINI_API_KEY=your_key
# Get key free at: https://aistudio.google.com/app/apikey

import os
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-1.5-flash:generateContent"
)

async def gemini(prompt: str, max_tokens: int = 200) -> Optional[str]:
    """
    Single shared async helper for all Gemini calls.
    Returns the text response, or None if anything fails.
    """
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None

    payload = {
        "contents": [
            {"parts": [{"text": prompt}]}
        ],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.3,        # low temp = consistent, factual outputs
        }
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.post(
                GEMINI_URL,
                params={"key": key},
                json=payload,
            )
            data = r.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


# ── Sync version for intent_router.py (webhook is sync in some setups) ────────
import httpx

def gemini_sync(prompt: str, max_tokens: int = 150) -> Optional[str]:
    key = os.getenv("GEMINI_API_KEY", "")
    if not key:
        return None

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": 0.2}
    }

    try:
        with httpx.Client(timeout=6.0) as client:
            r = client.post(GEMINI_URL, params={"key": key}, json=payload)
            data = r.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None