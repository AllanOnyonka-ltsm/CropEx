import { useEffect, useMemo, useState } from 'react'

type SymbolCode = 'MAZ' | 'WHT' | 'BNS' | 'ONN' | 'TMO' | 'SGM' | 'CAS' | 'PTO'

type QuoteMessage = {
  symbol: SymbolCode
  name: string
  price: number
  bid?: number
  ask?: number
  time: number
}

type QuoteState = {
  symbol: SymbolCode
  englishName: string
  swahiliName: string
  price: number | null
  change: number | null
  direction: 'up' | 'down' | 'flat'
  bid: number | null
  ask: number | null
  updatedAt: number | null
}

const SYMBOL_ORDER: SymbolCode[] = ['MAZ', 'WHT', 'BNS', 'ONN', 'TMO', 'SGM', 'CAS', 'PTO']

const SWAHILI_NAMES: Record<SymbolCode, string> = {
  MAZ: 'Mahindi',
  WHT: 'Ngano',
  BNS: 'Maharagwe',
  ONN: 'Vitunguu',
  TMO: 'Nyanya',
  SGM: 'Mtama',
  CAS: 'Muhogo',
  PTO: 'Viazi',
}

const INITIAL_QUOTES: Record<SymbolCode, QuoteState> = {
  MAZ: { symbol: 'MAZ', englishName: 'Maize', swahiliName: SWAHILI_NAMES.MAZ, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  WHT: { symbol: 'WHT', englishName: 'Wheat', swahiliName: SWAHILI_NAMES.WHT, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  BNS: { symbol: 'BNS', englishName: 'Beans', swahiliName: SWAHILI_NAMES.BNS, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  ONN: { symbol: 'ONN', englishName: 'Onions', swahiliName: SWAHILI_NAMES.ONN, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  TMO: { symbol: 'TMO', englishName: 'Tomatoes', swahiliName: SWAHILI_NAMES.TMO, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  SGM: { symbol: 'SGM', englishName: 'Sorghum', swahiliName: SWAHILI_NAMES.SGM, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  CAS: { symbol: 'CAS', englishName: 'Cassava', swahiliName: SWAHILI_NAMES.CAS, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
  PTO: { symbol: 'PTO', englishName: 'Potatoes', swahiliName: SWAHILI_NAMES.PTO, price: null, change: null, direction: 'flat', bid: null, ask: null, updatedAt: null },
}

const STEP_ITEMS = [
  {
    title: 'Tuma jina la zao',
    body: 'Andika "mahindi" au "nyanya" kwenye WhatsApp na utume kwa CropEx.',
    icon: '01',
  },
  {
    title: 'Pata bei ya soko',
    body: 'Tunarudisha bei ya leo, trend ya bei, na eneo la kusoma haraka.',
    icon: '02',
  },
  {
    title: 'Fanya uamuzi',
    body: 'Uza, subiri, au nunua kwa confidence — bila kelele ya sokoni.',
    icon: '03',
  },
] as const

function isSymbolCode(value: string): value is SymbolCode {
  return Object.prototype.hasOwnProperty.call(SWAHILI_NAMES, value)
}

function App() {
  const [quotes, setQuotes] = useState<Record<SymbolCode, QuoteState>>(INITIAL_QUOTES)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080')

    socket.onopen = () => setConnectionStatus('connected')

    socket.onmessage = (event) => {
      let payload: QuoteMessage

      try {
        payload = JSON.parse(event.data) as QuoteMessage
      } catch (error) {
        console.error('CropEx received invalid websocket payload.', error)
        return
      }

      if (!payload || typeof payload.symbol !== 'string' || !isSymbolCode(payload.symbol)) {
        return
      }

      setQuotes((previousQuotes) => {
        const previous = previousQuotes[payload.symbol]
        const previousPrice = previous.price ?? payload.price
        const change = previousPrice > 0 ? ((payload.price - previousPrice) / previousPrice) * 100 : 0
        const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'

        return {
          ...previousQuotes,
          [payload.symbol]: {
            symbol: payload.symbol,
            englishName: payload.name,
            swahiliName: SWAHILI_NAMES[payload.symbol],
            price: payload.price,
            change,
            direction,
            bid: typeof payload.bid === 'number' ? payload.bid : null,
            ask: typeof payload.ask === 'number' ? payload.ask : null,
            updatedAt: payload.time,
          },
        }
      })
    }

    socket.onerror = () => setConnectionStatus('offline')
    socket.onclose = () => setConnectionStatus((current) => (current === 'connected' ? 'offline' : 'connecting'))

    return () => socket.close()
  }, [])

  const liveQuotes = useMemo(
    () => SYMBOL_ORDER.map((symbol) => quotes[symbol]),
    [quotes],
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <style>{styles}</style>

      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="text-sm font-semibold tracking-[0.35em] uppercase">CropEx</div>
          <div className="rounded-full border border-white/[0.15] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.3em] text-white/[0.65]">
            Bei za Leo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <section className="grid gap-12 border-b border-white/10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-6 flex items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-white/[0.55]">
              <span className={`status-dot ${connectionStatus}`} />
              Live commodity intelligence
            </div>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Jua bei ya mazao yako kabla hujaenda sokoni.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              Farmers hutuma jina la zao kwenye WhatsApp — tunarudisha bei ya leo, forecast ya soko, na advice ya haraka, free. Simple, local, and built for shamba life.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#live-prices"
                className="inline-flex items-center gap-3 rounded-full border border-[#1d9e75] bg-[#1d9e75] px-6 py-3 text-sm font-semibold text-black transition hover:opacity-90"
              >
                Anza Sasa — WhatsApp
                <span aria-hidden="true">↗</span>
              </a>
              <p className="text-sm text-white/[0.55]">
                Tuma crop name. Pata price. Fanya move.
              </p>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/[0.45]">Snapshot</p>
                <p className="mt-1 text-xl font-medium">Kenyan market pulse</p>
              </div>
              <div className="rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/50">
                Live
              </div>
            </div>
            <div className="mt-5 space-y-4 text-sm text-white/[0.68]">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <span>Stocks za sokoni</span>
                <span className="font-medium text-white">8 commodities</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <span>Update cadence</span>
                <span className="font-medium text-white">Real-time</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <span>Advice language</span>
                <span className="font-medium text-white">English + Swahili</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Access</span>
                <span className="font-medium text-white">Free kwa farmer</span>
              </div>
            </div>
          </aside>
        </section>

        <section id="live-prices" className="py-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/[0.45]">Live prices</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Ticker ya leo — no candlesticks, just clean cards.</h2>
            </div>
            <p className="hidden text-sm text-white/50 md:block">KES / metric prices</p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {liveQuotes.map((quote) => (
              <article key={quote.symbol} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/[0.45]">{quote.symbol}</p>
                    <h3 className="mt-2 text-xl font-medium">{quote.swahiliName}</h3>
                    <p className="mt-1 text-sm text-white/[0.48]">{quote.englishName}</p>
                  </div>
                  <div className={`trend-chip ${quote.direction}`}>
                    {quote.direction === 'up' ? '▲' : quote.direction === 'down' ? '▼' : '•'}
                  </div>
                </div>

                <div className="mt-8 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/[0.45]">Price</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                      {quote.price === null ? '—' : `KES ${quote.price.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-white/[0.45]">Change</p>
                    <p className={`mt-2 text-sm font-semibold ${quote.direction === 'up' ? 'text-[#1d9e75]' : quote.direction === 'down' ? 'text-red-500' : 'text-white/[0.55]'}`}>
                      {quote.change === null ? 'Waiting' : `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-white/58">
                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-white/[0.35]">Bid</p>
                    <p className="mt-1 font-medium text-white">{quote.bid === null ? '—' : quote.bid.toLocaleString('en-KE')}</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-white/[0.35]">Ask</p>
                    <p className="mt-1 font-medium text-white">{quote.ask === null ? '—' : quote.ask.toLocaleString('en-KE')}</p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-white/[0.35]">
                  {quote.updatedAt === null ? 'Waiting for websocket data...' : `Updated ${new Date(quote.updatedAt * 1000).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 py-16">
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/[0.45]">How it works</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {STEP_ITEMS.map((item) => (
              <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-semibold tracking-tight text-white/[0.35]">{item.icon}</div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
                <h3 className="mt-8 text-xl font-medium">{item.title}</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-white/[0.65]">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 px-5 py-6 text-center text-sm text-white/[0.45] sm:px-8">
        CropEx © 2026. Powered by real market data.
      </footer>
    </div>
  )
}

const styles = `
  html {
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    background: #000;
    color: #fff;
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: #666;
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.04);
  }

  .status-dot.connected {
    background: #1d9e75;
  }

  .status-dot.connecting {
    background: #777;
  }

  .status-dot.offline {
    background: #b91c1c;
  }

  .trend-chip {
    display: inline-flex;
    height: 2rem;
    width: 2rem;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.75rem;
  }

  .trend-chip.up {
    color: #1d9e75;
    background: rgba(29, 158, 117, 0.08);
  }

  .trend-chip.down {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
  }

  .trend-chip.flat {
    color: rgba(255, 255, 255, 0.65);
    background: rgba(255, 255, 255, 0.03);
  }
`

export default App
