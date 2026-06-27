const { spawn } = require('child_process');
const WebSocket = require('ws');
const express = require('express');
const twilio = require('twilio');

require('dotenv').config({ path: '../.env' }); 

const RSSParser = require('rss-parser');
const rssParser = new RSSParser();

// =========================
// CONFIG
// =========================
const GNEWS_API_KEY = "cdae864b8249cf59c5b45bdf3a349177";
const NEWS_URL = `https://gnews.io/api/v4/search?q="commodity" OR "maize" OR "wheat" OR "Kenya agriculture"&lang=en&sortBy=publishedAt&max=6&apikey=${GNEWS_API_KEY}`;

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
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
const TRADE_WORDS = ['buy', 'sell', 'nunua', 'uza'];

const pendingOrders = {};

function detectIntent(msg, fromNumber) {
    const lower = msg.toLowerCase().trim();
    if (lower === 'yes' || lower === 'no') {
        return { intent: 'CONFIRM', symbol: null };
    }
    if (pendingOrders[fromNumber]?.status === 'awaiting_qty') {
        const qty = extractQty(lower);
        if (qty) return { intent: 'TRADE_QTY', symbol: null, qty };
    }

    if (GREETING_WORDS.some(w => lower.includes(w))) {
        return { intent: 'GREETING', symbol: null };
    }

    let symbol = null;
    for (const [sym, keywords] of Object.entries(CROP_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) {
            symbol = sym;
            break;
        }
    }

    const wantsRecommendation = RECOMMEND_WORDS.some(w => lower.includes(w));
    if (wantsRecommendation && symbol) {
        return { intent: 'RECOMMEND', symbol };
    }

    const wantsTrade = TRADE_WORDS.some(w => lower.includes(w));
    if (wantsTrade) {
        const side = (lower.includes('buy') || lower.includes('nunua')) ? 'BUY' : 'SELL';
        const qty = extractQty(lower);
        return { intent: 'TRADE', symbol, side, qty };
    }

    if (!symbol) {
        return { intent: 'UNKNOWN', symbol: null };
    }

    return { intent: 'FORECAST', symbol };
}

// =========================
// WELCOME + HELP MESSAGES
// =========================
const WELCOME_MSG = `👋 *Hello, I'm Patrick!*

Your personal crop market advisor. I help Kenyan farmers make smarter selling decisions.

Ask me anything like:
📊 *Price check* — "What is the price of tomatoes?"
💡 *Sell advice* — "Should I sell my maize?"

Crops I track:
🌽 Maize (mahindi)
🍅 Tomatoes (nyanya)
🥔 Potatoes (viazi)
🧅 Onions (vitunguu)
🌾 Wheat (ngano)
🫘 Beans (maharagwe)

_Patrick — Your CropEx Market Advisor_`;

const UNKNOWN_MSG = `❓ *Patrick here!* I didn't quite catch that.

Try asking me something like:
- "What is the forecast for tomatoes?"
- "Should I sell my maize?"
- "Bei ya viazi ni ngapi?"

Type *hi* to see everything I can do.`;

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

function extractQty(msg) {
    const match = msg.match(/(\d+)\s*(bag|bags)?/);
    return match ? parseInt(match[1]) : null;
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

    const { intent, symbol, side, qty } = detectIntent(incomingMsg, fromNumber);
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

        case 'TRADE': {
            if (!symbol) {
                await sendWhatsApp(fromNumber, `❓ *Patrick here!* Which crop do you want to trade?\n\nTry: "Buy 5 bags of maize" or "Sell 3 bags of tomatoes"`);
                break;
            }
            if (!qty) {
                pendingOrders[fromNumber] = {
                    side,
                    symbol,
                    qty: null,
                    status: 'awaiting_qty'  // ← add this
                };
                await sendWhatsApp(fromNumber, `🌾 *Patrick here!* How many bags of ${symbol} do you want to ${side.toLowerCase()}?`);
                break;
            }

            // Store pending order
            pendingOrders[fromNumber] = {
                side, 
                symbol,
                qty,
                status: 'awaiting_confirmation'
            };

            await sendWhatsApp(fromNumber, 
                `📋 *Patrick — Trade Summary*\n\n` +
                `${side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${symbol}*\n\n` +
                `Reply *YES* to confirm or *NO* to cancel.\n\n` +
                `_You have 3 minutes to confirm or the order will be cancelled._`
            );

            // Reminder at 2 minutes
            pendingOrders[fromNumber].reminderTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    await sendWhatsApp(fromNumber,
                        `⏰ *Patrick here!* You still have a pending trade:\n\n` +
                        `${side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${symbol}*\n\n` +
                        `Reply *YES* to confirm. You have *1 minute* left or it will be cancelled.`
                    );
                }
            }, 2 * 60 * 1000);

            // Cancel at 3 minutes
            pendingOrders[fromNumber].cancelTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    delete pendingOrders[fromNumber];
                    await sendWhatsApp(fromNumber,
                        `❌ *Patrick here!* Your trade was cancelled due to no response.\n\n` +
                        `Send a new order whenever you're ready.`
                    );
                }
            }, 3 * 60 * 1000);

            break;
        }

        case 'CONFIRM': {
            const pending = pendingOrders[fromNumber];
            if (!pending) {
                await sendWhatsApp(fromNumber, `🤷 *Patrick here!* No pending trade found. Send a new order to get started.`);
                break;
            }

            const upper = incomingMsg.trim().toUpperCase();

            if (upper === 'YES') {
                clearTimeout(pending.reminderTimer);
                clearTimeout(pending.cancelTimer);
                delete pendingOrders[fromNumber];

                if (engine && !engine.killed) {
                    engine.stdin.write(JSON.stringify({
                        type: 'NEW_ORDER',
                        symbol: pending.symbol,
                        side: pending.side,
                        qty: pending.qty,
                        price: 0  // market order — engine uses best bid/ask
                    }) + '\n');
                }

                await sendWhatsApp(fromNumber,
                    `✅ *Trade Executed!*\n\n` +
                    `${pending.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${pending.qty} bags* of *${pending.symbol}*\n\n` +
                    `_Patrick — Your CropEx Market Advisor_`
                );

            } else if (upper === 'NO') {
                clearTimeout(pending.reminderTimer);
                clearTimeout(pending.cancelTimer);
                delete pendingOrders[fromNumber];

                await sendWhatsApp(fromNumber,
                    `❌ *Trade cancelled.* No worries!\n\nSend a new order whenever you're ready.\n\n_Patrick — Your CropEx Market Advisor_`
                );
            }
            break;
        }

        case 'TRADE_QTY': {
            const partial = pendingOrders[fromNumber];
            if (!partial) break;

            partial.qty = qty;
            partial.status = 'awaiting_confirmation';

            await sendWhatsApp(fromNumber,
                `📋 *Patrick — Trade Summary*\n\n` +
                `${partial.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${partial.symbol}*\n\n` +
                `Reply *YES* to confirm or *NO* to cancel.\n\n` +
                `_You have 3 minutes to confirm or the order will be cancelled._`
            );

            // Reminder at 2 minutes
            partial.reminderTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    await sendWhatsApp(fromNumber,
                        `⏰ *Patrick here!* You still have a pending trade:\n\n` +
                        `${partial.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${partial.symbol}*\n\n` +
                        `Reply *YES* to confirm. You have *1 minute* left or it will be cancelled.`
                    );
                }
            }, 2 * 60 * 1000);

            // Cancel at 3 minutes
            partial.cancelTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    delete pendingOrders[fromNumber];
                    await sendWhatsApp(fromNumber,
                        `❌ *Patrick here!* Your trade was cancelled due to no response.\n\n` +
                        `Send a new order whenever you're ready.`
                    );
                }
            }, 3 * 60 * 1000);

            break;
        }

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
const engine = spawn('./matching_engine');

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
                const cleanMessage = sanitizeForecastMessage(json.message);
                await sendWhatsApp(json.phone, cleanMessage);
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
        'monitor': '🟠',
        'buy': '🔵'
    };

    const action = data.action || data.action_type || 'hold';
    const confidence = data.model_confidence || data.confidence || 'medium';
    const recommendations = data.reasons || data.recommendations || [];
    const emoji = actionEmoji[action] || '⚪';
    const recs = recommendations.map(r => `• ${r}`).join('\n');

    // Use Gemini-generated farmer message if available
    if (data.farmer_message) {
        return `💡 *CropEx Trading Intelligence*\n\n${data.farmer_message}\n\n` +
               `${emoji} *Strategy: ${action.toUpperCase()}*\n\n` +
               `*Insights:*\n${recs}\n\n` +
               `⚠️ _AI-generated advice. Do not risk capital you cannot afford to lose._`;
    }

    return `💡 *CropEx Trading Intelligence*

🌾 Commodity: ${(data.commodity || '').toUpperCase()}
📍 Market: ${data.market || ''}

${emoji} *Action Strategy: ${action.toUpperCase()}*
🎯 Confidence: ${confidence.toUpperCase()}

*Data-Backed Insights:*
${recs}

*AI Rationale:*
📝 ${data.rationale || ''}

⚠️ *FINANCIAL DISCLAIMER:* _AI-generated market advice. Do not risk capital you cannot afford to lose._`;
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

// =========================
// FORECAST SANITIZER
// =========================
function sanitizeForecastMessage(msg) {
    if (!msg) return msg;
    let clean = msg;

    clean = clean.replace(/(KES\s+\d+\.\d{2})\d+/gi, '$1'); 

    const warningIndex = clean.indexOf("⚠️");
    if (warningIndex !== -1) {
        clean = clean.substring(0, warningIndex).trim();
    }

    clean = clean.replace(/📊\s+Confidence:\s+\d+(\.\d+)?%/gi, '');
    clean = clean.trim() + "\n\n_Powered by CropEx_";
    return clean;
}

fetchNews();
setInterval(fetchNews, 5 * 60 * 1000);