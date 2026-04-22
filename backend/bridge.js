const { spawn } = require('child_process');
const WebSocket = require('ws');

// news api
const GNEWS_API_KEY = "cdae864b8249cf59c5b45bdf3a349177";
const NEWS_URL = `https://gnews.io/api/v4/search?q="commodity" OR "maize" OR "wheat" OR "Kenya agriculture"&lang=en&sortBy=publishedAt&apikey=${GNEWS_API_KEY}`;

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

        // GNews uses 'errors' instead of 'status: ok' if something goes wrong.
        // We just check if 'articles' exists.
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

        // Now broadcast works correctly!
        broadcast({ type: 'newsBatch', articles: latestNews });
        console.log(`\n[news] fetched ${latestNews.length} articles`);
    } catch (err) {
        console.error('[news] fetch failed:', err.message);
    }
}

fetchNews();
setInterval(fetchNews, 5 * 60 * 1000);
// setInterval(fetchNews, 15 * 60 * 1000);