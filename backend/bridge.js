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

const CROP_NAMES = {
    'MAZ': 'maize', 'BNS': 'beans', 'PTO': 'potatoes',
    'TMO': 'tomatoes', 'WHT': 'wheat', 'ONN': 'onions',
    'SGM': 'sorghum', 'CAS': 'cassava'
};

// Intent detection keywords
const GREETING_WORDS   = ['hi', 'hello', 'hey', 'jambo', 'habari', 'sasa', 'mambo', 'niaje', 'hujambo'];
const RECOMMEND_WORDS  = ['should i sell', 'sell', 'hold', 'uza', 'shika', 'recommendation', 'advice', 'ushauri', 'nifanye nini'];
const TRADE_WORDS      = ['buy', 'sell', 'nunua', 'uza'];
const LOGISTICS_WORDS  = ['transport', 'truck', 'gari', 'lorry', 'deliver', 'beba', 'route', 'driver', 'kubeba', 'logistics', 'usafirishaji'];

// =========================
// LOGISTICS: TOWN & DEPOT DATA
// =========================
const TOWN_MAP = {
    'eldoret':  { market: 'Eldoret town (Uasin Gishu)', eta: '3 hours (Same-day pickup)' },
    'nakuru':   { market: 'Wakulima (Nakuru)',           eta: '2 hours (Same-day pickup)' },
    'nairobi':  { market: 'Wakulima (Nairobi)',          eta: 'Instant (Staging depot dispatch)' },
    'kisumu':   { market: 'Kisumu',                      eta: '4 hours (Same-day pickup)' },
    'mombasa':  { market: 'Kongowea (Mombasa)',          eta: '6 hours (Overnight dispatch)' },
    'kitui':    { market: 'Kitui',                       eta: '3.5 hours' },
    'garissa':  { market: 'Garissa town (Garissa)',      eta: '5 hours' },
    'lodwar':   { market: 'Lodwar town',                 eta: '7 hours' },
    'machakos': { market: 'Tala Centre Market (Machakos)', eta: '2.5 hours' },
};

const HOLDING_DEPOTS = {
    'eldoret': [
        { id: 'A', name: 'Eldoret Grain Depot (Langas)',  capacity: '500 bags',  fee: 'KES 50/bag/day',  feePerBag: 50  },
        { id: 'B', name: 'Uasin Gishu Co-op Store',       capacity: '300 bags',  fee: 'KES 40/bag/day',  feePerBag: 40  },
        { id: 'C', name: 'AFA Certified Cold Store',       capacity: '200 bags',  fee: 'KES 70/bag/day',  feePerBag: 70  },
    ],
    'nakuru': [
        { id: 'A', name: 'Nakuru Farmers Depot',           capacity: '400 bags',  fee: 'KES 45/bag/day',  feePerBag: 45  },
        { id: 'B', name: 'Rift Valley Grain Hub',          capacity: '600 bags',  fee: 'KES 55/bag/day',  feePerBag: 55  },
    ],
    'nairobi': [
        { id: 'A', name: 'Wakulima Market Warehouse',      capacity: '1000 bags', fee: 'KES 60/bag/day',  feePerBag: 60  },
        { id: 'B', name: 'Gikomba Grain Terminal',         capacity: '800 bags',  fee: 'KES 50/bag/day',  feePerBag: 50  },
        { id: 'C', name: 'Eastleigh Cold Storage Hub',     capacity: '500 bags',  fee: 'KES 75/bag/day',  feePerBag: 75  },
    ],
    'kisumu': [
        { id: 'A', name: 'Kisumu Port Grain Store',        capacity: '350 bags',  fee: 'KES 45/bag/day',  feePerBag: 45  },
        { id: 'B', name: 'Kibuye Market Depot',            capacity: '250 bags',  fee: 'KES 40/bag/day',  feePerBag: 40  },
    ],
    'mombasa': [
        { id: 'A', name: 'Kongowea Market Cold Store',     capacity: '600 bags',  fee: 'KES 80/bag/day',  feePerBag: 80  },
        { id: 'B', name: 'Mombasa Port Grain Terminal',    capacity: '1200 bags', fee: 'KES 65/bag/day',  feePerBag: 65  },
    ],
    'kitui': [
        { id: 'A', name: 'Kitui Grain Co-op Store',        capacity: '200 bags',  fee: 'KES 40/bag/day',  feePerBag: 40  },
        { id: 'B', name: 'Eastern Dryland Depot',          capacity: '150 bags',  fee: 'KES 35/bag/day',  feePerBag: 35  },
    ],
    'garissa': [
        { id: 'A', name: 'Garissa Humanitarian Depot',     capacity: '300 bags',  fee: 'KES 45/bag/day',  feePerBag: 45  },
        { id: 'B', name: 'NFDs Grain Storage Hub',         capacity: '200 bags',  fee: 'KES 50/bag/day',  feePerBag: 50  },
    ],
    'default': [
        { id: 'A', name: 'CropEx Partner Depot (Central)', capacity: '300 bags',  fee: 'KES 50/bag/day',  feePerBag: 50  },
        { id: 'B', name: 'Regional Co-op Warehouse',       capacity: '200 bags',  fee: 'KES 45/bag/day',  feePerBag: 45  },
    ],
};

function resolveOriginTown(input) {
    const lower = input.toLowerCase();
    for (const [town, data] of Object.entries(TOWN_MAP)) {
        if (lower.includes(town)) return { town, ...data };
    }
    return null;
}

function resolveDestTown(input) {
    const lower = input.toLowerCase();
    for (const town of Object.keys(TOWN_MAP)) {
        if (lower.includes(town)) return town;
    }
    return null;
}

function getDepots(town) {
    return HOLDING_DEPOTS[town] || HOLDING_DEPOTS['default'];
}

function formatDepotList(depots, town) {
    const townTitle = town.charAt(0).toUpperCase() + town.slice(1);
    const lines = depots.map(d =>
        `*${d.id}.* ${d.name}\n    📦 Capacity: ${d.capacity}\n    💰 Fee: ${d.fee}`
    ).join('\n\n');
    return (
        `🏪 *Available Holding Depots near ${townTitle}:*\n\n` +
        `${lines}\n\n` +
        `Reply with *A*, *B*${depots.length > 2 ? ', or *C*' : ''} to select your preferred depot.`
    );
}

// =========================
// STATE STORES
// =========================
const pendingOrders    = {};
const pendingLogistics = {};

// =========================
// INTENT DETECTION
// =========================
function detectIntent(msg, fromNumber) {
    const lower = msg.toLowerCase().trim();

    // ── Confirmation shortcuts ───────────────────────────────────────────────
    if (lower === 'yes' || lower === 'no') {
        return { intent: 'CONFIRM', symbol: null };
    }
    if (lower === 'confirm logistics') {
        return { intent: 'CONFIRM', symbol: null };
    }
    if (lower === 'cancel') {
        return { intent: 'CONFIRM', symbol: null };
    }

    // ── Logistics multi-step state machine ───────────────────────────────────
    const ls = pendingLogistics[fromNumber];
    if (ls) {
        if (ls.status === 'awaiting_qty') {
            const qty = extractQty(lower);
            if (qty) return { intent: 'LOGISTICS_QTY', symbol: null, qty };
        }
        if (ls.status === 'awaiting_origin') {
            return { intent: 'LOGISTICS_ORIGIN', symbol: null };
        }
        if (ls.status === 'awaiting_destination') {
            return { intent: 'LOGISTICS_DESTINATION', symbol: null };
        }
        if (ls.status === 'awaiting_depot') {
            const pick = lower.trim().toUpperCase();
            if (['A','B','C'].includes(pick)) return { intent: 'LOGISTICS_DEPOT_PICK', symbol: null };
        }
        if (ls.status === 'awaiting_logistics_confirm') {
            return { intent: 'CONFIRM', symbol: null };
        }
    }

    // ── Trade quantity follow-up ─────────────────────────────────────────────
    if (pendingOrders[fromNumber]?.status === 'awaiting_qty') {
        const qty = extractQty(lower);
        if (qty) return { intent: 'TRADE_QTY', symbol: null, qty };
    }

    // ── Greeting ─────────────────────────────────────────────────────────────
    if (GREETING_WORDS.some(w => lower.includes(w))) {
        return { intent: 'GREETING', symbol: null };
    }

    // ── Detect crop symbol ───────────────────────────────────────────────────
    let symbol = null;
    for (const [sym, keywords] of Object.entries(CROP_KEYWORDS)) {
        if (keywords.some(k => lower.includes(k))) { symbol = sym; break; }
    }

    // ── Recommendation ───────────────────────────────────────────────────────
    if (RECOMMEND_WORDS.some(w => lower.includes(w)) && symbol) {
        return { intent: 'RECOMMEND', symbol };
    }

    // ── Logistics ────────────────────────────────────────────────────────────
    if (LOGISTICS_WORDS.some(w => lower.includes(w))) {
        return { intent: 'LOGISTICS', symbol };
    }

    // ── Trade ────────────────────────────────────────────────────────────────
    if (TRADE_WORDS.some(w => lower.includes(w))) {
        const side = (lower.includes('buy') || lower.includes('nunua')) ? 'BUY' : 'SELL';
        const qty  = extractQty(lower);
        return { intent: 'TRADE', symbol, side, qty };
    }

    if (!symbol) return { intent: 'UNKNOWN', symbol: null };

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
🚚 *Transport help* — "I need transport for my maize"

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
- "I need transport for my beans"
- "Bei ya viazi ni ngapi?"

Type *hi* to see everything I can do.`;

// =========================
// HELPERS
// =========================
async function getRecommendation(symbol, fromNumber) {
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
    const lower  = msg.toLowerCase();
    const target = new Date();
    let daysToAdd = 30;

    if      (lower.includes('next week')  || lower.includes('1 week'))  daysToAdd = 7;
    else if (lower.includes('2 weeks'))                                  daysToAdd = 14;
    else if (lower.includes('3 weeks'))                                  daysToAdd = 21;
    else if (lower.includes('next month') || lower.includes('1 month')) daysToAdd = 30;
    else if (lower.includes('2 months'))                                 daysToAdd = 60;
    else if (lower.includes('3 months'))                                 daysToAdd = 90;

    target.setDate(target.getDate() + daysToAdd);
    return target.toISOString().split('T')[0];
}

// =========================
// QUANTITY EXTRACTOR
// =========================
function extractQty(msg) {
    const lower = msg.toLowerCase().trim();

    const WORD_NUMBERS = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
        'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
        'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
        'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40,
        'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
        'hundred': 100,
        // Swahili
        'moja': 1, 'mbili': 2, 'tatu': 3, 'nne': 4, 'tano': 5,
        'sita': 6, 'saba': 7, 'nane': 8, 'tisa': 9, 'kumi': 10,
        'ishirini': 20, 'thelathini': 30, 'arobaini': 40, 'hamsini': 50,
    };

    const FRACTIONS = {
        'three quarters': 0.75, 'three-quarters': 0.75,
        'and a half': 0.5,      'na nusu': 0.5,
        'point five': 0.5,      'na robo': 0.25,
        'half': 0.5,            'nusu': 0.5,
        'quarter': 0.25,        'robo': 0.25,
        'third': 1/3,           'thuluthi': 1/3,
    };

    // Standalone fraction
    for (const [word, val] of Object.entries(FRACTIONS)) {
        if (lower === word) return val;
    }

    // Numeric match
    const numericMatch = lower.match(/(\d+(\.\d+)?)/);
    let base = numericMatch ? parseFloat(numericMatch[1]) : null;

    // Word number fallback
    if (base === null) {
        for (const [word, val] of Object.entries(WORD_NUMBERS)) {
            if (lower.includes(word)) { base = val; break; }
        }
    }

    if (base === null) return null;

    // Add fractions on top
    let fractional = 0;
    for (const [phrase, val] of Object.entries(FRACTIONS)) {
        if (lower.includes(phrase)) {
            const alreadyDecimal = lower.includes('.') && String(base).includes('.');
            if (!alreadyDecimal) fractional = val;
            break;
        }
    }

    return base + fractional;
}

// =========================
// EXPRESS / WEBHOOK
// =========================
const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/webhook', async (req, res) => {
    const incomingMsg = req.body.Body  || '';
    const fromNumber  = req.body.From;

    console.log(`\n[WHATSAPP RCVD] From: ${fromNumber} | Msg: "${incomingMsg}"`);

    const { intent, symbol, side, qty } = detectIntent(incomingMsg, fromNumber);
    console.log(`[INTENT] ${intent} | Symbol: ${symbol}`);

    switch (intent) {

        // ── GREETING ────────────────────────────────────────────────────────
        case 'GREETING':
            await sendWhatsApp(fromNumber, WELCOME_MSG);
            break;

        // ── FORECAST ────────────────────────────────────────────────────────
        case 'FORECAST': {
            const targetDate = extractTargetDate(incomingMsg);
            if (engine && !engine.killed) {
                engine.stdin.write(JSON.stringify({
                    type: 'ASK_AI',
                    symbol,
                    phone: fromNumber,
                    targetDate
                }) + '\n');
            }
            break;
        }

        // ── RECOMMEND ───────────────────────────────────────────────────────
        case 'RECOMMEND':
            await getRecommendation(symbol, fromNumber);
            break;

        // ── LOGISTICS ENTRY ─────────────────────────────────────────────────
        case 'LOGISTICS': {
            const detectedQty = extractQty(incomingMsg);
            const cropName    = CROP_NAMES[symbol] || 'crops';

            if (!symbol) {
                await sendWhatsApp(fromNumber,
                    `🚚 *CropEx Logistics*\n\nHabari! Which crop do you need transport for?\n\n` +
                    `e.g. "Transport for maize" or "Nataka kubeba maharagwe"`
                );
                break;
            }

            if (!detectedQty) {
                pendingLogistics[fromNumber] = { symbol, status: 'awaiting_qty' };
                await sendWhatsApp(fromNumber,
                    `🚚 *CropEx Logistics*\n\nHabari! How many bags of *${cropName}* do you have ready for transport?`
                );
                break;
            }

            // Has both symbol and qty — skip straight to origin
            pendingLogistics[fromNumber] = { symbol, qty: detectedQty, status: 'awaiting_origin' };
            await sendWhatsApp(fromNumber,
                `📍 *Got it — ${detectedQty} bags of ${cropName}!*\n\n` +
                `Which major town are you currently closest to?\n\n` +
                `*(Eldoret, Nakuru, Nairobi, Kisumu, Mombasa, Kitui, Garissa, Lodwar, Machakos)*`
            );
            break;
        }

        // ── LOGISTICS: QTY FOLLOW-UP ─────────────────────────────────────────
        case 'LOGISTICS_QTY': {
            const pending  = pendingLogistics[fromNumber];
            if (!pending) break;
            pending.qty    = qty;
            pending.status = 'awaiting_origin';
            const cropName = CROP_NAMES[pending.symbol] || 'crops';
            await sendWhatsApp(fromNumber,
                `📍 *Got it — ${qty} bags of ${cropName}!*\n\n` +
                `Which major town are you currently closest to?\n\n` +
                `*(Eldoret, Nakuru, Nairobi, Kisumu, Mombasa, Kitui, Garissa, Lodwar, Machakos)*`
            );
            break;
        }

        // ── LOGISTICS: ORIGIN TOWN ───────────────────────────────────────────
        case 'LOGISTICS_ORIGIN': {
            const pending    = pendingLogistics[fromNumber];
            if (!pending) break;
            const originData = resolveOriginTown(incomingMsg);

            if (!originData) {
                await sendWhatsApp(fromNumber,
                    `❓ I didn't recognise that town. Please try again:\n\n` +
                    `*Eldoret, Nakuru, Nairobi, Kisumu, Mombasa, Kitui, Garissa, Lodwar, Machakos*`
                );
                break;
            }

            pending.origin       = originData.town;
            pending.originMarket = originData.market;
            pending.eta          = originData.eta;
            pending.status       = 'awaiting_destination';

            await sendWhatsApp(fromNumber,
                `✅ *Origin locked:* ${originData.market}\n\n` +
                `🏁 Where do you want your *${pending.qty} bags* delivered to?\n\n` +
                `*(Nairobi, Mombasa, Nakuru, Kisumu, Eldoret, Kitui, Garissa)*`
            );
            break;
        }

        // ── LOGISTICS: DESTINATION TOWN ──────────────────────────────────────
        case 'LOGISTICS_DESTINATION': {
            const pending  = pendingLogistics[fromNumber];
            if (!pending) break;
            const destTown = resolveDestTown(incomingMsg);

            if (!destTown) {
                await sendWhatsApp(fromNumber,
                    `❓ I didn't recognise that destination. Try:\n\n` +
                    `*Nairobi, Mombasa, Nakuru, Kisumu, Eldoret, Kitui, Garissa*`
                );
                break;
            }

            if (destTown === pending.origin) {
                await sendWhatsApp(fromNumber,
                    `⚠️ Origin and destination can't be the same town.\n\nWhere do you want the bags *delivered to*?`
                );
                break;
            }

            pending.destination = destTown;
            pending.destMarket  = TOWN_MAP[destTown]?.market || destTown;
            pending.status      = 'awaiting_depot';

            const depots    = getDepots(pending.origin);
            pending.depots  = depots;

            await sendWhatsApp(fromNumber, formatDepotList(depots, pending.origin));
            break;
        }

        // ── LOGISTICS: DEPOT SELECTION ───────────────────────────────────────
        case 'LOGISTICS_DEPOT_PICK': {
            const pending = pendingLogistics[fromNumber];
            if (!pending) break;

            const pick  = incomingMsg.trim().toUpperCase();
            const depot = pending.depots.find(d => d.id === pick);

            if (!depot) {
                const opts = pending.depots.map(d => `*${d.id}*`).join(', ');
                await sendWhatsApp(fromNumber, `Please reply with ${opts} to pick your depot.`);
                break;
            }

            const { symbol, qty, origin, originMarket, destination, destMarket, eta } = pending;

            // Move to confirmation state (don't delete yet)
            pending.selectedDepot = depot;
            pending.status        = 'awaiting_logistics_confirm';

            await processLogisticsMatching(
                fromNumber, symbol, qty,
                originMarket, destMarket,
                depot, eta
            );
            break;
        }

        // ── TRADE: NEW ORDER ─────────────────────────────────────────────────
        case 'TRADE': {
            if (!symbol) {
                await sendWhatsApp(fromNumber,
                    `❓ *Patrick here!* Which crop do you want to trade?\n\nTry: "Buy 5 bags of maize" or "Sell 3 bags of tomatoes"`
                );
                break;
            }
            if (!qty) {
                pendingOrders[fromNumber] = { side, symbol, qty: null, status: 'awaiting_qty' };
                await sendWhatsApp(fromNumber,
                    `🌾 *Patrick here!* How many bags of ${CROP_NAMES[symbol] || symbol} do you want to ${side.toLowerCase()}?`
                );
                break;
            }

            pendingOrders[fromNumber] = { side, symbol, qty, status: 'awaiting_confirmation' };

            await sendWhatsApp(fromNumber,
                `📋 *Patrick — Trade Summary*\n\n` +
                `${side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${CROP_NAMES[symbol] || symbol}*\n\n` +
                `Reply *YES* to confirm or *NO* to cancel.\n\n` +
                `_You have 3 minutes to confirm or the order will be cancelled._`
            );

            pendingOrders[fromNumber].reminderTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    await sendWhatsApp(fromNumber,
                        `⏰ *Patrick here!* You still have a pending trade:\n\n` +
                        `${side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${CROP_NAMES[symbol] || symbol}*\n\n` +
                        `Reply *YES* to confirm. You have *1 minute* left or it will be cancelled.`
                    );
                }
            }, 2 * 60 * 1000);

            pendingOrders[fromNumber].cancelTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    delete pendingOrders[fromNumber];
                    await sendWhatsApp(fromNumber,
                        `❌ *Patrick here!* Your trade was cancelled due to no response.\n\nSend a new order whenever you're ready.`
                    );
                }
            }, 3 * 60 * 1000);

            break;
        }

        // ── TRADE: QTY FOLLOW-UP ─────────────────────────────────────────────
        case 'TRADE_QTY': {
            const partial = pendingOrders[fromNumber];
            if (!partial) break;

            partial.qty    = qty;
            partial.status = 'awaiting_confirmation';

            await sendWhatsApp(fromNumber,
                `📋 *Patrick — Trade Summary*\n\n` +
                `${partial.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${CROP_NAMES[partial.symbol] || partial.symbol}*\n\n` +
                `Reply *YES* to confirm or *NO* to cancel.\n\n` +
                `_You have 3 minutes to confirm or the order will be cancelled._`
            );

            partial.reminderTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    await sendWhatsApp(fromNumber,
                        `⏰ *Patrick here!* You still have a pending trade:\n\n` +
                        `${partial.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${qty} bags* of *${CROP_NAMES[partial.symbol] || partial.symbol}*\n\n` +
                        `Reply *YES* to confirm. You have *1 minute* left or it will be cancelled.`
                    );
                }
            }, 2 * 60 * 1000);

            partial.cancelTimer = setTimeout(async () => {
                if (pendingOrders[fromNumber]?.status === 'awaiting_confirmation') {
                    delete pendingOrders[fromNumber];
                    await sendWhatsApp(fromNumber,
                        `❌ *Patrick here!* Your trade was cancelled due to no response.\n\nSend a new order whenever you're ready.`
                    );
                }
            }, 3 * 60 * 1000);

            break;
        }

        // ── CONFIRM (handles both trade and logistics) ───────────────────────
        case 'CONFIRM': {
            const upper = incomingMsg.trim().toUpperCase();

            // ── Logistics confirmation ──────────────────────────────────────
            if (pendingLogistics[fromNumber]?.status === 'awaiting_logistics_confirm') {
                const ls = pendingLogistics[fromNumber];

                if (upper === 'CONFIRM LOGISTICS' || upper === 'YES') {
                    const summary = ls.logisticsSummary;
                    delete pendingLogistics[fromNumber];
                    const refNo = `CX-${Date.now().toString().slice(-6)}`;

                    await sendWhatsApp(fromNumber,
`✅ *Logistics Booking Confirmed!*

📋 *Reference:* #${refNo}
🌾 ${summary.qty} bags of ${CROP_NAMES[summary.symbol] || summary.symbol}
📍 From: ${summary.originMarket}
🏁 To: ${summary.destMarket}
🏪 Depot: ${summary.depot.name}
🚛 Vehicle: ${summary.truckId}
⏱️ ETA: ${summary.eta}
💰 Total Estimate: KES ${summary.totalCost.toLocaleString()}

Our logistics team will contact you shortly to coordinate pickup. Keep your phone on!

_Patrick — CropEx Market Advisor_`
                    );

                } else if (upper === 'CANCEL' || upper === 'NO') {
                    delete pendingLogistics[fromNumber];
                    await sendWhatsApp(fromNumber,
                        `❌ Logistics booking cancelled. No worries!\n\nSend *transport* anytime to start a new request.\n\n_Patrick — CropEx_`
                    );
                } else {
                    await sendWhatsApp(fromNumber,
                        `Please reply *CONFIRM LOGISTICS* to confirm or *CANCEL* to cancel your booking.`
                    );
                }
                break;
            }

            // ── Trade confirmation ──────────────────────────────────────────
            const pending = pendingOrders[fromNumber];
            if (!pending) {
                await sendWhatsApp(fromNumber,
                    `🤷 *Patrick here!* No pending action found. Send a new request to get started.`
                );
                break;
            }

            if (upper === 'YES') {
                clearTimeout(pending.reminderTimer);
                clearTimeout(pending.cancelTimer);
                delete pendingOrders[fromNumber];

                if (engine && !engine.killed) {
                    engine.stdin.write(JSON.stringify({
                        type:   'NEW_ORDER',
                        symbol: pending.symbol,
                        side:   pending.side,
                        qty:    pending.qty,
                        price:  0
                    }) + '\n');
                }

                await sendWhatsApp(fromNumber,
                    `✅ *Trade Executed!*\n\n` +
                    `${pending.side === 'BUY' ? '🔵 BUY' : '🔴 SELL'} *${pending.qty} bags* of *${CROP_NAMES[pending.symbol] || pending.symbol}*\n\n` +
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

        // ── UNKNOWN ──────────────────────────────────────────────────────────
        case 'UNKNOWN':
        default:
            await sendWhatsApp(fromNumber, UNKNOWN_MSG);
            break;
    }

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
        if (client.readyState === WebSocket.OPEN) client.send(msg);
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
    const lines = data.toString().trim().split('\n');
    lines.forEach(async line => {
        if (!line) return;
        try {
            const json = JSON.parse(line);
            if (json.type === 'AI_RESPONSE') {
                console.log(`[SENDING FORECAST TO ${json.phone}]`);
                await sendWhatsApp(json.phone, sanitizeForecastMessage(json.message));
                console.log(`✓ Forecast sent`);
            } else if (json.type === 'RECOMMEND_RESPONSE') {
                console.log(`[SENDING RECOMMENDATION TO ${json.phone}]`);
                await sendWhatsApp(json.phone, formatRecommendation(json));
                console.log(`✓ Recommendation sent`);
            } else {
                broadcast(json);
                process.stdout.write('.');
            }
        } catch (e) { /* ignore partial fragments */ }
    });
});

engine.stderr.on('data', (data) => console.error(`[engine error]: ${data}`));
engine.on('close', (code) => console.log(`[engine halted] code: ${code}`));

// =========================
// LOGISTICS MATCHING
// =========================
async function processLogisticsMatching(fromNumber, symbol, qty, originMarket, destMarket, depot, eta) {
    try {
        const response = await fetch(`${PYTHON_API}/logistics/optimize`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ origin: originMarket, destination: destMarket })
        });

        const data  = await response.json();
        const match = data.optimized_matches[0];

        const holdingCost   = Math.round(qty * depot.feePerBag);
        const transportCost = qty < 10 ? Math.round(qty * 250) : Math.round(qty * 180);
        const totalCost     = holdingCost + transportCost;
        const savingsNote   = qty < 10
            ? `You save KES ${Math.round(qty * 110).toLocaleString()} via cooperative pooling!`
            : `You save ~30% on standard freight via backhaul routing!`;
        const flowType = qty < 10
            ? '🤝 *Cooperative Pooling Match*'
            : '🚛 *Dedicated Backhaul Vehicle*';

        const cropName = CROP_NAMES[symbol] || symbol;

        // Store summary for confirmation step
        pendingLogistics[fromNumber].logisticsSummary = {
            symbol, qty, originMarket, destMarket, depot,
            truckId: match.truck_id, eta, totalCost
        };

        const replyMsg =
`🚚 *CropEx Logistics — Route Found!*

${flowType}

📦 *Your Consignment:*
🌾 Crop: *${cropName}* | Bags: *${qty}*
📍 Origin: *${originMarket}*
🏁 Destination: *${destMarket}*

🏪 *Selected Holding Depot:*
${depot.name}
📦 Capacity: ${depot.capacity}
💰 Storage: ${depot.fee} × ${qty} bags = *KES ${holdingCost.toLocaleString()}/day*
🔒 Your slot is secured for *24 hours* — fully covered by CropEx!

🚛 *Matched Vehicle:* ${match.truck_id} (${match.capacity_tons} Tons)
⏱️ *Pickup ETA:* ${eta}

💵 *Cost Breakdown:*
• Storage (1 day): KES ${holdingCost.toLocaleString()}
• Transport:       KES ${transportCost.toLocaleString()}
• ─────────────────────────
• *Total Estimate: KES ${totalCost.toLocaleString()}*

💡 ${savingsNote}

Reply *CONFIRM LOGISTICS* to lock this booking
or *CANCEL* to start over.

_Powered by CropEx Graph Router (Neo4j)_`;

        await sendWhatsApp(fromNumber, replyMsg);

    } catch (err) {
        console.error('[logistics] error:', err);
        await sendWhatsApp(fromNumber,
            `❌ *Logistics Router offline.* Please try again shortly.\n\n_CropEx Support_`
        );
    }
}

// =========================
// FORMAT RECOMMENDATION
// =========================
function formatRecommendation(data) {
    const actionEmoji = { 'sell': '🟢', 'hold': '🟡', 'monitor': '🟠', 'buy': '🔵' };
    const action          = data.action       || data.action_type    || 'hold';
    const confidence      = data.model_confidence || data.confidence || 'medium';
    const recommendations = data.reasons      || data.recommendations || [];
    const emoji           = actionEmoji[action] || '⚪';
    const recs            = recommendations.map(r => `• ${r}`).join('\n');

    if (data.farmer_message) {
        return (
            `💡 *CropEx Trading Intelligence*\n\n${data.farmer_message}\n\n` +
            `${emoji} *Strategy: ${action.toUpperCase()}*\n\n` +
            `*Insights:*\n${recs}\n\n` +
            `⚠️ _AI-generated advice. Do not risk capital you cannot afford to lose._`
        );
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
// FORECAST SANITIZER
// =========================
function sanitizeForecastMessage(msg) {
    if (!msg) return msg;
    let clean = msg;
    clean = clean.replace(/(KES\s+\d+\.\d{2})\d+/gi, '$1');
    const warningIndex = clean.indexOf("⚠️");
    if (warningIndex !== -1) clean = clean.substring(0, warningIndex).trim();
    clean = clean.replace(/📊\s+Confidence:\s+\d+(\.\d+)?%/gi, '');
    return clean.trim() + "\n\n_Powered by CropEx_";
}

// =========================
// NEWS FETCHER
// =========================
async function fetchNews() {
    try {
        const res  = await fetch(NEWS_URL);
        const data = await res.json();
        if (!data.articles) { console.error('[news] API error:', data.errors || data); return; }
        latestNews = data.articles.slice(0, 6).map(a => ({
            title:       a.title,
            source:      a.source.name,
            url:         a.url,
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