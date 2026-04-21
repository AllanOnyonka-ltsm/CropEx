const { spawn } = require('child_process');
const WebSocket = require('ws');

// news api
const NEWS_API_KEY = "4ae1762b929c417ea7165a403d4a983c";
const NEWS_URL = `https://newsapi.org/v2/everything?q=agriculture+Kenya+commodity+maize+wheat&sortBy=publishedAt&language=en&apiKey=${NEWS_API_KEY}`;

// setup websocket server
const wss = new WebSocket.Server({ port: 8080 });
console.log("--- cropex bridge live on localhost:8080 ---");

// 1. ADD CACHE STATE FOR NEWS
let latestNews = [];

// 2. DEFINE THE MISSING BROADCAST FUNCTION
function broadcast(data) {
    const msg = typeof data === 'string' ? data : JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// 3. SEND CACHED NEWS TO NEW CONNECTIONS IMMEDIATELY
wss.on('connection', (ws) => {
    if (latestNews.length > 0) {
        ws.send(JSON.stringify({ type: 'newsBatch', articles: latestNews }));
    }
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
            
            // Refactored to use the new reusable broadcast function
            broadcast(json);
            
            process.stdout.write('.'); 
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

        if (data.status !== 'ok') {
            console.error('[news] API error:', data.message);
            return;
        }

        // Store to cache
        latestNews = data.articles.slice(0, 6).map(a => ({
            title: a.title,
            source: a.source.name,
            url: a.url,
            publishedAt: a.publishedAt,
        }));

        // Now broadcast works correctly!
        broadcast({ type: 'newsBatch', articles: latestNews });
        console.log(`\n[news] fetched ${latestNews.length} articles`);
    } catch (err) {
        console.error('[news] fetch failed:', err.message);
    }
}

fetchNews();
setInterval(fetchNews, 5 * 60 * 1000);