# 🌾 CropEx — Kenyan Agro Market Price Forecaster

**Farmers text WhatsApp. AI predicts next month's crop prices. Farmers get actionable advice.**

A production-ready ML API that powers intelligent, multi-language agricultural price forecasting and market advice for smallholder farmers in Kenya. Built with Python (FastAPI), Gemini LLM, scikit-learn, and designed for seamless Node.js/Twilio integration.

---

## 👥 For Different Audiences

### 🚜 Farmers (via WhatsApp)
- Text `"price of mahindi"` or `"jambo"` → Get instant market advice
- Bilingual support (English + Swahili)
- AI-powered recommendations ("SELL", "HOLD", "MONITOR") with reasoning
- Works on feature phones via SMS

### 👨‍💻 Backend/Node.js Integrators
- **Start here:** [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- Call `/webhook` for intent classification → route to your C++ engine
- Call `/predict` + `/recommendations` for AI forecast + advisor messages
- All schemas documented in [SCHEMAS.md](SCHEMAS.md)

### 🔬 ML/Data Scientists
- Random Forest model trained on Kenyan market data
- SHAP-powered explainability (`/explainability`)
- Feedback endpoint ready for model retraining (`/feedback`)
- All feature engineering in [price_api/app.py](price_api/app.py)

---

## 🏗️ Architecture

```
Twilio WhatsApp                 Your C++ Engine
      ↓                              ↑
      └─→ Node.js Layer ←───────────┘
             ↓
      Parse & Transform
             ↓
  ┌────────────────────┐
  │   Python FastAPI   │
  │   (This Repo)      │
  └────────────────────┘
      ├─ /webhook ─────────────────→ Intent Classification (Rules + Gemini)
      ├─ /predict ─────────────────→ ML Price Forecast (Random Forest)
      ├─ /recommendations ────────→ AI Farmer Message (Gemini-powered)
      ├─ /format ──────────────────→ SMS/WhatsApp Formatting
      ├─ /micro-market ────────────→ Regional Price Comparison
      ├─ /explainability ─────────→ Prediction Interpretation (SHAP)
      ├─ /feedback ────────────────→ Accuracy Collection
      └─ /impact-stats ────────────→ System Metrics

```

---

## 🚀 Quick Start

### 1. **Setup** (5 mins)
```bash
git clone https://github.com/AllanOnyonka-ltsm/Market-Forecaster-Kenyan-Agro-Market-Prototype-Mark-1-.git
cd Market-Forecaster-Kenyan-Agro-Market-Prototype-Mark-1-/price_api
pip install -r requirements.txt
export GEMINI_API_KEY="your-gemini-key"  # Get free at aistudio.google.com
```

### 2. **Run API**
```bash
uvicorn app:app --reload
```

### 3. **Test Everything**
```bash
python test_gemini_recommendations.py
```

### 4. **Explore Interactive Docs**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 5. **Integrate with Node.js**
Follow [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) + use [SCHEMAS.md](SCHEMAS.md) for request/response specs.

---

## 📚 Documentation

| Document | For Whom | What It Contains |
|----------|----------|-----------------|
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | Node.js devs | Flow diagram, checklist, code examples |
| [SCHEMAS.md](SCHEMAS.md) | All integrators | Exact request/response shapes, all endpoints |
| [API_ENDPOINTS.md](price_api/API_ENDPOINTS.md) | API users | Detailed endpoint descriptions, examples |
| [README.md](README.md) | You | Architecture, features, roadmap (this file) |

---

## ✨ Key Features

1. **WhatsApp Intent Router** (`/webhook`) - ⭐ **NEW** 
   - Rule-based parsing (fast) + Gemini LLM fallback (smart)
   - Intents: `GREETING`, `PRICE_QUERY`, `SELL_ORDER`, `BUY_ORDER`, `UNKNOWN`
   - Bilingual support (English + Swahili)
   - Structured output for downstream engines

2. **AI Price Prediction** (`/predict`)
   - Random Forest model trained on Kenyan market data
   - Returns: predicted price, confidence%, upper/lower bounds
   - Handles missing price history gracefully

3. **Gemini-Powered Recommendations** (`/recommendations`) - ⭐ **NEW**
   - AI-generated farmer messages
   - Recommends: SELL, HOLD, or MONITOR
   - WhatsApp-ready, emoji-rich text
   - Fallback templates if LLM unavailable

4. **Actionable Advice** — All endpoints support:
   - Multi-language support (English + Swahili crops)
   - Error handling with clear messages
   - Detailed explanations (XAI) for every prediction

---

## 📖 Detailed Usage

### Example 1: Intent Classification (What does the farmer want?)
```bash
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from_number": "+254712345678", "body": "price of mahindi"}'
```

Response:
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

### Example 2: Get AI Recommendation
```bash
curl -X POST http://localhost:8000/recommendations \
  -H "Content-Type: application/json" \
  -d '{
    "commodity": "tomatoes",
    "market": "Wakulima (Nairobi)",
    "admin1": "Nairobi",
    "pricetype": "retail",
    "predicted_price": 75.0,
    "previous_price": 60.0,
    "lower_bound": 70.0,
    "upper_bound": 80.0,
    "confidence_pct": 85.0,
    "unreasonable": false
  }'
```

Response (excerpt):
```json
{
  "action": "sell",
  "urgency": "soon",
  "farmer_message": "📊 tomatoes @ Wakulima: KES 75/kg forecast. Trend: +25%. Recommendation: *SELL*.",
  "rationale": "Strong price rise expected..."
}
```

## 🌾 Deep Dive: WhatsApp Intent Router (`/webhook`)

The `/webhook` endpoint intelligently classifies farmer messages into actionable intents, replacing exact keyword matching with a two-stage pipeline:

1. **Stage 1: Rule-based Parser** (~50ms)
   - Fast patterns for common phrases
   - Recognizes English + Swahili crop names
   - Outputs: intent + structured data

2. **Stage 2: Gemini LLM Fallback** (~2s, only if rules fail)
   - Handles fuzzy, typo-ridden, or Swahili-heavy inputs
   - Classifies intent + extracts parameters
   - Returns same structured format as Stage 1

### Supported Intents & Examples

| Intent | Pattern | Swahili | Output |
|--------|---------|---------|--------|
| `GREETING` | "hi", "hello", "hey" | "jambo", "habari", "sasa" | Bilingual menu |
| `PRICE_QUERY` | "price of tomatoes" | "bei ya nyanya" | `{ intent, symbol }` |
| `SELL_ORDER` | "sell 50 bags of maize" | "uza mahindi" | `{ intent, symbol, qty, unit }` |
| `BUY_ORDER` | "buy 10 bags of potatoes" | "nunua viazi" | `{ intent, symbol, qty, unit }` |
| `UNKNOWN` | anything else | any unrecognized | Helpful menu + SMS |

### Crop Vocabulary

| English | Swahili | Symbol |
|---------|---------|--------|
| Maize | Mahindi | `MAIZE` |
| Tomatoes | Nyanya | `TOMATO` |
| Potatoes | Viazi | `POTATO` |
| Beans | Maharagwe | `BEANS` |
| Wheat | Ngano | `WHEAT` |
| Rice | Mchele / Wali | `RICE` |
| Sorghum | Mtama | `SORGHUM` |
| Onions | Vitunguu | `ONION` |
| Cassava | Muhogo | `CASSAVA` |

### Request & Response Format

**Request:**
```json
{
  "from_number": "+254712345678",
  "body": "price of mahindi"
}
```

**Response (PRICE_QUERY):**
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

**Response (UNKNOWN - includes fallback SMS):**
```json
{
  "intent": "UNKNOWN",
  "symbol": null,
  "quantity": null,
  "unit": null,
  "via_llm": true,
  "sms": "👋 *CropEx* — Your Smart Market\n📊 Check prices: 'Price of maize'\n💰 Sell crops: 'Sell 50 bags of maize'\n🛒 Buy crops: 'Buy 10 bags of potatoes'"
}
```

### Code Reference

Implementation in [price_api/intent_router.py](price_api/intent_router.py):
- `parse_intent(text)` — Main entry point (rules → Gemini fallback)
- `build_response(parsed)` — Returns dict ready for downstream

Wired in [price_api/app.py](price_api/app.py):
```python
@app.post("/webhook")
async def webhook(payload: WebhookBody):
    parsed   = await parse_intent(payload.body)
    response = build_response(parsed)
    return response
```

### Testing

Automated tests in [price_api/test_gemini_recommendations.py](price_api/test_gemini_recommendations.py):
```bash
cd price_api
python test_gemini_recommendations.py
```

Or manually in Swagger UI: http://localhost:8000/docs



---

## �️ Roadmap & TODOs

### ✅ Completed (This Branch)
1. ✅ **Intelligent Intent Routing** (`/webhook`) — Rule-based + Gemini fallback
2. ✅ **Gemini-Powered Recommendations** (`/recommendations`) — Farmer-friendly WhatsApp messages via LLM
3. ✅ **Schema Documentation** (`SCHEMAS.md`) — Complete integration reference
4. ✅ **Integration Guide** (`INTEGRATION_GUIDE.md`) — Flow diagram + checklist

### 📋 High Priority (Next Sprint)

**3. Twilio Webhook Adapter** (4 hours)
- Transform Twilio form-encoded requests → JSON
- Return TwiML for WhatsApp replies
- Creates single source of truth for farmer interactions

**4. Bilingual SMS/WhatsApp Responses** (2 hours)
- Detect language from context
- Generate Swahili menus + prompts
- Feels local → increases adoption

**5. User Session & Preferences** (6 hours)
- Redis/in-memory store keyed by `from_number`
- Track: crop interest, language choice, location
- Enable: "send price for my usual crop" one-click

### 🔲 Medium Priority (After Launch)

**6. Live Market Data Feed** (8 hours)
- Replace synthetic prices with real Kenyan data
- Sources: FEWS NET, City Council exchanges, market bulletins
- Predictions grounded → farmer trust 10x

**7. Analytics & Feedback Loop** (12 hours)
- Persist predictions + feedback to database
- Trigger monthly model rebuild with labeled data
- Continuous improvement cycle

**8. Production Hardening**
- Rate limiting, IP whitelisting
- Request logging, error monitoring (Sentry)
- API versioning for backwards compatibility
- Caching for `/predict` (hot commodities/markets)

---

## 📁 Project Structure

```
Market-Forecaster-Kenyan-Agro-Market-Prototype-Mark-1-/
├── README.md                          # This file
├── SCHEMAS.md                         # All request/response shapes
├── INTEGRATION_GUIDE.md               # For Node.js integrators
├── price_api/
│   ├── app.py                         # Main FastAPI application
│   ├── intent_router.py               # Intent classification logic
│   ├── enhanced_endpoints.py          # Recommendations engine
│   ├── gemini_client.py               # Shared Gemini API helper
│   ├── requirements.txt               # Python dependencies
│   ├── API_ENDPOINTS.md               # Detailed endpoint docs
│   ├── test_endpoints.py              # Full test suite
│   ├── test_gemini_recommendations.py # Webhook + recommendations tests
│   └── artifacts/                     # Trained ML models
│       ├── random_forest_price_model.pkl
│       ├── label_encoders.pkl
│       ├── feature_columns.pkl
│       └── preprocessing_info.pkl
└── reference_data.json                # Sample data for development
```

---

## 🔑 Environment Variables

```bash
# Required for Gemini LLM features
export GEMINI_API_KEY="your-gemini-api-key"

# Get free key at: https://aistudio.google.com/app/apikey
```

Set in `.env` file:
```
GEMINI_API_KEY=sk-...
```

---

## 🧪 Testing

### Run All Tests
```bash
cd price_api
python test_endpoints.py         # Full endpoint test suite
python test_gemini_recommendations.py  # Webhook + recommendations
```

### Manual Testing
Interactive docs while server is running:
- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Test Webhook Directly
```bash
curl -X POST http://localhost:8000/webhook \
  -H "Content-Type: application/json" \
  -d '{"from_number": "+254712345678", "body": "price of mahindi"}'
```

---

## 🚀 Deployment

### Local Development
```bash
cd price_api
uvicorn app:app --reload
```

### Production (Example: Heroku/Railway)
```bash
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:8000", "app:app"]
```

---

## 📞 Support & Questions

- **API Documentation:** [API_ENDPOINTS.md](price_api/API_ENDPOINTS.md)
- **Integration Help:** [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)
- **Schema Reference:** [SCHEMAS.md](SCHEMAS.md)
- **Issues:** Open a GitHub issue

---

## 📜 License

[Your License Here]

---

## 👥 Contributors

Built for CropEx — bringing market-driven insights to Kenyan farmers via WhatsApp.

**Branch:** `feat/gemini-enhanced-endpoints`  
**Last Updated:** May 10, 2026

