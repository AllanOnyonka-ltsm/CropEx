# PYTHON AI GATEWAY (Port 8000)

# Create the virtual environment folder

cd forecaster
cd price_api
python3 -m venv .venv

source .venv/bin/activate
pip install -r requirements.txt

uvicorn app:app --host 127.0.0.1 --port 8000 --reload


# 2. C++ ENGINE COMPILATION (Pop!_OS / Linux)
# (Ensure httplib.h and json.hpp are in the directory)
cd backend
rm -f matching_engine
g++ -std=c++17 -O3 cropex-engine.cpp -o matching_engine -pthread


# 3. NODE.JS BRIDGE (Port 5000 & WS Port 8080)
# (Ensure matching_engine executable is copied or linked here)
cd bridge
cp ../backend/matching_engine .
npm install ws express twilio rss-parser
node bridge.js


# 4. NGROK TUNNEL (Tunnels WhatsApp Port 5000)
ngrok http 5000