const { spawn } = require('child_process');
const WebSocket = require('ws');

// setup websocket server
const wss = new WebSocket.Server({ port: 8080 });
console.log("--- cropex bridge live on localhost:8080 ---");

// spawn the c++ engine
const engine = spawn('./market_sim.exe');

// pipe c++ output to websockets
engine.stdout.on('data', (data) => {
    const output = data.toString().trim();
    
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (!line) return;
        try {
            // verify it's json (optional, but good safety)
            const json = JSON.parse(line);
            
            // broadcast to all connected frontend clients
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(json));
                }
            });
            // minimal log to prove it's working
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