# enhanced_endpoints.py
# Drop-in upgrade for /recommendations and /explainability
#
# Changes vs old version:
#   /recommendations  → uses confidence intervals + unreasonable flag + Claude-generated farmer message
#   /explainability   → real SHAP values from the RF model, not hardcoded percentages
#
# Install: pip install shap httpx
# Wire into main.py — see bottom of file

import os
import json
import httpx
import shap
import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# ─── Import shared state from main.py ────────────────────────────────────────
# When wiring in, replace these with your actual imports:
# from main import model, label_encoders, feature_columns, preprocess_info,
#                  CROP_THRESHOLDS, ALLOWED_COMMODITIES, build_feature_vector, normalize_input

# ─── Lazy SHAP explainer (init once on first call) ───────────────────────────
_explainer: Optional[shap.TreeExplainer] = None

def _get_explainer(model) -> shap.TreeExplainer:
    global _explainer
    if _explainer is None:
        _explainer = shap.TreeExplainer(model)
    return _explainer

# ─── Human-readable feature labels ──────────────────────────────────────────
FEATURE_LABELS: dict[str, str] = {
    "price_lag_1":  "Previous month price",
    "commodity":    "Crop type",
    "market":       "Market location",
    "admin1":       "Region / County",
    "pricetype":    "Price type (retail vs wholesale)",
    "month":        "Month of year",
    "year":         "Year",
    "quarter":      "Season / Quarter",
}

# ─── Gemini helper (replaces Claude) ─────────────────────────────────────────
from gemini_client import gemini as _call_gemini

async def _call_claude(prompt: str, max_tokens: int = 200) -> Optional[str]:
    """Alias kept so nothing else needs renaming."""
    return await _call_gemini(prompt, max_tokens)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. RECOMMENDATIONS ENGINE
# ═══════════════════════════════════════════════════════════════════════════════

class RecommendationRequest(BaseModel):
    commodity:       str
    market:          str
    admin1:          str
    pricetype:       str
    predicted_price: float
    previous_price:  float
    lower_bound:     Optional[float] = None
    upper_bound:     Optional[float] = None
    confidence_pct:  Optional[float] = None
    unreasonable:    Optional[bool]  = None

class RecommendationResponse(BaseModel):
    commodity:       str
    market:          str
    action:          str          # sell | hold | monitor
    urgency:         str          # immediate | soon | later | none
    price_trend:     str          # rising | falling | stable
    trend_pct:       float
    model_confidence: str         # high | medium | low
    reasons:         List[str]
    farmer_message:  str          # WhatsApp-ready, Claude-generated
    rationale:       str


def _decision_logic(
    predicted: float,
    previous:  float,
    lower:     float,
    upper:     float,
    conf_pct:  float,
    unreasonable: bool,
) -> tuple[str, str, str, str, list[str]]:
    """
    Returns: (action, urgency, trend, model_confidence, reasons)
    Uses the full prediction output — not just a naive % change.
    """
    trend_pct = ((predicted - previous) / previous) * 100
    interval_width = upper - lower
    # Relative uncertainty: how wide is the confidence band vs predicted price
    uncertainty_ratio = interval_width / predicted if predicted > 0 else 1.0

    # ── Trend label ──────────────────────────────────────────────────────────
    if trend_pct > 5:
        trend = "rising"
    elif trend_pct < -5:
        trend = "falling"
    else:
        trend = "stable"

    # ── Model confidence: degrade if interval is wide or flag is set ─────────
    if unreasonable or uncertainty_ratio > 0.35:
        conf = "low"
    elif uncertainty_ratio > 0.20 or conf_pct < 80:
        conf = "medium"
    else:
        conf = "high"

    reasons: list[str] = []

    # ── Core decision tree ───────────────────────────────────────────────────
    if conf == "low":
        # Don't make strong sell/hold calls when the model is uncertain
        action, urgency = "monitor", "later"
        reasons.append("⚠️ Model confidence is low — treat this as a rough guide")
        if unreasonable:
            reasons.append("⚠️ Predicted price is outside historical norms — verify locally")
        if uncertainty_ratio > 0.35:
            reasons.append(
                f"⚠️ Wide price range (KES {lower:.0f}–{upper:.0f}/kg) signals market volatility"
            )

    elif trend == "rising":
        if trend_pct > 15:
            action, urgency = "hold", "soon"
            reasons.append(f"📈 Strong price rise of {trend_pct:.1f}% expected — hold for now")
            reasons.append(f"Sell when prices peak near KES {upper:.0f}/kg")
        else:
            action, urgency = "hold", "monitor"
            reasons.append(f"📈 Moderate rise of {trend_pct:.1f}% expected — no urgency to sell yet")

    elif trend == "falling":
        if trend_pct < -15:
            action, urgency = "sell", "immediate"
            reasons.append(f"📉 Sharp drop of {abs(trend_pct):.1f}% forecast — sell before prices fall further")
        elif trend_pct < -5:
            action, urgency = "sell", "soon"
            reasons.append(f"📉 Prices expected to drop {abs(trend_pct):.1f}% — consider selling this week")
        else:
            action, urgency = "monitor", "later"
            reasons.append(f"Slight dip of {abs(trend_pct):.1f}% expected — monitor market daily")

    else:  # stable
        action, urgency = "hold", "none"
        reasons.append("Prices are stable — no urgent action needed")

    # ── Shared contextual notes ───────────────────────────────────────────────
    reasons.append(
        f"Forecast range: KES {lower:.0f}–{upper:.0f}/kg "
        f"(currently KES {previous:.0f}/kg)"
    )

    return action, urgency, trend, conf, reasons


async def get_recommendations(req: RecommendationRequest, ALLOWED_COMMODITIES: set) -> RecommendationResponse:
    norm = req.commodity.strip().lower()
    if norm not in ALLOWED_COMMODITIES:
        raise HTTPException(400, f"Commodity '{req.commodity}' not supported.")
    if req.previous_price <= 0:
        raise HTTPException(400, "previous_price must be > 0")

    # ── Fallbacks if C++ didn't send these fields ──
    lower_bound   = req.lower_bound   if req.lower_bound   is not None else req.previous_price * 0.90
    upper_bound   = req.upper_bound   if req.upper_bound   is not None else req.previous_price * 1.10
    confidence_pct = req.confidence_pct if req.confidence_pct is not None else 80.0
    unreasonable  = req.unreasonable  if req.unreasonable  is not None else False

    trend_pct = ((req.predicted_price - req.previous_price) / req.previous_price) * 100

    action, urgency, trend, conf, reasons = _decision_logic(
        req.predicted_price, req.previous_price,
        lower_bound, upper_bound,
        confidence_pct, unreasonable,
    )

    # ── Farmer-facing WhatsApp message via Claude ─────────────────────────────
    prompt = f"""You are a market advisor for Kenyan farmers. Write a WhatsApp message (under 180 chars) for this prediction.

Crop: {req.commodity} | Market: {req.market} | Pricetype: {req.pricetype}
Predicted: KES {req.predicted_price:.0f}/kg | Previous: KES {req.previous_price:.0f}/kg | Change: {trend_pct:+.1f}%
Range: KES {lower_bound:.0f}–{upper_bound:.0f}/kg | Confidence: {conf}
Action: {action.upper()} ({urgency})

Use simple English, occasional Swahili (habari, bei, mazao), and emojis.
Tell the farmer exactly what to do. Return ONLY the message."""

    farmer_msg = await _call_claude(prompt, max_tokens=120)
    if not farmer_msg:
        farmer_msg = (
            f"📊 {req.commodity} @ {req.market}: KES {req.predicted_price:.0f}/kg forecast. "
            f"Trend: {trend_pct:+.1f}%. Recommendation: *{action.upper()}*."
        )

    rationale = (
        f"Price {'rising' if trend_pct > 0 else 'falling'} {abs(trend_pct):.1f}% "
        f"from KES {req.previous_price:.0f} → KES {req.predicted_price:.0f}/kg at {req.market}. "
        f"Model confidence: {conf}. Interval width: KES {upper_bound - lower_bound:.0f}/kg."
    )

    return RecommendationResponse(
        commodity=req.commodity,
        market=req.market,
        action=action,
        urgency=urgency,
        price_trend=trend,
        trend_pct=round(trend_pct, 2),
        model_confidence=conf,
        reasons=reasons,
        farmer_message=farmer_msg,
        rationale=rationale,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SHAP EXPLAINABILITY (real, not hardcoded)
# ═══════════════════════════════════════════════════════════════════════════════

class ExplainRequest(BaseModel):
    """Same fields as PredictRequest — we re-run the feature vector internally"""
    date:                 str
    admin1:               str
    market:               str
    commodity:            str
    pricetype:            str
    previous_month_price: float

class FeatureSHAP(BaseModel):
    feature:        str          # human-readable name
    raw_name:       str          # original column name
    shap_value:     float        # signed contribution to predicted price
    direction:      str          # "raises price" | "lowers price" | "neutral"
    abs_importance: float

class ExplainResponse(BaseModel):
    commodity:              str
    market:                 str
    predicted_price:        float
    base_value:             float        # average prediction (SHAP baseline)
    top_factors:            List[FeatureSHAP]
    explanation_summary:    str          # Claude plain-English explanation
    confidence_factors:     Dict[str, Any]


async def get_explainability(
    req: ExplainRequest,
    model,
    feature_columns: list,
    ALLOWED_COMMODITIES: set,
    build_feature_vector,   # pass in main.py's build_feature_vector fn
) -> ExplainResponse:

    norm = req.commodity.strip().lower()
    if norm not in ALLOWED_COMMODITIES:
        raise HTTPException(400, f"Commodity '{req.commodity}' not supported.")

    # ── Build feature vector (reuse existing logic) ───────────────────────────
    # build_feature_vector expects a PredictRequest-compatible object
    X,_ = build_feature_vector(req)      # shape: (1, n_features)

    # ── SHAP values ──────────────────────────────────────────────────────────
    explainer    = _get_explainer(model)
    shap_vals    = explainer.shap_values(X)      # shape: (1, n_features) for RF regressor
    sv           = shap_vals[0]                  # 1D array of SHAP values
    base_value   = float(explainer.expected_value)
    predicted    = float(base_value + sv.sum())  # SHAP identity

    # ── Build ranked factor list ──────────────────────────────────────────────
    factors: list[FeatureSHAP] = []
    for i, col in enumerate(feature_columns):
        sv_i = float(sv[i])
        if abs(sv_i) < 0.001:
            continue  # skip near-zero contributions
        factors.append(FeatureSHAP(
            feature=FEATURE_LABELS.get(col, col.replace("_", " ").title()),
            raw_name=col,
            shap_value=round(sv_i, 4),
            direction=(
                "raises price" if sv_i > 0.05
                else "lowers price" if sv_i < -0.05
                else "neutral"
            ),
            abs_importance=round(abs(sv_i), 4),
        ))

    factors.sort(key=lambda f: f.abs_importance, reverse=True)
    top_5 = factors[:5]

    # ── Claude explanation ────────────────────────────────────────────────────
    factor_lines = "\n".join(
        f"- {f.feature}: {f.direction} by KES {f.abs_importance:.2f}"
        for f in top_5[:3]
    )
    explain_prompt = f"""Explain in 2–3 plain sentences why a machine learning model predicted 
{req.commodity} prices at {req.market} to be KES {predicted:.0f}/kg.

Key drivers:
{factor_lines}
Baseline (average price): KES {base_value:.0f}/kg

Write for a Kenyan agricultural extension officer. Plain English, no jargon, no markdown."""

    summary = await _call_claude(explain_prompt, max_tokens=180)
    if not summary:
        top = top_5[0].feature if top_5 else "historical price"
        summary = (
            f"The forecast of KES {predicted:.0f}/kg for {req.commodity} at {req.market} "
            f"is mainly driven by {top}. "
            f"The model baseline is KES {base_value:.0f}/kg."
        )

    # ── Confidence metadata ───────────────────────────────────────────────────
    total_abs_shap = sum(f.abs_importance for f in factors)
    top_factor_pct = (top_5[0].abs_importance / total_abs_shap * 100) if top_5 and total_abs_shap else 0

    confidence_factors = {
        "shap_base_value_kes":        round(base_value, 2),
        "total_shap_contribution_kes": round(total_abs_shap, 2),
        "top_factor":                 top_5[0].feature if top_5 else "N/A",
        "top_factor_pct_of_total":    round(top_factor_pct, 1),
        "active_features":            len(factors),
    }

    return ExplainResponse(
        commodity=req.commodity,
        market=req.market,
        predicted_price=round(predicted, 2),
        base_value=round(base_value, 2),
        top_factors=top_5,
        explanation_summary=summary,
        confidence_factors=confidence_factors,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# WIRE INTO main.py
# ═══════════════════════════════════════════════════════════════════════════════
#
# In main.py, replace the old endpoint functions with:
#
# from enhanced_endpoints import (
#     RecommendationRequest, RecommendationResponse, get_recommendations,
#     ExplainRequest, ExplainResponse, get_explainability,
# )
#
# @app.post("/recommendations", response_model=RecommendationResponse)
# async def recommendations(req: RecommendationRequest):
#     return await get_recommendations(req, ALLOWED_COMMODITIES)
#
# @app.post("/explainability", response_model=ExplainResponse)
# async def explainability(req: ExplainRequest):
#     return await get_explainability(
#         req, model, feature_columns, ALLOWED_COMMODITIES, build_feature_vector
#     )