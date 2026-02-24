import { useState, useEffect } from 'react'
import { ChartComponent } from './components/Chart';
import './App.css'

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

function App() {
  const [data, setData] = useState<CandleData[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] = useState<string>("DISCONNECTED");

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
        setConnectionStatus("CONNECTED");
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const price = parseFloat(message.price);
        const time = Math.floor(message.time / 5) * 5;

        setCurrentPrice(price);

        setData(prevData => {
            const lastCandle = prevData[prevData.length - 1];

            if (!lastCandle) {
                return [{ time: time as any, open: price, high: price, low: price, close: price }];
            }

            if (time > (lastCandle.time as any)) {
                 return [...prevData, { time: time as any, open: price, high: price, low: price, close: price }];
            }

            const updatedCandle = {
                ...lastCandle,
                high: Math.max(lastCandle.high, price),
                low: Math.min(lastCandle.low, price),
                close: price
            };
            
            const newData = [...prevData];
            newData[prevData.length - 1] = updatedCandle;
            return newData;
        });
    };

    ws.onclose = () => setConnectionStatus("DISCONNECTED");

    return () => ws.close();
  }, []);

  return (
    <div className="dashboard">
      <header>
        <h1>CROPEX <span className={`status ${connectionStatus.toLowerCase()}`}>{connectionStatus}</span></h1>
        <div className="ticker">
            POTATO / KES <span style={{color: 'white', marginLeft: '10px'}}>{currentPrice.toFixed(2)}</span>
        </div>
      </header>
      
      <main>
        <div className="chart-container">
           <ChartComponent 
              data={data} 
              colors={{ backgroundColor: '#161b22', textColor: '#c9d1d9' }}
            />
        </div>
        {/* ... keep order book ... */}
      </main>
    </div>
  )
}

export default App