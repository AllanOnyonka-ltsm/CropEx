import { useState, useEffect } from 'react'
import { ChartComponent } from './components/Chart';
import './App.css'
import logo from './assets/logo_main.png';

// define the incoming WebSocket Message Structure
interface MarketMessage {
  price: number;
  time: number; // timestamp (seconds)
  bid: number;
  ask: number;
  bidVol: number;
  askVol: number;
}

// define Candle Structure for the Chart
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
  
  const [orderBook, setOrderBook] = useState({ bid: 0, ask: 0, bidVol: 0, askVol: 0 });

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
        setConnectionStatus("CONNECTED");
    };

    ws.onmessage = (event) => {
        const message: MarketMessage = JSON.parse(event.data);
        
        const price = message.price;
        const time = Math.floor(message.time / 5) * 5; // 5-second buckets

        setCurrentPrice(price);

        setOrderBook({
            bid: message.bid,
            ask: message.ask,
            bidVol: message.bidVol,
            askVol: message.askVol
        });

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
        <div className="brand-lockup" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src={logo} alt="CropEx" style={{ height: '70px' }} />
            <span className={`status ${connectionStatus.toLowerCase()}`}>{connectionStatus}</span>
        </div>
        <div className="ticker" style={{marginLeft: '10px'}}>
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
        
        <div className="order-book-container">
            <h3>Live Market Depth</h3>
            <div className="order-book">
                {/* ASK SIDE (Sellers) */}
                <div className="book-row ask">
                    <span className="side">SELL</span>
                    <span className="price">{orderBook.ask.toFixed(2)}</span>
                    <span className="vol">{orderBook.askVol}</span>
                </div>

                {/* SPREAD */}
                <div className="spread-row">
                    Spread: {(orderBook.ask - orderBook.bid).toFixed(2)}
                </div>

                {/* BID SIDE (Buyers) */}
                <div className="book-row bid">
                    <span className="side">BUY</span>
                    <span className="price">{orderBook.bid.toFixed(2)}</span>
                    <span className="vol">{orderBook.bidVol}</span>
                </div>
            </div>
        </div>
      </main>
    </div>
  )
}

export default App