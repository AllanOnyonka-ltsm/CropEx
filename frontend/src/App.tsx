import { useState, useEffect } from 'react'
import { ChartComponent } from './components/Chart';
import './App.css'
import logo from './assets/logo_main.png';

interface MarketMessage {
  price: number;
  time: number;
  bid: number;
  ask: number;
  bidVol: number;
  askVol: number;
}

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
    ws.onopen = () => setConnectionStatus("CONNECTED");
    ws.onmessage = (event) => {
      const message: MarketMessage = JSON.parse(event.data);
      const price = message.price;
      const time = Math.floor(message.time / 5) * 5;
      setCurrentPrice(price);
      setOrderBook({ bid: message.bid, ask: message.ask, bidVol: message.bidVol, askVol: message.askVol });
      setData(prevData => {
        const lastCandle = prevData[prevData.length - 1];
        if (!lastCandle) return [{ time: time as any, open: price, high: price, low: price, close: price }];
        if (time > (lastCandle.time as any)) return [...prevData, { time: time as any, open: price, high: price, low: price, close: price }];
        const updatedCandle = { ...lastCandle, high: Math.max(lastCandle.high, price), low: Math.min(lastCandle.low, price), close: price };
        const newData = [...prevData];
        newData[prevData.length - 1] = updatedCandle;
        return newData;
      });
    };
    ws.onclose = () => setConnectionStatus("DISCONNECTED");
    return () => ws.close();
  }, []);

  const isConnected = connectionStatus === "CONNECTED";
  const spread = (orderBook.ask - orderBook.bid).toFixed(2);

  return (
    <div className="dashboard">

      {/* ── HEADER ── */}
      <header className="header">
        <div className="brand-lockup">
          <img src={logo} alt="CropEx" className="logo" />
        </div>

        <div className="header-center">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span className={`status-label ${isConnected ? 'connected' : 'disconnected'}`}>
            {connectionStatus}
          </span>
        </div>

        <div className="header-ticker">
          <span className="ticker-pair">POTATO / KES:</span>
          <span className="ticker-price">{currentPrice.toFixed(2)}</span>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className="main-grid">

        {/* LEFT — Chart (75%) */}
        <div className="left-panel">
          <div className="chart-container">
            <ChartComponent
              data={data}
              colors={{ backgroundColor: '#161b22', textColor: '#c9d1d9' }}
            />
          </div>
        </div>

        {/* RIGHT — Sidebar (25%) */}
        <div className="right-panel">

          {/* Order Book */}
          <div className="panel order-book-panel">
            <div className="panel-header">ORDER BOOK</div>
            <div className="ob-labels">
              <span>PRICE</span><span>QUANTITY</span><span>CUMULATIVE</span>
            </div>

            {/* ASK rows (sellers) */}
            <div className="ob-row ask">
              <span>{orderBook.ask.toFixed(2)}</span>
              <span>{orderBook.askVol}</span>
              <span>{orderBook.ask.toFixed(2)}</span>
            </div>

            {/* Spread */}
            <div className="ob-spread">⬌ {spread}</div>

            {/* BID rows (buyers) */}
            <div className="ob-row bid">
              <span>{orderBook.bid.toFixed(2)}</span>
              <span>{orderBook.bidVol}</span>
              <span>{orderBook.bid.toFixed(2)}</span>
            </div>
          </div>

          {/* Buy / Sell */}
          <BuySellPanel currentPrice={currentPrice} />

          {/* News Feed */}
          <NewsFeedPanel />

        </div>
      </div>
    </div>
  );
}

/* ── BUY / SELL PANEL (stub) ── */
function BuySellPanel({ currentPrice }: { currentPrice: number }) {
  return (
    <div className="panel buysell-panel">
      <div className="panel-header">
        BUY / SELL
        <span className="panel-header-sub">Price: ¥ {currentPrice.toFixed(2)}</span>
      </div>
      <div className="bs-inputs">
        <div className="bs-input-group">
          <span className="bs-input-icon">¥</span>
          <input className="bs-input" type="number" placeholder={currentPrice.toFixed(2)} readOnly />
        </div>
        <input className="bs-input" type="number" placeholder="QUANTITY" />
      </div>
      <div className="bs-buttons">
        <button className="bs-btn sell">SELL</button>
        <button className="bs-btn buy">BUY</button>
      </div>
    </div>
  );
}

/* ── NEWS FEED PANEL (stub) ── */
function NewsFeedPanel() {
  const placeholders = [
    { time: '5m ago', text: 'Potato futures surge on Rift Valley supply concerns.' },
    { time: '12m ago', text: 'KES weakens against USD — commodity imports face headwinds.' },
    { time: '28m ago', text: 'Nairobi Commodity Exchange volumes hit weekly high.' },
    { time: '1h ago', text: 'Maize corridor report: Eldoret throughput up 14%.' },
  ];

  return (
    <div className="panel news-panel">
      <div className="panel-header">
        MARKET NEWS
        <span className="panel-header-badge">LIVE</span>
      </div>
      <div className="news-list">
        {placeholders.map((item, i) => (
          <div className="news-item" key={i}>
            <span className="news-time">{item.time}</span>
            <span className="news-text">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;