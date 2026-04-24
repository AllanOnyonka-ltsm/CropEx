import { useState, useEffect, useRef } from 'react'
import { ChartComponent } from './components/Chart';
import './App.css'
import logo from './assets/logo_main.png';

interface Toast {
  id: number;
  message: string;
  type: 'BUY' | 'SELL';
}

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SymbolState {
  price: number;
  bid: number;
  ask: number;
  bidVol: number;
  askVol: number;
  name: string;
  unit: string;
  candles: CandleData[];
}

const SYMBOLS = ['PTO', 'MAZ', 'WHT', 'BNS', 'ONN', 'TMO', 'SGM', 'CAS'];

function App() {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('MAZ');
  const [marketData, setMarketData] = useState<Record<string, SymbolState>>({});
  const [connectionStatus, setConnectionStatus] = useState<string>('DISCONNECTED');
  const [news, setNews] = useState<{ title: string; source: string; url: string; publishedAt: string }[]>([]);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'BUY' | 'SELL') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current = ws;
    ws.onopen = () => setConnectionStatus('CONNECTED');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'newsBatch') {
        setNews(msg.articles);
        return;
    }
      const { symbol, price, bid, ask, bidVol, askVol, name, unit } = msg;
      const time = Math.floor(msg.time / 1) * 1;

      setMarketData(prev => {
        const existing = prev[symbol];
        const prevCandles = existing?.candles ?? [];
        const lastCandle = prevCandles[prevCandles.length - 1];

        let updatedCandles: CandleData[];
        if (!lastCandle) {
          updatedCandles = [{ time, open: price, high: price, low: price, close: price }];
        } else if (time > lastCandle.time) {
          updatedCandles = [...prevCandles, { time, open: price, high: price, low: price, close: price }];
        } else {
          const updated = { ...lastCandle, high: Math.max(lastCandle.high, price), low: Math.min(lastCandle.low, price), close: price };
          updatedCandles = [...prevCandles.slice(0, -1), updated];
        }

        return {
          ...prev,
          [symbol]: { price, bid, ask, bidVol, askVol, name, unit, candles: updatedCandles }
        };
      });
    };

    ws.onclose = () => setConnectionStatus('DISCONNECTED');
    return () => ws.close();
  }, []);

  const isConnected = connectionStatus === 'CONNECTED';
  const active = marketData[selectedSymbol];
  const spread = (active?.ask && active?.bid)
    ? (active.ask - active.bid).toFixed(2)
    : '0.00';

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
          <div className="ticker-titles">
            <span className="ticker-pair">{selectedSymbol} / KES</span>
            <span className="ticker-name">{active?.name || '...'}</span>
          </div>
          <span className="ticker-price">{(active?.price ?? 0).toFixed(2)}</span>
        </div>
      </header>

      {/* ── SYMBOL BAR ── */}
      <div className="symbol-bar">
        {SYMBOLS.map(sym => {
          const s = marketData[sym];
          return (
            <button
              key={sym}
              className={`symbol-btn ${sym === selectedSymbol ? 'active' : ''}`}
              onClick={() => setSelectedSymbol(sym)}
            >
              <span className="symbol-code">{sym}</span>
              <span className="symbol-price">{(s?.price ?? 0).toFixed(0)}</span>
            </button>
          );
        })}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="main-grid">

        <div className="left-panel">
          <div className="chart-container">
            <ChartComponent
              data={(active?.candles ?? []) as any}
              colors={{ backgroundColor: '#161b22', textColor: '#c9d1d9' }}
            />
          </div>
        </div>

        <div className="right-panel">

          <div className="panel order-book-panel">
            <div className="panel-header">
              ORDER BOOK
              <span className="panel-header-sub">{active?.unit ?? ''}</span>
            </div>
            <div className="ob-labels">
              <span>PRICE</span><span>QUANTITY</span><span>CUMULATIVE</span>
            </div>
            <div className="ob-row ask">
              <span>{(active?.ask ?? 0).toFixed(2)}</span>
              <span>{active?.askVol ?? 0}</span>
              <span>{(active?.ask ?? 0).toFixed(2)}</span>
            </div>
            <div className="ob-spread">⬌ {spread}</div>
            <div className="ob-row bid">
              <span>{(active?.bid ?? 0).toFixed(2)}</span>
              <span>{active?.bidVol ?? 0}</span>
              <span>{(active?.bid ?? 0).toFixed(2)}</span>
            </div>
          </div>

          <BuySellPanel 
              currentPrice={active?.price ?? 0} 
              symbol={selectedSymbol} 
              name={active?.name ?? ''} 
              onPlaceOrder={(side, price, qty) => {
                  const order = {
                      type: 'NEW_ORDER',
                      symbol: selectedSymbol,
                      side: side,
                      price: price,
                      qty: qty,
                      timestamp: Date.now(),
                      userId: "user_123" 
                  };
                  if (wsRef.current?.readyState === WebSocket.OPEN) {
                      wsRef.current.send(JSON.stringify(order));
                  } else {
                      showToast("ERROR: NOT CONNECTED TO EXCHANGE", "SELL");
                      return;
                  }
                  
                  // 👇 REPLACED ALERT WITH TOAST 👇
                  showToast(`ORDER SENT: ${side} ${qty} ${selectedSymbol} @ KES ${price.toFixed(2)}`, side);
              }}
          />
          <NewsFeedPanel articles={news}/>

        </div>
      </div>

      {/* ── TOAST NOTIFICATIONS ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type.toLowerCase()}`}>
            <span className="toast-icon">{t.type === 'BUY' ? '▲' : '▼'}</span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>

    </div>
  );
}

/* ── BUY / SELL PANEL ── */
function BuySellPanel({ 
  currentPrice, 
  symbol, 
  name, 
  onPlaceOrder 
}: { 
  currentPrice: number; 
  symbol: string; 
  name: string;
  onPlaceOrder: (side: 'BUY' | 'SELL', price: number, qty: number) => void;
}) {
  const [qty, setQty] = useState<string>('');
  // We use currentPrice as default, but a real trader could type a limit order price here
  const [orderPrice, setOrderPrice] = useState<string>('');

  const handleTrade = (side: 'BUY' | 'SELL') => {
    const finalPrice = orderPrice ? parseFloat(orderPrice) : currentPrice;
    const finalQty = parseInt(qty);

    if (!finalQty || finalQty <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }

    onPlaceOrder(side, finalPrice, finalQty);
    setQty(''); // clear input after ordering
  };

  return (
    <div className="panel buysell-panel">
      <div className="panel-header">
        TRADE {name.toUpperCase()}
        <span className="panel-header-sub">KES {currentPrice.toFixed(2)}</span>
      </div>
      <div className="bs-inputs">
        <div className="bs-input-group">
          <span className="bs-input-icon">KES</span>
          <input 
            className="bs-input" 
            type="number" 
            placeholder={currentPrice.toFixed(2)} 
            value={orderPrice}
            onChange={(e) => setOrderPrice(e.target.value)}
          />
        </div>
        <input 
          className="bs-input" 
          type="number" 
          placeholder="QUANTITY (bags)" 
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div className="bs-buttons">
        <button className="bs-btn sell" onClick={() => handleTrade('SELL')}>SELL {symbol}</button>
        <button className="bs-btn buy" onClick={() => handleTrade('BUY')}>BUY {symbol}</button>
      </div>
    </div>
  );
}
/* ── NEWS FEED PANEL ── */
function NewsFeedPanel({ articles }: { articles: { title: string; source: string; url: string; publishedAt: string }[] }) {
    const items = articles.length > 0 ? articles : [
        { title: 'Waiting for news feed...', source: '', url: '#', publishedAt: '' }
    ];

    return (
        <div className="panel news-panel">
            <div className="panel-header">
                MARKET NEWS
                <span className="panel-header-badge">LIVE</span>
            </div>
            <div className="news-list">
                {items.map((item, i) => (
                    <div className="news-item" key={i} onClick={() => item.url !== '#' && window.open(item.url, '_blank')}
                         style={{ cursor: item.url !== '#' ? 'pointer' : 'default' }}>
                        <span className="news-time">{item.source}</span>
                        <span className="news-text">{item.title}</span>
                    </div>
                ))}
            </div>

            
        </div>
    );
}
export default App;