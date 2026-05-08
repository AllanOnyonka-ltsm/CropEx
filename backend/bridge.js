const { spawn } = require('child_process');
const WebSocket = require('ws');

const express = require('express');
const twilio = require('twilio');

// news api
const GNEWS_API_KEY = "cdae864b8249cf59c5b45bdf3a349177";
const NEWS_URL = `https://gnews.io/api/v4/search?q="commodity" OR "maize" OR "wheat" OR "Kenya agriculture"&lang=en&sortBy=publishedAt&apikey=${GNEWS_API_KEY}`;

// twilio api
const twilioClient = twilio('AC33fa0c99c8f730fe28e8fc2f02610cbf', '2514b481130167f01f238e628f5ec344');
const TWILIO_SANDBOX_NUMBER = 'whatsapp:+14155238886';

// express server
const app = express();
app.use(express.urlencoded({ extended: true }));

app.post('/webhook', (req, res) => {
    const incomingMsg = req.body.Body.toLowerCase();
    const fromNumber = req.body.From; 

    console.log(`\n[WHATSAPP RCVD] From: ${fromNumber} | Msg: ${incomingMsg}`);

    let symbol = '';
    if (incomingMsg.includes('tomato')) symbol = 'TMO';
    else if (incomingMsg.includes('potato')) symbol = 'PTO';
    else if (incomingMsg.includes('onion')) symbol = 'ONN';
    // i will add more crops here later //liman

    if (symbol) {
        // Send request down to C++ with the farmer's phone number
        if (engine && !engine.killed) {
            engine.stdin.write(JSON.stringify({ type: 'ASK_AI', symbol: symbol, phone: fromNumber }) + '\n');
        }
    } else {
        twilioClient.messages.create({
            body: "Welcome to CropEx! Ask me about crop prices, e.g., 'What is the forecast for tomatoes?'",
            from: TWILIO_SANDBOX_NUMBER,
            to: fromNumber
        });
    }

    // receipt to Twilio immediately so it doesn't timeout
    res.send('<Response></Response>'); 
});

app.listen(5000, () => console.log("--- twilio webhook listening on port 5000 ---"));

// setup websocket server
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

// spawn the c++ engine
const engine = spawn('./cropex-engine.exe');

// pipe c++ output to websockets
engine.stdout.on('data', (data) => {
    const output = data.toString().trim();
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (!line) return;
        try {
            const json = JSON.parse(line);
            
            if (json.type === 'AI_RESPONSE') {
                console.log(`[SENDING WHATSAPP TO ${json.phone}]`);
                twilioClient.messages.create({
                    body: json.message,
                    from: TWILIO_SANDBOX_NUMBER,
                    to: json.phone
                }).then(message => console.log(`✓ Message Sent! SID: ${message.sid}`))
                  .catch(err => console.error("Twilio Error:", err));
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

// fetch and broadcast news
async function fetchNews() {
    try {
        const res = await fetch(NEWS_URL);
        const data = await res.json();

        if (!data.articles) {
            console.error('[news] API error:', data.errors || data);
            return;
        }

        // Store to cache
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
// setInterval(fetchNews, 15 * 60 * 1000);