const { spawn } = require('child_process');
const WebSocket = require('ws');
const express = require('express');
const twilio = require('twilio');

const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// =========================
// CONFIG
// =========================
const GNEWS_API_KEY = "cdae864b8249cf59c5b45bdf3a349177";
const NEWS_URL = `https://gnews.io/api/v4/search?q="commodity" OR "maize" OR "wheat" OR "Kenya agriculture"&lang=en&sortBy=publishedAt&max=6&apikey=${GNEWS_API_KEY}`;

const twilioClient = twilio('AC33fa0c99c8f730fe28e8fc2f02610cbf', '2514b481130167f01f238e628f5ec344');
const TWILIO_SANDBOX_NUMBER = 'whatsapp:+14155238886';
const PYTHON_API = 'http://localhost:8000';

// =========================
// NLP ROUTER
// =========================

// Crop keyword map — English + Swahili
const CROP_KEYWORDS = {
    'TMO': ['tomato', 'tomatoes', 'nyanya'],
    'PTO': ['potato', 'potatoes', 'viazi'],
    'ONN': ['onion', 'onions', 'vitunguu'],
    'MAZ': ['maize', 'corn', 'mahindi'],
    'BNS': ['bean', 'beans', 'maharagwe'],
    'WHT': ['wheat', 'ngano'],
    'SGM': ['sorghum', 'mtama'],
    'CAS': ['cassava', 'muhogo'],
};

// Intent detection
const GREETING_WORDS = ['hi', 'hello', 'hey', 'jambo', 'habari', 'sasa', 'mambo', 'niaje', 'hujambo'];
const FORECAST_WORDS = ['price', 'forecast', 'bei', 'market', 'soko', 'how much', 'ngapi', 'what is'];
const RECOMMEND_WORDS = ['should i sell', 'sell', 'hold', 'uza', 'shika', 'recommendation', 'advice', 'ushauri', 'nifanye nini'];

function detectIntent(msg) {
    const lower = msg.toLowerCase().trim();

    if (GREETING_WORDS.some(w => lower.includes(w))) {
        return { intent: 'GREETING', symbol: null };
    }

    // Detect crop symbol
    let symbol = null;
    for (const [sym, keywords] of Object.entries(CROP_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) {
            symbol = sym;
            break;
        }
    }

    if (!symbol) {
        return { intent: 'UNKNOWN', symbol: null };
    }

    // Detect intent — recommendation vs forecast
    const wantsRecommendation = RECOMMEND_WORDS.some(w => lower.includes(w));
    return {
        intent: wantsRecommendation ? 'RECOMMEND' : 'FORECAST',
        symbol
    };
}

// =========================
// WELCOME + HELP MESSAGES
// =========================
const WELCOME_MSG = `👋 *Welcome to CropEx!*

Kenya's AI-powered crop market intelligence.

You can ask me:
📊 *Price forecast* — "What is the price of tomatoes?"
💡 *Sell advice* — "Should I sell my maize?"

Supported crops:
🌽 Maize (mahindi)
🍅 Tomatoes (nyanya)
🥔 Potatoes (viazi)
🧅 Onions (vitunguu)
🌾 Wheat (ngano)
🫘 Beans (maharagwe)

_Powered by CropEx Market Engine_`;

const UNKNOWN_MSG = `❓ I didn't understand that.

Try asking:
• "What is the forecast for tomatoes?"
• "Should I sell my maize?"
• "Bei ya viazi ni ngapi?"

Type *hi* to see the full menu.`;

// =========================
// PYTHON API HELPERS
// =========================

async function getRecommendation(symbol, fromNumber) {
    // Find the book data from engine — we'll request via C++ ASK_RECOMMEND
    // C++ will call /recommendations and emit RECOMMEND_RESPONSE
    if (engine && !engine.killed) {
        engine.stdin.write(JSON.stringify({
            type: 'ASK_RECOMMEND',
            symbol,
            phone: fromNumber
        }) + '\n');
    }
}

async function sendWhatsApp(to, body) {
    return twilioClient.messages.create({
        body,
        from: TWILIO_SANDBOX_NUMBER,
        to
    });
}

// =========================
// TIME TRAVEL PARSER
// =========================
function extractTargetDate(msg) {
    const lower = msg.toLowerCase();
    const target = new Date();
    
    let daysToAdd = 30; // Default to 1 month (30 days) if no time is specified

    // Detect NLP timeframes
    if (lower.includes('next week') || lower.includes('1 week')) daysToAdd = 7;
    else if (lower.includes('2 weeks')) daysToAdd = 14;
    else if (lower.includes('3 weeks')) daysToAdd = 21;
    else if (lower.includes('next month') || lower.includes('1 month')) daysToAdd = 30;
    else if (lower.includes('2 months')) daysToAdd = 60;
    else if (lower.includes('3 months')) daysToAdd = 90;

    // Add the days to today's date
    target.setDate(target.getDate() + daysToAdd);
    
    // Return format YYYY-MM-DD (e.g., 2024-06-15)
    return target.toISOString().split('T')[0]; 
}

// =========================
// EXPRESS / WEBHOOK
// =========================
const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/webhook', async (req, res) => {
    const incomingMsg = req.body.Body || '';
    const fromNumber = req.body.From;

    console.log(`\n[WHATSAPP RCVD] From: ${fromNumber} | Msg: "${incomingMsg}"`);

    const { intent, symbol } = detectIntent(incomingMsg);
    console.log(`[INTENT] ${intent} | Symbol: ${symbol}`);

    switch (intent) {
        case 'GREETING':
            await sendWhatsApp(fromNumber, WELCOME_MSG);
            break;

        case 'FORECAST':
            // Calculate the future date based on what they asked
            const targetDate = extractTargetDate(incomingMsg);
            
            if (engine && !engine.killed) {
                engine.stdin.write(JSON.stringify({
                    type: 'ASK_AI',
                    symbol,
                    phone: fromNumber,
                    targetDate: targetDate 
                }) + '\n');
            }
            break;

        case 'RECOMMEND':
            await getRecommendation(symbol, fromNumber);
            break;

        case 'UNKNOWN':
        default:
            await sendWhatsApp(fromNumber, UNKNOWN_MSG);
            break;
    }

    // Respond to Twilio immediately to prevent timeout
    res.send('<Response></Response>');
});

app.listen(5000, () => console.log("--- twilio webhook listening on port 5000 ---"));

// =========================
// WEBSOCKET SERVER
// =========================
const wss = new WebSocket.Server({ port: 8080 });
console.log("--- cropex bridge live on localhost:8080 ---");

let latestNews = [];

function broadcast(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

wss.on('connection', (ws) => {
    if (latestNews.length > 0) {
        ws.send(JSON.stringify({ type: 'newsBatch', articles: latestNews }));
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'NEW_ORDER') {
                console.log(`\n[ORDER RECEIVED] ${data.side} ${data.qty} ${data.symbol} @ KES ${data.price}`);
                if (engine && !engine.killed) {
                    engine.stdin.write(JSON.stringify(data) + '\n');
                }
            }
        } catch (err) {
            console.error('[ws] error parsing incoming message:', err);
        }
    });
});

// =========================
// C++ ENGINE
// =========================
const engine = spawn('./cropex-engine.exe');

engine.stdout.on('data', (data) => {
    const output = data.toString().trim();
    const lines = output.split('\n');

    lines.forEach(async line => {
        if (!line) return;
        try {
            const json = JSON.parse(line);

            if (json.type === 'AI_RESPONSE') {
                // Forecast response from /predict → /format
                console.log(`[SENDING FORECAST TO ${json.phone}]`);
                await sendWhatsApp(json.phone, json.message);
                console.log(`✓ Forecast sent`);

            } else if (json.type === 'RECOMMEND_RESPONSE') {
                // Recommendation response from /recommendations
                console.log(`[SENDING RECOMMENDATION TO ${json.phone}]`);
                const msg = formatRecommendation(json);
                await sendWhatsApp(json.phone, msg);
                console.log(`✓ Recommendation sent`);

            } else {
                broadcast(json);
                process.stdout.write('.');
            }
        } catch (e) {
            // ignore partial fragments
        }
    });
});

engine.stderr.on('data', (data) => {
    console.error(`[engine error]: ${data}`);
});

engine.on('close', (code) => {
    console.log(`[engine halted] code: ${code}`);
});

// =========================
// FORMAT RECOMMENDATION
// =========================
function formatRecommendation(data) {
    const actionEmoji = {
        'sell': '🟢',
        'hold': '🟡',
        'buy': '🔵'
    };

    const emoji = actionEmoji[data.action_type] || '⚪';
    const recs = (data.recommendations || []).map(r => `• ${r}`).join('\n');

    return `💡 *CropEx Trading Intelligence*

    🌾 Commodity: ${data.commodity.toUpperCase()}
    📍 Market: ${data.market}

    ${emoji} *Action Strategy: ${(data.action_type || '').toUpperCase()}*
    🎯 Confidence Level: ${data.confidence.toUpperCase()}

    *Data-Backed Insights:*
    ${recs}

    *AI Rationale:*
    📝 ${data.rationale}

    ⚠️ *FINANCIAL DISCLAIMER:* _This is AI-generated market advice based on historical forecasting. Do not risk capital you cannot afford to lose. Trading commodities involves significant risk._`;
    }

// =========================
// NEWS FETCHER
// =========================
async function fetchNews() {
    try {
        const res = await fetch(NEWS_URL);
        const data = await res.json();

        if (!data.articles) {
            console.error('[news] API error:', data.errors || data);
            return;
        }

        latestNews = data.articles.slice(0, 6).map(a => ({
            title: a.title,
            source: a.source.name,
            url: a.url,
            publishedAt: a.publishedAt,
        }));
        broadcast({ type: 'newsBatch', articles: latestNews });
        console.log(`\n[news] fetched ${latestNews.length} articles`);
    } catch (err) {
        console.error('[news] fetch failed:', err.message);
    }
}

fetchNews();
setInterval(fetchNews, 5 * 60 * 1000);