# CropEx Full Stack Launcher
Write-Host "Starting CropEx..." -ForegroundColor Green

# 1. Forecaster
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\forecaster\price_api'; uvicorn app:app --host 127.0.0.1 --port 8000 --reload" -WindowStyle Normal

Start-Sleep -Seconds 2

# 2. Bridge + Engine
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; node bridge.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# 3. Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# 4. Open browser
Start-Process "http://localhost:5173"

Write-Host "All systems go!" -ForegroundColor Cyan
Write-Host "Forecaster : http://127.0.0.1:8000" -ForegroundColor Yellow
Write-Host "Bridge     : ws://localhost:8080" -ForegroundColor Yellow
Write-Host "Dashboard  : http://localhost:5173" -ForegroundColor Yellow
Write-Host "Trading    : http://localhost:5173/trade" -ForegroundColor Yellow