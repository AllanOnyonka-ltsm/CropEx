# intent_router.py
# CropEx — Intelligent WhatsApp intent classifier
# Drop this into your FastAPI app and wire /webhook to route_message()

import re
import os
import json
import httpx
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

# ─── Enums & Data ────────────────────────────────────────────────────────────

class Intent(str, Enum):
    GREETING    = "GREETING"
    PRICE_QUERY = "PRICE_QUERY"
    SELL_ORDER  = "SELL_ORDER"
    BUY_ORDER   = "BUY_ORDER"
    UNKNOWN     = "UNKNOWN"

# Swahili + English → canonical exchange symbol
CROP_MAP: dict[str, str] = {
    # Maize
    "maize": "MAIZE", "corn": "MAIZE", "mahindi": "MAIZE",
    # Tomatoes
    "tomatoes": "TOMATO", "tomato": "TOMATO", "nyanya": "TOMATO",
    # Potatoes
    "potatoes": "POTATO", "potato": "POTATO", "viazi": "POTATO",
    # Beans
    "beans": "BEANS", "bean": "BEANS", "maharagwe": "BEANS",
    # Wheat
    "wheat": "WHEAT", "ngano": "WHEAT",
    # Rice
    "rice": "RICE", "mchele": "RICE", "wali": "RICE",
    # Sorghum
    "sorghum": "SORGHUM", "mtama": "SORGHUM",
    # Onions
    "onions": "ONION", "onion": "ONION", "vitunguu": "ONION",
    # Cassava
    "cassava": "CASSAVA", "muhogo": "CASSAVA",
}

GREETINGS = {
    "hi", "hello", "hey", "hei",          # English
    "jambo", "habari", "mambo", "sasa",    # Swahili
    "niaje", "salama", "vipi", "uko",
}

PRICE_KEYWORDS = {"price", "bei", "cost", "thamani", "ngapi", "how much", "market", "rate"}

MENU_TEXT = (
    "👋 *CropEx* — Your Smart Market / Soko Lako\n"
    "━━━━━━━━━━━━━━\n"
    "📊 *Check prices / Angalia bei:*\n"
    "  'Price of maize' / 'Bei ya mahindi'\n\n"
    "💰 *Sell crops / Uza mazao:*\n"
    "  'Sell 50 bags of maize' / 'Uza magunia 50 ya mahindi'\n\n"
    "🛒 *Buy crops / Nunua mazao:*\n"
    "  'Buy 10 bags of potatoes' / 'Nunua magunia 10 ya viazi'\n\n"
    "🌾 *Supported crops / Mazao yanayoungwa mkono:*\n"
    "Maize/Mahindi • Tomatoes/Nyanya\n"
    "Potatoes/Viazi • Beans/Maharagwe\n"
    "Wheat/Ngano • Rice/Mchele\n"
    "━━━━━━━━━━━━━━\n"
    "_Powered by CropEx Exchange_ 🌱"
)

# ─── Dataclass ───────────────────────────────────────────────────────────────

@dataclass
class ParsedIntent:
    intent:   Intent
    symbol:   Optional[str]   = None
    quantity: Optional[float] = None
    unit:     Optional[str]   = None
    raw_text: str             = ""
    via_llm:  bool            = False   # flag if Claude fallback was used

# ─── Rule-based parser ───────────────────────────────────────────────────────

def _find_crop(text: str) -> Optional[str]:
    for word in text.lower().split():
        if word in CROP_MAP:
            return CROP_MAP[word]
    return None

TRADE_RE = re.compile(
    r'\b(sell|buy|uza|nunua)\b'                      # action verb
    r'.*?(\d+(?:\.\d+)?)\s*'                         # quantity
    r'(bags?|sacks?|kg|kgs|tonnes?|crates?)?\s*'     # optional unit
    r'(?:of\s+)?([a-z]+)',                            # crop word
    re.IGNORECASE
)

def rule_based_parse(text: str) -> Optional[ParsedIntent]:
    t = text.strip().lower()
    tokens = set(t.split())

    # 1. Greeting
    if tokens & GREETINGS or t in GREETINGS:
        return ParsedIntent(intent=Intent.GREETING, raw_text=text)

    # 2. Trade order: sell/buy X bags of CROP
    match = TRADE_RE.search(t)
    if match:
        verb, qty, unit, crop_word = match.groups()
        intent = Intent.SELL_ORDER if verb.lower() in ("sell", "uza") else Intent.BUY_ORDER
        return ParsedIntent(
            intent=intent,
            symbol=CROP_MAP.get(crop_word),
            quantity=float(qty),
            unit=unit or "bags",
            raw_text=text,
        )

    # 3. Price query
    if tokens & PRICE_KEYWORDS:
        return ParsedIntent(
            intent=Intent.PRICE_QUERY,
            symbol=_find_crop(t),
            raw_text=text,
        )

    # 4. Bare crop name → treat as price query
    sym = _find_crop(t)
    if sym:
        return ParsedIntent(intent=Intent.PRICE_QUERY, symbol=sym, raw_text=text)

    return None  # hand off to LLM fallback

# ─── Claude fallback (handles fuzzy / Swahili-heavy inputs) ──────────────────

FALLBACK_PROMPT_TEMPLATE = """You are an intent parser for CropEx, an agricultural trading platform in Kenya.

Classify this farmer WhatsApp message: "{text}"

Return ONLY valid JSON, no markdown, no explanation:
{{"intent": "GREETING|PRICE_QUERY|SELL_ORDER|BUY_ORDER|UNKNOWN", "symbol": "MAIZE|TOMATO|POTATO|BEANS|WHEAT|RICE|SORGHUM|ONION|CASSAVA|null", "quantity": number_or_null, "unit": "bags|kg|tonnes|crates|null"}}

Swahili: mahindi=MAIZE, nyanya=TOMATO, viazi=POTATO, maharagwe=BEANS, ngano=WHEAT, mchele=RICE, mtama=SORGHUM, vitunguu=ONION, muhogo=CASSAVA. uza=sell, nunua=buy"""

async def llm_fallback(text: str) -> ParsedIntent:
    from gemini_client import gemini
    
    prompt = FALLBACK_PROMPT_TEMPLATE.format(text=text)
    raw = await gemini(prompt, max_tokens=80)
    
    if not raw:
        return ParsedIntent(intent=Intent.UNKNOWN, raw_text=text)
    
    try:
        # Strip markdown fences if Gemini wraps in ```json
        clean = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(clean)
        return ParsedIntent(
            intent=Intent(parsed.get("intent", "UNKNOWN")),
            symbol=parsed.get("symbol"),
            quantity=parsed.get("quantity"),
            unit=parsed.get("unit"),
            raw_text=text,
            via_llm=True,
        )
    except Exception:
        return ParsedIntent(intent=Intent.UNKNOWN, raw_text=text)

# ─── Main entry point ────────────────────────────────────────────────────────

async def parse_intent(text: str) -> ParsedIntent:
    """
    Try rule-based first (zero latency).
    Fall back to Claude Haiku only when rules can't classify.
    """
    result = rule_based_parse(text)
    if result is not None:
        return result
    return await llm_fallback(text)

# ─── Response builder (returns dict for Liman's engine) ──────────────────────

def build_response(p: ParsedIntent) -> dict:
    """
    Returns structured payload for the C++ engine + optional sms fallback.
    Engine reads: intent, symbol, quantity, unit
    SMS is returned when the engine doesn't need to respond (greetings, errors).
    """
    base = {
        "intent":   p.intent,
        "symbol":   p.symbol,
        "quantity": p.quantity,
        "unit":     p.unit,
        "via_llm":  p.via_llm,
        "sms":      None,
    }

    if p.intent == Intent.GREETING:
        base["sms"] = MENU_TEXT

    elif p.intent == Intent.PRICE_QUERY and not p.symbol:
        base["sms"] = (
            "🌾 Which crop do you want prices for? / Unataka bei ya zao gani?\n"
            "E.g: 'Price of maize' or 'Bei ya mahindi'"
        )

    elif p.intent in (Intent.SELL_ORDER, Intent.BUY_ORDER) and not p.symbol:
        base["sms"] = (
            "❓ Which crop? / Unauza au unanunua zao gani?\n"
            "Try: 'Sell 50 bags of *maize*' or 'Uza magunia 50 ya *mahindi*'"
        )

    elif p.intent == Intent.UNKNOWN:
        base["sms"] = f"❓ Sijui hiyo / I didn't understand.\n\n{MENU_TEXT}"

    return base

# ─── FastAPI route (wire into your app) ──────────────────────────────────────

# from fastapi import FastAPI
# from pydantic import BaseModel
# app = FastAPI()
#
# class WebhookBody(BaseModel):
#     from_number: str
#     body: str
#
# @app.post("/webhook")
# async def webhook(payload: WebhookBody):
#     parsed   = await parse_intent(payload.body)
#     response = build_response(parsed)
#     return response