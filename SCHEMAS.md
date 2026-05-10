# CropEx API Schemas — Integration Reference

Complete request/response schemas for all endpoints. Use this as your integration contract.

---

## 🌾 Webhook (Intent Routing)

**Endpoint:** `POST /webhook`  
**Purpose:** Classify WhatsApp messages into structured intents (GREETING, PRICE_QUERY, SELL_ORDER, BUY_ORDER, UNKNOWN)  
**Latency:** ~50ms (rule-based) or ~2s (Gemini fallback)

### Request

```json
{
  "from_number": "+254712345678",
  "body": "price of mahindi"
}
```

| Field | Type | Required | Example | Notes |
|-------|------|----------|---------|-------|
| `from_number` | string | ✅ | `"+254712345678"` | WhatsApp number (any format) |
| `body` | string | ✅ | `"price of mahindi"` | User message (English or Swahili) |

### Response (Success — 200 OK)

```json
{
  "intent": "PRICE_QUERY",
  "symbol": "MAIZE",
  "quantity": null,
  "unit": null,
  "via_llm": false,
  "sms": null
}
```

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `intent` | enum | `GREETING`, `PRICE_QUERY`, `SELL_ORDER`, `BUY_ORDER`, `UNKNOWN` | What the farmer is asking for |
| `symbol` | string | `MAIZE`, `TOMATO`, `POTATO`, `BEANS`, `WHEAT`, `RICE`, `SORGHUM`, `ONION`, `CASSAVA`, or `null` | Canonical crop symbol for C++ engine |
| `quantity` | float | `null` or number | Quantity for SELL_ORDER/BUY_ORDER (from "50 bags") |
| `unit` | string | `"bags"`, `"kg"`, `"tonnes"`, `"crates"`, or `null` | Unit of quantity |
| `via_llm` | bool | `true`, `false` | Was Gemini used? (rule-based if `false`) |
| `sms` | string | `null` or helpful text | Fallback SMS for GREETING/UNKNOWN intents |

### Response Examples

#### 1. Greeting (returns menu)
```json
{
  "intent": "GREETING",
  "symbol": null,
  "quantity": null,
  "unit": null,
  "via_llm": false,
  "sms": "👋 *CropEx* — Your Smart Market\n━━━━━━━━━━━━━━\n📊 *Check prices:*\n  'Price of maize' / 'Bei ya mahindi'\n\n💰 *Sell crops:*\n  'Sell 50 bags of maize'\n\n🛒 *Buy crops:*\n  'Buy 10 bags of potatoes'\n\n🌾 *Supported crops:*\nMaize/Mahindi • Tomatoes/Nyanya\nPotatoes/Viazi • Beans/Maharagwe\nWheat/Ngano • Rice/Mchele\n━━━━━━━━━━━━━━\n_Powered by CropEx Exchange_ 🌱"
}
```

#### 2. Price Query (no SMS — route to C++)
```json
{
  "intent": "PRICE_QUERY",
  "symbol": "TOMATO",
  "quantity": null,
  "unit": null,
  "via_llm": false,
  "sms": null
}
```

#### 3. Sell Order 
```json
{
  "intent": "SELL_ORDER",
  "symbol": "MAIZE",
  "quantity": 50.0,
  "unit": "bags",
  "via_llm": false,
  "sms": null
}
```

#### 4. Unknown Input (helpful prompt)
```json
{
  "intent": "UNKNOWN",
  "symbol": null,
  "quantity": null,
  "unit": null,
  "via_llm": true,
  "sms": "❓ Sijui hiyo / I didn't understand.\n\n👋 *CropEx* — Your Smart Market\n...[full menu]"
}
```

### Integration Flow (for Node/Twilio)

```
Twilio Webhook (form-encoded)
    ↓
Parse: from = "+254...", body = "price of mahindi"
    ↓
POST to Python /webhook
    ↓
Receive: { intent: "PRICE_QUERY", symbol: "MAIZE", ... }
    ↓
If sms → Send SMS via Twilio
If intent → Pass to C++ engine
```

---

## 📊 Price Prediction

**Endpoint:** `POST /predict`  
**Purpose:** Get next-month price forecast for a commodity  
**Latency:** ~100ms

### Request

```json
{
  "date": "2025-12-05",
  "admin1": "Nairobi",
  "market": "Wakulima (Nairobi)",
  "commodity": "tomatoes",
  "pricetype": "retail",
  "previous_month_price": 58.2,
  "price_3_months_ago": 55.0,
  "price_6_months_ago": 52.0,
  "price_ma_3": 55.5,
  "price_ma_6": 54.0,
  "price_vol_6": 2.5
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `date` | string (YYYY-MM-DD) | ✅ | Forecast date |
| `admin1` | string | ✅ | Region/county (e.g., "Nairobi") |
| `market` | string | ✅ | Market name (see supported list below) |
| `commodity` | string | ✅ | Crop name (lowercase; see supported list) |
| `pricetype` | string | ✅ | `"retail"` or `"wholesale"` |
| `previous_month_price` | float | ✅ | Last known price (KES/kg) |
| `price_3_months_ago` | float | ❌ | If missing, estimated from previous_month_price |
| `price_6_months_ago` | float | ❌ | If missing, estimated from previous_month_price |
| `price_ma_3` | float | ❌ | 3-month moving average (critical for accuracy) |
| `price_ma_6` | float | ❌ | 6-month moving average |
| `price_vol_6` | float | ❌ | 6-month price std dev / volatility |

### Response

```json
{
  "commodity": "tomatoes",
  "market": "Wakulima (Nairobi)",
  "date": "2025-12-05",
  "prediction_per_kg": 65.5,
  "unit": "kg",
  "market_type": "retail",
  "previous_month_price": 58.2,
  "confidence_pct": 84.5,
  "error_margin": "+-15.3",
  "lower_bound": 50.2,
  "upper_bound": 80.8,
  "unreasonable": false,
  "note": "Prediction within normal range."
}
```

| Field | Type | Notes |
|-------|------|-------|
| `prediction_per_kg` | float | Predicted price (KES/kg) |
| `confidence_pct` | float | Model confidence (0–100) |
| `lower_bound` | float | 5th percentile (95% confidence interval) |
| `upper_bound` | float | 95th percentile |
| `unreasonable` | bool | Price exceeds historical threshold |
| `error_margin` | string | `±X.X` KES |

### Supported Markets

```
Dagahaley (Daadab), Dandora (Nairobi), Eldoret town (Uasin Gishu),
Ethiopia (Kakuma), Garissa town (Garissa), Hagadera (Daadab),
HongKong (Kakuma), IFO (Daadab), Illbissil Food Market (Kajiado),
Kaanwa (Tharaka Nithi), Kakuma 2, Kakuma 3, Kakuma 4,
Kalahari (Mombasa), Kalobeyei (Village 1/2/3), Kangemi (Nairobi),
Karatina (Nyeri), Kathonzweni (Makueni), Kawangware (Nairobi),
Kibra (Nairobi), Kibuye (Kisumu), Kisumu, Kitengela (Kajiado),
Kitui, Kongowea (Mombasa), Lodwar town, Lomut (West Pokot),
Makutano (West Pokot), Marigat town (Baringo), Mathare (Nairobi),
Mogadishu (Kakuma), Mukuru (Nairobi), Nairobi, Nakuru,
Takaba (Mandera), Tala Centre Market (Machakos), Wakulima (Nairobi/Nakuru)
```

### Supported Commodities

```
cabbage, kale, onion, potato, tomato, (and their plurals)
```

---

## 💡 Recommendations

**Endpoint:** `POST /recommendations`  
**Purpose:** AI-generated sell/hold/buy advice + WhatsApp-ready message  
**Latency:** ~3–5s (includes LLM call)

### Request

```json
{
  "commodity": "cabbage",
  "market": "Wakulima (Nairobi)",
  "admin1": "Nairobi",
  "pricetype": "retail",
  "predicted_price": 120.0,
  "previous_price": 100.0,
  "lower_bound": 105.0,
  "upper_bound": 135.0,
  "confidence_pct": 85.0,
  "unreasonable": false
}
```

| Field | Type | Notes |
|-------|------|-------|
| `predicted_price` | float | From `/predict` response |
| `previous_price` | float | Last known price |
| `lower_bound` | float | From `/predict` response |
| `upper_bound` | float | From `/predict` response |
| `confidence_pct` | float | From `/predict` response |
| `unreasonable` | bool | From `/predict` response |

### Response

```json
{
  "commodity": "cabbage",
  "market": "Wakulima (Nairobi)",
  "action": "hold",
  "urgency": "soon",
  "price_trend": "rising",
  "trend_pct": 20.0,
  "model_confidence": "high",
  "reasons": [
    "📈 Strong price rise of 20.0% expected — hold for now",
    "Sell when prices peak near KES 135/kg",
    "Forecast range: KES 105–135/kg (currently KES 100/kg)"
  ],
  "farmer_message": "📊 cabbage @ Wakulima (Nairobi): KES 120/kg forecast. Trend: +20.0%. Recommendation: *HOLD*.",
  "rationale": "Price rising 20.0% from KES 100 → KES 120/kg. Model confidence: high. Interval width: KES 30/kg."
}
```

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `action` | enum | `sell`, `hold`, `monitor` | What the farmer should do |
| `urgency` | enum | `immediate`, `soon`, `later`, `none` | Time sensitivity |
| `price_trend` | enum | `rising`, `falling`, `stable` | Price direction |
| `trend_pct` | float | e.g., `20.0` | Price change % |
| `model_confidence` | enum | `high`, `medium`, `low` | Trust level for recommendation |
| `farmer_message` | string | WhatsApp text | Ready to send to farmer (Gemini-generated) |

---

## 📍 Micro-Market Forecasting

**Endpoint:** `POST /micro-market`  
**Purpose:** Compare prices across nearby markets  
**Latency:** ~150ms

### Request

```json
{
  "commodity": "tomatoes",
  "region": "Nairobi",
  "radius_km": 30.0,
  "date": "2025-12-05"
}
```

### Response

```json
{
  "commodity": "tomatoes",
  "region": "Nairobi",
  "nearby_markets": [
    {
      "market_name": "Nairobi Central Market",
      "distance_km": 0.0,
      "estimated_price": 57.6,
      "market_type": "wholesale"
    },
    {
      "market_name": "Nairobi Retail Hub",
      "distance_km": 9.0,
      "estimated_price": 70.4,
      "market_type": "retail"
    }
  ],
  "localized_forecast": {
    "average_price": 62.93,
    "min_price": 57.6,
    "max_price": 70.4,
    "price_variance": 12.8
  },
  "recommended_market": "Nairobi Central Market",
  "market_comparison": "High price variance (12.8 KES) — shopping around could save money."
}
```

---

## �い Format (SMS/WhatsApp)

**Endpoint:** `POST /format`  
**Purpose:** Make predictions readable for farmers  
**Latency:** ~50ms

### Request

```json
{
  "prediction_data": {
    "commodity": "cabbage",
    "market": "Wakulima (Nairobi)",
    "prediction_per_kg": 115.5,
    "date": "2025-12-05",
    "previous_month_price": 100.0,
    "confidence_pct": 90,
    "lower_bound": 105,
    "upper_bound": 125,
    "note": "Prediction within normal range."
  },
  "format_type": "whatsapp"
}
```

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `format_type` | enum | `sms`, `whatsapp`, `bulletin` | Output channel |

### Response (SMS)

```json
{
  "format_type": "sms",
  "formatted_message": "cabbage @ Wakulima (Nairobi): KES 115.5/kg on 2025-12-05. Prev: KES 100.0/kg",
  "character_count": 76,
  "estimated_cost": 0.5
}
```

### Response (WhatsApp)

```json
{
  "format_type": "whatsapp",
  "formatted_message": "📊 *Market Price Forecast*\n\n🌾 Commodity: cabbage\n📍 Market: Wakulima (Nairobi)\n📅 Date: 2025-12-05\n\n💰 Predicted Price: *KES 115.5/kg*\n📈 Previous Price: KES 100.0/kg\n✅ Confidence: 90%\n\nPrediction within normal range.\n\n_Powered by CropEx_",
  "character_count": 233,
  "estimated_cost": 0.0
}
```

---

## 🔍 Explainability (XAI)

**Endpoint:** `POST /explainability`  
**Purpose:** Understand what influenced a prediction  
**Latency:** ~200ms

### Request

```json
{
  "date": "2025-12-05",
  "admin1": "Nairobi",
  "market": "Wakulima (Nairobi)",
  "commodity": "tomatoes",
  "pricetype": "retail",
  "previous_month_price": 58.2
}
```

### Response

```json
{
  "commodity": "tomatoes",
  "market": "Wakulima (Nairobi)",
  "predicted_price": 192.46,
  "top_influencing_factors": [
    {
      "factor": "3-Month Price Average",
      "importance": 0.91,
      "impact": "Very High",
      "description": "Rolling 3-month average drives ~91% of model signal"
    },
    {
      "factor": "Previous Month Price",
      "importance": 0.03,
      "impact": "Low",
      "description": "Last recorded price of 58.2 KES/kg"
    }
  ],
  "explanation_summary": "The forecast of KES 192/kg is primarily driven by the 3-month rolling price average (~91% of model signal).",
  "confidence_factors": {
    "confidence_pct": 50.0,
    "dominant_feature": "price_ma_3 (3-month moving average)",
    "fields_estimated": ["price_lag_3", "price_lag_6", "price_ma_3", "price_ma_6", "price_vol_6"],
    "data_quality": "degraded",
    "prediction_reliability": "limited"
  }
}
```

---

## 📋 Feedback

**Endpoint:** `POST /feedback`  
**Purpose:** Collect farmer feedback for model improvement  
**Latency:** ~50ms

### Request

```json
{
  "user_id": "farmer123",
  "prediction_id": "pred_001",
  "actual_price": 67.0,
  "accuracy_rating": 4,
  "usefulness_rating": 5,
  "comments": "Very helpful prediction!",
  "timestamp": "2025-12-06T10:30:00"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `accuracy_rating` | int | 1–5 (1=wrong, 5=perfect) |
| `usefulness_rating` | int | 1–5 (1=useless, 5=very helpful) |

### Response

```json
{
  "feedback_id": "FB-2bc5fdf1",
  "status": "success",
  "message": "Thank you for your feedback! Your input helps improve our predictions.",
  "timestamp": "2026-05-10T10:43:25.705237"
}
```

---

## 📊 Impact Statistics

**Endpoint:** `GET /impact-stats`  
**Purpose:** Aggregate system metrics  
**Latency:** ~50ms

### Response

```json
{
  "total_predictions": 15420,
  "total_users": 3847,
  "average_accuracy": 0.842,
  "total_markets_covered": 40,
  "commodities_tracked": ["cabbage", "kale", "onion", "potato", "tomato"],
  "user_satisfaction": 4.3,
  "cost_savings_estimate": 2847500.0,
  "last_updated": "2026-05-10T10:43:25.711457"
}
```

---

## Error Responses

All endpoints return errors as JSON with clear messages:

```json
{
  "detail": "Commodity 'banana' not supported. Allowed: ['cabbage', 'kale', 'onion', 'potato', 'tomato']"
}
```

**Common Status Codes:**
- `200` — Success
- `400` — Bad request (invalid commodity, market, etc.)
- `422` — Validation error (missing required fields)
- `500` — Server error

---

## Integration Checklist (for Node.js/Twilio)

- [ ] Parse Twilio form-encoded webhook (`From`, `Body`)
- [ ] Transform to `/webhook` JSON: `{ "from_number": from, "body": body }`
- [ ] Handle response, check `sms` field (send directly) vs `intent` field (route to C++)
- [ ] For PRICE_QUERY: call `/predict` with predicted_price from C++ + `/recommendations`
- [ ] Format reply with `/format` endpoint if needed
- [ ] Send SMS via Twilio

---

**Questions?** Check the [API_ENDPOINTS.md](API_ENDPOINTS.md) or [README.md](README.md) for more details.
